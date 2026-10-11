//! Encrypted key-value store for small secrets the UI must persist, chiefly the Supabase
//! session (SPEC §4.4). Each value is sealed with HKDF(DEK, "kaisen/kv/v1") and bound to its
//! key through the AAD, so values cannot be swapped between keys.
//!
//! Until the database exists (M4) the sealed values live in `secure_kv.json` next to the key
//! file; M4 moves them into the `secure_kv` table.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use zeroize::Zeroizing;

use crate::crypto::aead::{open, seal};
use crate::error::{AppError, AppResult};

pub const MAX_KEY_LEN: usize = 200;
pub const MAX_VALUE_BYTES: usize = 64 * 1024;

pub struct SecureKv {
    path: PathBuf,
    /// Serialises read-modify-write of the file.
    lock: Mutex<()>,
}

impl SecureKv {
    pub const FILE_NAME: &'static str = "secure_kv.json";

    pub fn in_dir(dir: &Path) -> Self {
        Self {
            path: dir.join(Self::FILE_NAME),
            lock: Mutex::new(()),
        }
    }

    pub fn get(&self, kv_key: &[u8; 32], key: &str) -> AppResult<Option<Zeroizing<String>>> {
        validate_key(key)?;
        let _g = self
            .lock
            .lock()
            .map_err(|_| AppError::internal("secure_kv.mutex"))?;
        let Some(sealed) = self.load()?.remove(key) else {
            return Ok(None);
        };
        let blob = B64.decode(sealed).map_err(|_| AppError::Crypto)?;
        let plain = open(kv_key, &aad(key), &blob)?;
        let text = String::from_utf8(plain.to_vec()).map_err(|_| AppError::Crypto)?;
        Ok(Some(Zeroizing::new(text)))
    }

    pub fn set(&self, kv_key: &[u8; 32], key: &str, value: &str) -> AppResult<()> {
        validate_key(key)?;
        if value.len() > MAX_VALUE_BYTES {
            return Err(AppError::LimitReached {
                what: "secure value size".into(),
            });
        }
        let sealed = B64.encode(seal(kv_key, &aad(key), value.as_bytes())?);
        let _g = self
            .lock
            .lock()
            .map_err(|_| AppError::internal("secure_kv.mutex"))?;
        let mut map = self.load()?;
        map.insert(key.to_owned(), sealed);
        self.save(&map)
    }

    pub fn delete(&self, key: &str) -> AppResult<()> {
        validate_key(key)?;
        let _g = self
            .lock
            .lock()
            .map_err(|_| AppError::internal("secure_kv.mutex"))?;
        let mut map = self.load()?;
        if map.remove(key).is_some() {
            self.save(&map)?;
        }
        Ok(())
    }

    fn load(&self) -> AppResult<BTreeMap<String, String>> {
        match std::fs::read(&self.path) {
            Ok(bytes) => {
                serde_json::from_slice(&bytes).map_err(|_| AppError::internal("secure_kv.parse"))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(e.into()),
        }
    }

    fn save(&self, map: &BTreeMap<String, String>) -> AppResult<()> {
        let tmp = self.path.with_extension("json.tmp");
        let bytes =
            serde_json::to_vec(map).map_err(|_| AppError::internal("secure_kv.serialize"))?;
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

fn aad(key: &str) -> Vec<u8> {
    format!("kaisen|secure_kv|{key}").into_bytes()
}

fn validate_key(key: &str) -> AppResult<()> {
    let ok = !key.is_empty()
        && key.len() <= MAX_KEY_LEN
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:".contains(c));
    if ok {
        Ok(())
    } else {
        Err(AppError::Validation {
            field: "key".into(),
            msg: "Invalid storage key.".into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (SecureKv, PathBuf) {
        let dir = std::env::temp_dir().join(format!("kaisen-kv-{}", crate::error::short_id()));
        std::fs::create_dir_all(&dir).unwrap();
        (SecureKv::in_dir(&dir), dir)
    }

    #[test]
    fn round_trip_and_delete() {
        let (kv, dir) = store();
        let k = [9u8; 32];
        assert_eq!(kv.get(&k, "sb-session").unwrap(), None);
        kv.set(&k, "sb-session", "{\"token\":\"SECRET-MARKER\"}")
            .unwrap();
        assert_eq!(
            kv.get(&k, "sb-session").unwrap().unwrap().as_str(),
            "{\"token\":\"SECRET-MARKER\"}"
        );
        // Sealed on disk: no plaintext.
        let raw = std::fs::read_to_string(dir.join(SecureKv::FILE_NAME)).unwrap();
        assert!(!raw.contains("SECRET-MARKER"));
        kv.delete("sb-session").unwrap();
        assert_eq!(kv.get(&k, "sb-session").unwrap(), None);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn wrong_key_or_swapped_value_fails() {
        let (kv, dir) = store();
        kv.set(&[1u8; 32], "a", "one").unwrap();
        kv.set(&[1u8; 32], "b", "two").unwrap();
        assert_eq!(kv.get(&[2u8; 32], "a").unwrap_err(), AppError::Crypto);
        // Move b's ciphertext under key a: the AAD binding rejects it.
        let path = dir.join(SecureKv::FILE_NAME);
        let mut map: BTreeMap<String, String> =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let b = map["b"].clone();
        map.insert("a".into(), b);
        std::fs::write(&path, serde_json::to_vec(&map).unwrap()).unwrap();
        assert_eq!(kv.get(&[1u8; 32], "a").unwrap_err(), AppError::Crypto);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn validates_keys_and_sizes() {
        let (kv, dir) = store();
        assert!(matches!(
            kv.get(&[0u8; 32], "../etc").unwrap_err(),
            AppError::Validation { .. }
        ));
        assert!(matches!(
            kv.set(&[0u8; 32], "", "x").unwrap_err(),
            AppError::Validation { .. }
        ));
        let big = "x".repeat(MAX_VALUE_BYTES + 1);
        assert!(matches!(
            kv.set(&[0u8; 32], "k", &big).unwrap_err(),
            AppError::LimitReached { .. }
        ));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
