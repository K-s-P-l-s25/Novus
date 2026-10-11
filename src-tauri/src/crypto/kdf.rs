//! Argon2id passphrase KDF and HKDF-SHA256 sub-keys (SPEC §5.2, §5.3).

use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use ts_rs::TS;
use zeroize::Zeroizing;

use super::CryptoError;

/// Domain-separation labels for sub-keys derived from the DEK (SPEC §5.2).
pub mod labels {
    pub const DB: &str = "kaisen/db/v1";
    pub const SYNC: &str = "kaisen/sync/v1";
    pub const BLOB: &str = "kaisen/blob/v1";
    pub const BACKUP: &str = "kaisen/backup/v1";
    pub const KV: &str = "kaisen/kv/v1";
    /// Verifies that an unwrapped DEK is the right one (`user_keys.key_check`).
    pub const CHECK: &str = "kaisen/check/v1";
    /// Turns the random recovery key into the key that wraps the DEK.
    pub const RECOVERY: &str = "kaisen/recovery/v1";
}

/// Argon2id cost parameters, stored in `user_keys.kdf_params` (SPEC Appendix B).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct KdfParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

/// Spec default (§5.3). Spike S6 decides whether phones need 32 MiB instead.
pub const DEFAULT_KDF: KdfParams = KdfParams {
    m_kib: 65_536,
    t: 3,
    p: 1,
};

impl KdfParams {
    /// Parameters come back from the server, so they are range-checked: too weak would
    /// undermine the passphrase, too large could hang or crash a phone.
    pub fn validate(&self) -> Result<(), CryptoError> {
        let ok = (8_192..=1_048_576).contains(&self.m_kib)
            && (1..=10).contains(&self.t)
            && (1..=4).contains(&self.p);
        if ok {
            Ok(())
        } else {
            Err(CryptoError::InvalidParams)
        }
    }
}

/// Derives a 32-byte key-encryption key from a passphrase.
pub fn derive_kek(
    passphrase: &[u8],
    salt: &[u8],
    k: &KdfParams,
) -> Result<Zeroizing<[u8; 32]>, CryptoError> {
    k.validate()?;
    let params = Params::new(k.m_kib, k.t, k.p, Some(32)).map_err(|_| CryptoError::Kdf)?;
    let mut out = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase, salt, &mut *out)
        .map_err(|_| CryptoError::Kdf)?;
    Ok(out)
}

/// HKDF-SHA256 expand of `ikm` (a uniformly random 32-byte key) for one purpose.
pub fn subkey(ikm: &[u8; 32], label: &str) -> Result<Zeroizing<[u8; 32]>, CryptoError> {
    let mut out = Zeroizing::new([0u8; 32]);
    Hkdf::<Sha256>::new(None, ikm)
        .expand(label.as_bytes(), &mut *out)
        .map_err(|_| CryptoError::Kdf)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    /// RFC 5869, Test Case 1: pins the HKDF-SHA256 implementation.
    #[test]
    fn hkdf_rfc5869_case_1() {
        let ikm = [0x0bu8; 22];
        let salt = hex("000102030405060708090a0b0c");
        let info = hex("f0f1f2f3f4f5f6f7f8f9");
        let mut okm = [0u8; 42];
        Hkdf::<Sha256>::new(Some(&salt), &ikm)
            .expand(&info, &mut okm)
            .unwrap();
        assert_eq!(
            okm.to_vec(),
            hex("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865")
        );
    }

    /// Expected values computed independently (Python hmac/hashlib) for DEK = 00..1f.
    #[test]
    fn subkey_labels_vectors() {
        let dek: [u8; 32] = core::array::from_fn(|i| i as u8);
        let cases = [
            (
                labels::DB,
                "2c39c4eff7451bc3b4d57236917e2f4f1954e190e299e8ac2030a78ff4b0b87d",
            ),
            (
                labels::SYNC,
                "4cfb3f38f571b81243eb8af022dcf23c857126a54a9782b45d17306be9ae2f34",
            ),
            (
                labels::BLOB,
                "ad154c9f84d8ca53b90e419a41e151f19e680f7f3f4a0d11d8a9b9d4386e2f89",
            ),
            (
                labels::BACKUP,
                "f0066c963bac6c8ef96cb7c74d188aed1da6a8ba0cff9fba1eea9d3d39f6d6de",
            ),
            (
                labels::KV,
                "c3c4b669c3ed5e78b4d5269b175babc22d6d540870ec8655b86ab9791f244b76",
            ),
        ];
        for (label, expected) in cases {
            assert_eq!(
                subkey(&dek, label).unwrap().to_vec(),
                hex(expected),
                "{label}"
            );
        }
    }

    /// Expected value computed independently with argon2-cffi (hash_secret_raw, Type.ID).
    #[test]
    fn argon2id_vector() {
        let k = KdfParams {
            m_kib: 8_192,
            t: 1,
            p: 1,
        };
        let kek = derive_kek(b"pass", &[0u8; 16], &k).unwrap();
        assert_eq!(
            kek.to_vec(),
            hex("cd895019afac47ce44b9e5556b58415d25225078977d9f11952c75f5d5cf467e")
        );
    }

    #[test]
    fn params_are_range_checked() {
        assert!(DEFAULT_KDF.validate().is_ok());
        assert!(KdfParams {
            m_kib: 32_768,
            t: 3,
            p: 1
        }
        .validate()
        .is_ok());
        for bad in [
            KdfParams {
                m_kib: 64,
                t: 3,
                p: 1,
            },
            KdfParams {
                m_kib: 65_536,
                t: 0,
                p: 1,
            },
            KdfParams {
                m_kib: 65_536,
                t: 3,
                p: 64,
            },
            KdfParams {
                m_kib: 4_000_000,
                t: 3,
                p: 1,
            },
        ] {
            assert_eq!(
                derive_kek(b"x", &[0u8; 16], &bad),
                Err(CryptoError::InvalidParams)
            );
        }
    }
}
