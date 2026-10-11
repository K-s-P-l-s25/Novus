//! The key hierarchy (SPEC §5.2).
//!
//! A random 256-bit DEK is generated once. It is stored only wrapped: by a KEK derived from
//! the master passphrase (Argon2id) and by a KEK derived from the recovery key (HKDF). The
//! wrapped form is the `user_keys` row, which is safe to keep on disk and in Supabase.
//! While unlocked the DEK lives only in [`KeyStore`]; locking drops and zeroes it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use ts_rs::TS;
use zeroize::Zeroizing;

use super::aead::{open, seal};
use super::kdf::{derive_kek, labels, subkey, KdfParams};
use super::{random_bytes, recovery, CryptoError};
use crate::error::AppError;

pub type Dek = Zeroizing<[u8; 32]>;

pub const USER_KEYS_VERSION: u16 = 1;
const SALT_LEN: usize = 16;
const AAD_DEK_PASS: &[u8] = b"kaisen|user_keys|dek_pass|v1";
const AAD_DEK_RECOVERY: &[u8] = b"kaisen|user_keys|dek_recovery|v1";
const AAD_KEY_CHECK: &[u8] = b"kaisen|user_keys|key_check|v1";
const KEY_CHECK_PLAINTEXT: &[u8] = b"kaisen-key-check-v1";

/// Mirror of the Supabase `user_keys` row (SPEC Appendix B). Only ciphertext, salt and
/// parameters: useless without the passphrase or the recovery key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UserKeysRow {
    pub kdf: String,
    pub kdf_params: KdfParams,
    /// base64
    pub salt: String,
    /// base64(nonce ‖ ciphertext)
    pub wrapped_dek_pass: String,
    /// base64(nonce ‖ ciphertext)
    pub wrapped_dek_recovery: Option<String>,
    /// base64(nonce ‖ ciphertext) of a constant, sealed with HKDF(DEK, "kaisen/check/v1")
    pub key_check: String,
    pub version: u16,
}

/// Why a key operation was refused, mapped to content-free `AppError`s.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyError {
    WrongPassphrase,
    WrongRecoveryKey,
    BadRecoveryKeyFormat,
    CorruptRow,
    Crypto(CryptoError),
}

impl From<CryptoError> for KeyError {
    fn from(e: CryptoError) -> Self {
        KeyError::Crypto(e)
    }
}

impl From<KeyError> for AppError {
    fn from(e: KeyError) -> Self {
        let v = |field: &str, msg: &str| AppError::Validation {
            field: field.into(),
            msg: msg.into(),
        };
        match e {
            KeyError::WrongPassphrase => v("passphrase", "That passphrase is not correct."),
            KeyError::WrongRecoveryKey => v(
                "recovery_key",
                "That recovery key does not unlock this account.",
            ),
            KeyError::BadRecoveryKeyFormat => {
                v("recovery_key", "Check the recovery key for typos.")
            }
            KeyError::CorruptRow => {
                tracing::warn!("user_keys row is malformed or fails its key check");
                AppError::Crypto
            }
            KeyError::Crypto(c) => c.into(),
        }
    }
}

/// Creates the DEK and its `user_keys` row. Returns the row, the printable recovery key
/// (shown once) and the DEK.
pub fn bootstrap(
    passphrase: &[u8],
    params: KdfParams,
) -> Result<(UserKeysRow, Zeroizing<String>, Dek), KeyError> {
    let mut dek = Zeroizing::new([0u8; 32]);
    random_bytes(&mut *dek)?;
    let (rec_key, rec_text) = recovery::generate()?;
    let mut salt = [0u8; SALT_LEN];
    random_bytes(&mut salt)?;

    let kek = derive_kek(passphrase, &salt, &params)?;
    let kek_r = subkey(&rec_key, labels::RECOVERY)?;
    let check_key = subkey(&dek, labels::CHECK)?;
    let row = UserKeysRow {
        kdf: "argon2id".into(),
        kdf_params: params,
        salt: B64.encode(salt),
        wrapped_dek_pass: B64.encode(seal(&kek, AAD_DEK_PASS, &*dek)?),
        wrapped_dek_recovery: Some(B64.encode(seal(&kek_r, AAD_DEK_RECOVERY, &*dek)?)),
        key_check: B64.encode(seal(&check_key, AAD_KEY_CHECK, KEY_CHECK_PLAINTEXT)?),
        version: USER_KEYS_VERSION,
    };
    Ok((row, rec_text, dek))
}

pub fn unwrap_with_passphrase(row: &UserKeysRow, passphrase: &[u8]) -> Result<Dek, KeyError> {
    check_row_shape(row)?;
    let salt = b64(&row.salt)?;
    let kek = derive_kek(passphrase, &salt, &row.kdf_params)?;
    let dek = open(&kek, AAD_DEK_PASS, &b64(&row.wrapped_dek_pass)?)
        .map_err(|_| KeyError::WrongPassphrase)?;
    finish_unwrap(row, &dek)
}

pub fn unwrap_with_recovery(row: &UserKeysRow, recovery_text: &str) -> Result<Dek, KeyError> {
    check_row_shape(row)?;
    let rec_key = recovery::decode(recovery_text).map_err(|_| KeyError::BadRecoveryKeyFormat)?;
    let wrapped = row
        .wrapped_dek_recovery
        .as_deref()
        .ok_or(KeyError::WrongRecoveryKey)?;
    let kek_r = subkey(&rec_key, labels::RECOVERY)?;
    let dek =
        open(&kek_r, AAD_DEK_RECOVERY, &b64(wrapped)?).map_err(|_| KeyError::WrongRecoveryKey)?;
    finish_unwrap(row, &dek)
}

/// Re-wraps the DEK under a new passphrase (fresh salt). No data is re-encrypted.
pub fn rewrap_passphrase(
    row: &UserKeysRow,
    dek: &[u8; 32],
    new_passphrase: &[u8],
) -> Result<UserKeysRow, KeyError> {
    let mut salt = [0u8; SALT_LEN];
    random_bytes(&mut salt)?;
    let kek = derive_kek(new_passphrase, &salt, &row.kdf_params)?;
    Ok(UserKeysRow {
        salt: B64.encode(salt),
        wrapped_dek_pass: B64.encode(seal(&kek, AAD_DEK_PASS, dek)?),
        ..row.clone()
    })
}

/// Replaces the recovery key. The old recovery key stops working.
pub fn rewrap_recovery(
    row: &UserKeysRow,
    dek: &[u8; 32],
) -> Result<(UserKeysRow, Zeroizing<String>), KeyError> {
    let (rec_key, rec_text) = recovery::generate()?;
    let kek_r = subkey(&rec_key, labels::RECOVERY)?;
    let new_row = UserKeysRow {
        wrapped_dek_recovery: Some(B64.encode(seal(&kek_r, AAD_DEK_RECOVERY, dek)?)),
        ..row.clone()
    };
    Ok((new_row, rec_text))
}

fn check_row_shape(row: &UserKeysRow) -> Result<(), KeyError> {
    if row.kdf != "argon2id" || row.version != USER_KEYS_VERSION {
        return Err(KeyError::CorruptRow);
    }
    Ok(())
}

fn finish_unwrap(row: &UserKeysRow, dek_bytes: &[u8]) -> Result<Dek, KeyError> {
    let arr: [u8; 32] = dek_bytes.try_into().map_err(|_| KeyError::CorruptRow)?;
    let dek = Zeroizing::new(arr);
    let check_key = subkey(&dek, labels::CHECK)?;
    let check =
        open(&check_key, AAD_KEY_CHECK, &b64(&row.key_check)?).map_err(|_| KeyError::CorruptRow)?;
    if !bool::from(check.as_slice().ct_eq(KEY_CHECK_PLAINTEXT)) {
        return Err(KeyError::CorruptRow);
    }
    Ok(dek)
}

fn b64(s: &str) -> Result<Vec<u8>, KeyError> {
    B64.decode(s).map_err(|_| KeyError::CorruptRow)
}

/// Holds the DEK while unlocked. Locking drops it, and `Zeroizing` wipes the memory.
#[derive(Default)]
pub struct KeyStore {
    dek: Mutex<Option<Dek>>,
}

impl KeyStore {
    pub fn is_unlocked(&self) -> bool {
        self.dek.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    pub fn set(&self, dek: Dek) {
        if let Ok(mut g) = self.dek.lock() {
            *g = Some(dek);
        }
    }

    /// Zeroes and forgets the DEK. Every key-dependent command returns `Locked` afterwards.
    pub fn lock(&self) {
        if let Ok(mut g) = self.dek.lock() {
            *g = None;
        }
    }

    /// Runs `f` with the DEK, or fails with `Locked`.
    pub fn with_dek<T>(
        &self,
        f: impl FnOnce(&[u8; 32]) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let g = self
            .dek
            .lock()
            .map_err(|_| AppError::internal("keys.mutex"))?;
        match g.as_ref() {
            Some(dek) => f(dek),
            None => Err(AppError::Locked),
        }
    }

    /// Derives a purpose sub-key (e.g. `labels::SYNC`). Fails with `Locked` when locked.
    pub fn subkey(&self, label: &str) -> Result<Zeroizing<[u8; 32]>, AppError> {
        self.with_dek(|dek| subkey(dek, label).map_err(AppError::from))
    }
}

/// Local copy of the `user_keys` row so the app unlocks offline (SPEC §4.3 "Daily use").
/// It lives next to the database, outside it, because the database key is derived from it.
pub struct KeyFile {
    path: PathBuf,
}

impl KeyFile {
    pub const FILE_NAME: &'static str = "user_keys.json";

    pub fn in_dir(dir: &Path) -> Self {
        Self {
            path: dir.join(Self::FILE_NAME),
        }
    }

    pub fn exists(&self) -> bool {
        self.path.is_file()
    }

    pub fn load(&self) -> Result<Option<UserKeysRow>, AppError> {
        match std::fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|_| AppError::internal("keyfile.parse")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Atomic replace: write a temp file, then rename over the old one.
    pub fn save(&self, row: &UserKeysRow) -> Result<(), AppError> {
        let tmp = self.path.with_extension("json.tmp");
        let bytes =
            serde_json::to_vec_pretty(row).map_err(|_| AppError::internal("keyfile.serialize"))?;
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::kdf::labels;

    /// Cheap parameters so the suite stays fast; production uses DEFAULT_KDF.
    const TEST_KDF: KdfParams = KdfParams {
        m_kib: 8_192,
        t: 1,
        p: 1,
    };
    const PASS: &[u8] = b"orbit lantern pebble justice marrow";

    #[test]
    fn bootstrap_then_unlock_with_passphrase_and_recovery() {
        let (row, rec, dek) = bootstrap(PASS, TEST_KDF).unwrap();
        assert_eq!(*unwrap_with_passphrase(&row, PASS).unwrap(), *dek);
        assert_eq!(
            *unwrap_with_recovery(&row, &rec).unwrap(),
            *dek,
            "recovery key unwraps the DEK"
        );
    }

    #[test]
    fn wrong_secrets_are_rejected() {
        let (row, rec, _) = bootstrap(PASS, TEST_KDF).unwrap();
        assert_eq!(
            unwrap_with_passphrase(&row, b"wrong passphrase").unwrap_err(),
            KeyError::WrongPassphrase
        );
        let (other_row, other_rec, _) = bootstrap(PASS, TEST_KDF).unwrap();
        assert_eq!(
            unwrap_with_recovery(&row, &other_rec).unwrap_err(),
            KeyError::WrongRecoveryKey
        );
        assert_eq!(
            unwrap_with_recovery(&row, "garbage").unwrap_err(),
            KeyError::BadRecoveryKeyFormat
        );
        assert!(unwrap_with_recovery(&other_row, &rec).is_err());
    }

    #[test]
    fn tampered_rows_are_rejected() {
        let (row, rec, _) = bootstrap(PASS, TEST_KDF).unwrap();
        // Flip one bit in the wrapped DEK.
        let mut bytes = B64.decode(&row.wrapped_dek_pass).unwrap();
        bytes[30] ^= 0x01;
        let bad = UserKeysRow {
            wrapped_dek_pass: B64.encode(&bytes),
            ..row.clone()
        };
        assert_eq!(
            unwrap_with_passphrase(&bad, PASS).unwrap_err(),
            KeyError::WrongPassphrase
        );
        // A key_check from another account does not verify this DEK.
        let (other, _, _) = bootstrap(PASS, TEST_KDF).unwrap();
        let swapped = UserKeysRow {
            key_check: other.key_check,
            ..row.clone()
        };
        assert_eq!(
            unwrap_with_passphrase(&swapped, PASS).unwrap_err(),
            KeyError::CorruptRow
        );
        // The wrapped DEK cannot be moved into the recovery slot (different AAD).
        let moved = UserKeysRow {
            wrapped_dek_recovery: Some(row.wrapped_dek_pass.clone()),
            ..row.clone()
        };
        assert_eq!(
            unwrap_with_recovery(&moved, &rec).unwrap_err(),
            KeyError::WrongRecoveryKey
        );
        // Unknown versions are refused rather than guessed at.
        let future = UserKeysRow { version: 2, ..row };
        assert_eq!(
            unwrap_with_passphrase(&future, PASS).unwrap_err(),
            KeyError::CorruptRow
        );
    }

    #[test]
    fn passphrase_change_keeps_old_data_readable() {
        let (row, _, dek) = bootstrap(PASS, TEST_KDF).unwrap();
        let sync_key = subkey(&dek, labels::SYNC).unwrap();
        let old_record = seal(&sync_key, b"kaisen|note_content|n1|h1|1", b"old note").unwrap();

        let new_pass = b"a completely different passphrase 42";
        let new_row = rewrap_passphrase(&row, &dek, new_pass).unwrap();
        assert_ne!(new_row.salt, row.salt);
        assert_eq!(new_row.wrapped_dek_recovery, row.wrapped_dek_recovery);

        assert_eq!(
            unwrap_with_passphrase(&new_row, PASS).unwrap_err(),
            KeyError::WrongPassphrase
        );
        let dek2 = unwrap_with_passphrase(&new_row, new_pass).unwrap();
        let sync_key2 = subkey(&dek2, labels::SYNC).unwrap();
        assert_eq!(
            &open(&sync_key2, b"kaisen|note_content|n1|h1|1", &old_record).unwrap()[..],
            b"old note"
        );
    }

    #[test]
    fn regenerating_recovery_invalidates_the_old_key() {
        let (row, old_rec, dek) = bootstrap(PASS, TEST_KDF).unwrap();
        let (new_row, new_rec) = rewrap_recovery(&row, &dek).unwrap();
        assert_ne!(*old_rec, *new_rec);
        assert_eq!(
            unwrap_with_recovery(&new_row, &old_rec).unwrap_err(),
            KeyError::WrongRecoveryKey
        );
        assert_eq!(*unwrap_with_recovery(&new_row, &new_rec).unwrap(), *dek);
        assert_eq!(*unwrap_with_passphrase(&new_row, PASS).unwrap(), *dek);
    }

    #[test]
    fn lock_forgets_the_key() {
        let store = KeyStore::default();
        assert_eq!(store.subkey(labels::DB).unwrap_err(), AppError::Locked);
        let (_, _, dek) = bootstrap(PASS, TEST_KDF).unwrap();
        let expected = subkey(&dek, labels::DB).unwrap();
        store.set(dek);
        assert!(store.is_unlocked());
        assert_eq!(*store.subkey(labels::DB).unwrap(), *expected);
        store.lock();
        assert!(!store.is_unlocked());
        assert_eq!(store.subkey(labels::DB).unwrap_err(), AppError::Locked);
        assert_eq!(store.with_dek(|_| Ok(())).unwrap_err(), AppError::Locked);
    }

    #[test]
    fn keyfile_round_trip() {
        let dir = std::env::temp_dir().join(format!("kaisen-keyfile-{}", crate::error::short_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let kf = KeyFile::in_dir(&dir);
        assert!(!kf.exists());
        assert_eq!(kf.load().unwrap(), None);
        let (row, _, _) = bootstrap(PASS, TEST_KDF).unwrap();
        kf.save(&row).unwrap();
        assert_eq!(kf.load().unwrap(), Some(row));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn row_contains_no_plaintext_secrets() {
        let (row, rec, dek) = bootstrap(PASS, TEST_KDF).unwrap();
        let json = serde_json::to_string(&row).unwrap();
        assert!(!json.contains("orbit"));
        assert!(!json.contains(rec.as_str()));
        assert!(!json.contains(&B64.encode(*dek)));
    }
}
