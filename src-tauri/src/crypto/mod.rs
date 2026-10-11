//! Cryptography (SPEC §5). All key material stays in Rust, wrapped in `Zeroizing`.
//!
//! - `aead`: XChaCha20-Poly1305 sealing with AAD binding (§5.3, §5.4).
//! - `kdf`: Argon2id passphrase KDF and HKDF-SHA256 sub-keys (§5.2).
//! - `recovery`: the printable recovery key format.
//! - `keys`: the DEK hierarchy, the `user_keys` row and the in-memory key store.
//! - `strength`: passphrase strength estimate (★ S12).

pub mod aead;
pub mod kdf;
pub mod keys;
pub mod recovery;
pub mod strength;

use crate::error::AppError;

/// Low-level crypto failures. Content-free by construction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum CryptoError {
    #[error("key derivation failed")]
    Kdf,
    #[error("invalid key derivation parameters")]
    InvalidParams,
    #[error("sealing failed")]
    Seal,
    #[error("authentication failed")]
    Open,
    #[error("malformed ciphertext")]
    Malformed,
    #[error("system randomness unavailable")]
    Rng,
}

impl From<CryptoError> for AppError {
    fn from(e: CryptoError) -> Self {
        tracing::warn!(crypto_error = ?e, "crypto error");
        match e {
            CryptoError::InvalidParams => AppError::Validation {
                field: "kdf_params".into(),
                msg: "Key derivation parameters are out of range.".into(),
            },
            _ => AppError::Crypto,
        }
    }
}

/// Fills `buf` from the operating system's CSPRNG (never a userspace PRNG; SPEC §5.3).
pub fn random_bytes(buf: &mut [u8]) -> Result<(), CryptoError> {
    use rand::TryRng;
    rand::rngs::SysRng
        .try_fill_bytes(buf)
        .map_err(|_| CryptoError::Rng)
}
