//! The printable recovery key (SPEC §5.2): 256 random bits plus a 16-bit checksum,
//! written in Crockford base32 as 11 groups of 5 characters so typos are caught.

use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::{random_bytes, CryptoError};

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_LEN: usize = 32;
const PAYLOAD_LEN: usize = KEY_LEN + 2;
/// ceil(34 * 8 / 5)
const ENCODED_LEN: usize = 55;
const GROUP: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum RecoveryKeyError {
    #[error("recovery key has the wrong length or characters")]
    Format,
    #[error("recovery key checksum does not match")]
    Checksum,
}

/// Generates a fresh recovery key: the raw 32 bytes and their printable form.
pub fn generate() -> Result<(Zeroizing<[u8; KEY_LEN]>, Zeroizing<String>), CryptoError> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    random_bytes(&mut *key)?;
    let text = encode(&key);
    Ok((key, text))
}

pub fn encode(key: &[u8; KEY_LEN]) -> Zeroizing<String> {
    let mut payload = Zeroizing::new([0u8; PAYLOAD_LEN]);
    payload[..KEY_LEN].copy_from_slice(key);
    payload[KEY_LEN..].copy_from_slice(&checksum(key));

    let mut chars = Zeroizing::new(Vec::with_capacity(ENCODED_LEN));
    let (mut acc, mut bits) = (0u32, 0u32);
    for &b in payload.iter() {
        acc = (acc << 8) | u32::from(b);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            chars.push(ALPHABET[((acc >> bits) & 31) as usize]);
        }
        acc &= (1 << bits) - 1;
    }
    if bits > 0 {
        chars.push(ALPHABET[((acc << (5 - bits)) & 31) as usize]);
    }

    let mut out = Zeroizing::new(String::with_capacity(ENCODED_LEN + ENCODED_LEN / GROUP));
    for (i, c) in chars.iter().enumerate() {
        if i > 0 && i % GROUP == 0 {
            out.push('-');
        }
        out.push(char::from(*c));
    }
    out
}

/// Parses a recovery key typed by a person: case-insensitive, ignores spaces and dashes,
/// and reads O as 0 and I/L as 1 (Crockford).
pub fn decode(text: &str) -> Result<Zeroizing<[u8; KEY_LEN]>, RecoveryKeyError> {
    let mut acc = 0u32;
    let mut bits = 0u32;
    let mut count = 0usize;
    let mut payload = Zeroizing::new([0u8; PAYLOAD_LEN]);
    let mut filled = 0usize;
    for c in text.chars() {
        if c == '-' || c.is_whitespace() {
            continue;
        }
        let v = value(c).ok_or(RecoveryKeyError::Format)?;
        count += 1;
        if count > ENCODED_LEN {
            return Err(RecoveryKeyError::Format);
        }
        acc = (acc << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            if filled < PAYLOAD_LEN {
                payload[filled] = (acc >> bits) as u8;
                filled += 1;
            }
            acc &= (1 << bits) - 1;
        }
    }
    if count != ENCODED_LEN || filled != PAYLOAD_LEN || acc != 0 {
        return Err(RecoveryKeyError::Format);
    }
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(&payload[..KEY_LEN]);
    if payload[KEY_LEN..] != checksum(&key) {
        return Err(RecoveryKeyError::Checksum);
    }
    Ok(key)
}

fn value(c: char) -> Option<u32> {
    let c = match c.to_ascii_uppercase() {
        'O' => '0',
        'I' | 'L' => '1',
        other => other,
    };
    ALPHABET
        .iter()
        .position(|&a| char::from(a) == c)
        .map(|p| p as u32)
}

fn checksum(key: &[u8; KEY_LEN]) -> [u8; 2] {
    let d = Sha256::new_with_prefix(b"kaisen/recovery-checksum/v1")
        .chain_update(key)
        .finalize();
    [d[0], d[1]]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_is_grouped() {
        let (key, text) = generate().unwrap();
        assert_eq!(text.len(), 55 + 10);
        assert!(text.split('-').all(|g| g.len() == 5));
        assert_eq!(*decode(&text).unwrap(), *key);
    }

    #[test]
    fn tolerates_case_spaces_and_lookalikes() {
        let key = [0u8; 32];
        let text = encode(&key);
        let messy = text.to_lowercase().replace('-', " ").replace('0', "o");
        assert_eq!(*decode(&messy).unwrap(), key);
    }

    #[test]
    fn detects_typos() {
        let key: [u8; 32] = core::array::from_fn(|i| (i * 7) as u8);
        let text = encode(&key).to_string();
        // Change one character to a different valid one.
        let mut chars: Vec<char> = text.chars().collect();
        chars[3] = if chars[3] == 'A' { 'B' } else { 'A' };
        let typo: String = chars.into_iter().collect();
        assert!(decode(&typo).is_err());
        assert_eq!(
            decode(&text[..text.len() - 1]),
            Err(RecoveryKeyError::Format)
        );
        assert_eq!(decode("not a key"), Err(RecoveryKeyError::Format));
        assert_eq!(decode(&format!("{text}A")), Err(RecoveryKeyError::Format));
    }
}
