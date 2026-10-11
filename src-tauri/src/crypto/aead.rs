//! XChaCha20-Poly1305 with a random 24-byte nonce. Format: `nonce(24) ‖ ciphertext ‖ tag(16)`.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use zeroize::Zeroizing;

use super::{random_bytes, CryptoError};

pub const NONCE_LEN: usize = 24;
pub const TAG_LEN: usize = 16;

/// Seals `plaintext` under `key`, binding it to `aad`.
pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let mut nonce = [0u8; NONCE_LEN];
    random_bytes(&mut nonce)?;
    seal_with_nonce(key, &nonce, aad, plaintext)
}

pub(crate) fn seal_with_nonce(
    key: &[u8; 32],
    nonce: &[u8; NONCE_LEN],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new(&(*key).into());
    let ct = cipher
        .encrypt(
            &XNonce::from(*nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| CryptoError::Seal)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Opens a blob produced by [`seal`]. Fails on a wrong key, wrong AAD or any modified byte.
pub fn open(key: &[u8; 32], aad: &[u8], blob: &[u8]) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
    if blob.len() < NONCE_LEN + TAG_LEN {
        return Err(CryptoError::Malformed);
    }
    let (nonce, ct) = blob.split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| CryptoError::Malformed)?;
    let cipher = XChaCha20Poly1305::new(&(*key).into());
    cipher
        .decrypt(&XNonce::from(nonce), Payload { msg: ct, aad })
        .map(Zeroizing::new)
        .map_err(|_| CryptoError::Open)
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

    /// draft-irtf-cfrg-xchacha-03, Appendix A.3.1 (AEAD_XChaCha20_Poly1305).
    #[test]
    fn xchacha20poly1305_test_vector() {
        let key: [u8; 32] = hex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f")
            .try_into()
            .unwrap();
        let nonce: [u8; 24] = hex("404142434445464748494a4b4c4d4e4f5051525354555657")
            .try_into()
            .unwrap();
        let aad = hex("50515253c0c1c2c3c4c5c6c7");
        let pt = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let expected_ct = hex(concat!(
            "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb",
            "731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452",
            "2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9",
            "21f9664c97637da9768812f615c68b13b52e",
            "c0875924c1c7987947deafd8780acf49"
        ));
        let blob = seal_with_nonce(&key, &nonce, &aad, pt).unwrap();
        assert_eq!(&blob[..24], &nonce);
        assert_eq!(&blob[24..], &expected_ct[..]);
        assert_eq!(&open(&key, &aad, &blob).unwrap()[..], pt);
    }

    #[test]
    fn round_trip_and_fresh_nonces() {
        let key = [7u8; 32];
        let a = seal(&key, b"aad", b"hello").unwrap();
        let b = seal(&key, b"aad", b"hello").unwrap();
        assert_ne!(a, b, "each seal uses a new random nonce");
        assert_eq!(&open(&key, b"aad", &a).unwrap()[..], b"hello");
    }

    #[test]
    fn wrong_key_fails() {
        let blob = seal(&[1u8; 32], b"aad", b"secret").unwrap();
        assert_eq!(open(&[2u8; 32], b"aad", &blob), Err(CryptoError::Open));
    }

    #[test]
    fn wrong_aad_fails() {
        let blob = seal(&[1u8; 32], b"kaisen|note_content|a|hlc1|1", b"secret").unwrap();
        assert_eq!(
            open(&[1u8; 32], b"kaisen|note_content|b|hlc1|1", &blob),
            Err(CryptoError::Open)
        );
    }

    #[test]
    fn every_flipped_bit_fails() {
        let key = [3u8; 32];
        let blob = seal(&key, b"aad", b"tamper me").unwrap();
        for byte in 0..blob.len() {
            for bit in 0..8 {
                let mut t = blob.clone();
                t[byte] ^= 1 << bit;
                assert!(
                    open(&key, b"aad", &t).is_err(),
                    "flip at byte {byte} bit {bit} was accepted"
                );
            }
        }
    }

    #[test]
    fn truncated_input_is_malformed() {
        assert_eq!(
            open(&[0u8; 32], b"", &[0u8; 39]),
            Err(CryptoError::Malformed)
        );
        let blob = seal(&[0u8; 32], b"", b"").unwrap();
        assert_eq!(blob.len(), 40);
        assert!(open(&[0u8; 32], b"", &blob[..39]).is_err());
    }
}
