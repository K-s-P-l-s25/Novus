//! Passphrase strength estimate (★ S12, wired in M2).
//!
//! Deliberately conservative: it estimates guessing entropy from character classes,
//! but credits word-based passphrases per word (as if drawn from a 7,776-word list),
//! and penalises repeats, keyboard/alphabet sequences and very common passwords.
//! The result never echoes the passphrase; hints are fixed codes.

use serde::Serialize;
use ts_rs::TS;

pub const MIN_CHARS: usize = 12;
/// Minimum estimated entropy to accept a master passphrase. With Argon2id at 64 MiB
/// every guess is expensive, so ~50 bits is out of reach of offline attacks for one user.
pub const MIN_BITS: f64 = 50.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub enum StrengthHint {
    TooShort,
    CommonPassword,
    RepeatedCharacters,
    Sequence,
    SingleCharacterType,
    AddAnotherWord,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct PassphraseStrength {
    /// 0 (very weak) … 4 (very strong).
    pub score: u8,
    /// Estimated guessing entropy, rounded down.
    pub bits: u32,
    /// Whether KAISEN will accept it as a master passphrase.
    pub acceptable: bool,
    pub hints: Vec<StrengthHint>,
}

const COMMON: &[&str] = &[
    "password",
    "passw0rd",
    "123456",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty",
    "qwertyuiop",
    "letmein",
    "welcome",
    "iloveyou",
    "admin",
    "abc123",
    "monkey",
    "dragon",
    "football",
    "baseball",
    "sunshine",
    "princess",
    "trustno1",
    "master",
    "shadow",
    "superman",
    "michael",
    "starwars",
    "whatever",
    "freedom",
    "hello",
    "secret",
    "login",
    "changeme",
    "kaisen",
    "correcthorsebatterystaple",
];

const SEQUENCES: &[&str] = &[
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
];

pub fn estimate(passphrase: &str) -> PassphraseStrength {
    let mut hints = Vec::new();
    let chars: Vec<char> = passphrase.chars().collect();
    let lower: String = passphrase.to_lowercase();
    let squashed: String = lower.chars().filter(|c| c.is_alphanumeric()).collect();

    if chars.len() < MIN_CHARS {
        hints.push(StrengthHint::TooShort);
    }

    // Character-class estimate on an "effective" length that discounts repeats and runs.
    let (repeat_loss, has_repeats) = repeated_chars(&chars);
    let (seq_loss, has_seq) = sequence_chars(&lower);
    if has_repeats {
        hints.push(StrengthHint::RepeatedCharacters);
    }
    if has_seq {
        hints.push(StrengthHint::Sequence);
    }
    let effective = chars.len().saturating_sub(repeat_loss + seq_loss) as f64;
    let pool = charset_size(&chars);
    let classes = class_count(&chars);
    if classes == 1 && chars.len() < 20 {
        hints.push(StrengthHint::SingleCharacterType);
    }
    let mut bits = effective * f64::from(pool).log2();

    // Word-based passphrases: credit ~12.9 bits per word, whichever estimate is lower.
    let words: Vec<&str> = lower
        .split(|c: char| c.is_whitespace() || "-_.,+".contains(c))
        .filter(|w| !w.is_empty())
        .collect();
    if words.len() >= 2 {
        let per_word: f64 = words
            .iter()
            .map(|w| {
                if w.chars().all(|c| c.is_ascii_lowercase()) {
                    7_776f64.log2()
                } else {
                    w.chars().count() as f64
                        * f64::from(charset_size(&w.chars().collect::<Vec<_>>())).log2()
                }
            })
            .sum();
        bits = bits.min(per_word);
        if words.len() < 4
            && words
                .iter()
                .all(|w| w.chars().all(|c| c.is_ascii_lowercase()))
        {
            hints.push(StrengthHint::AddAnotherWord);
        }
    }

    if COMMON
        .iter()
        .any(|c| squashed == *c || (squashed.len() <= c.len() + 4 && squashed.contains(c)))
    {
        hints.push(StrengthHint::CommonPassword);
        bits = bits.min(10.0);
    }

    let bits = bits.max(0.0);
    let score = match bits {
        b if b < 28.0 => 0,
        b if b < 40.0 => 1,
        b if b < MIN_BITS => 2,
        b if b < 70.0 => 3,
        _ => 4,
    };
    let acceptable = chars.len() >= MIN_CHARS && bits >= MIN_BITS;
    PassphraseStrength {
        score,
        bits: bits.floor() as u32,
        acceptable,
        hints,
    }
}

fn charset_size(chars: &[char]) -> u32 {
    let mut pool = 0;
    if chars.iter().any(|c| c.is_ascii_lowercase()) {
        pool += 26;
    }
    if chars.iter().any(|c| c.is_ascii_uppercase()) {
        pool += 26;
    }
    if chars.iter().any(|c| c.is_ascii_digit()) {
        pool += 10;
    }
    if chars.iter().any(|c| c.is_ascii_punctuation() || *c == ' ') {
        pool += 33;
    }
    if chars.iter().any(|c| !c.is_ascii()) {
        pool += 100;
    }
    pool.max(1)
}

fn class_count(chars: &[char]) -> usize {
    [
        chars.iter().any(|c| c.is_ascii_lowercase()),
        chars.iter().any(|c| c.is_ascii_uppercase()),
        chars.iter().any(|c| c.is_ascii_digit()),
        chars.iter().any(|c| !c.is_ascii_alphanumeric()),
    ]
    .iter()
    .filter(|b| **b)
    .count()
}

/// Characters beyond the first two of any run of the same character.
fn repeated_chars(chars: &[char]) -> (usize, bool) {
    let mut loss = 0;
    let mut run = 1;
    for w in chars.windows(2) {
        if w[0] == w[1] {
            run += 1;
            if run > 2 {
                loss += 1;
            }
        } else {
            run = 1;
        }
    }
    (loss, loss > 0)
}

/// Characters beyond the first of any 3+ long alphabet, digit or keyboard run (either direction).
fn sequence_chars(lower: &str) -> (usize, bool) {
    let chars: Vec<char> = lower.chars().collect();
    let mut loss = 0;
    let mut i = 0;
    while i + 2 < chars.len() {
        let mut best = 0;
        for seq in SEQUENCES {
            for dir in [false, true] {
                let s: Vec<char> = if dir {
                    seq.chars().rev().collect()
                } else {
                    seq.chars().collect()
                };
                if let Some(start) = s.iter().position(|c| *c == chars[i]) {
                    let len = chars[i..]
                        .iter()
                        .zip(&s[start..])
                        .take_while(|(a, b)| a == b)
                        .count();
                    best = best.max(len);
                }
            }
        }
        if best >= 3 {
            loss += best - 1;
            i += best;
        } else {
            i += 1;
        }
    }
    (loss, loss > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short_and_common() {
        let s = estimate("hunter2");
        assert!(!s.acceptable);
        assert!(s.hints.contains(&StrengthHint::TooShort));
        let s = estimate("Password1234");
        assert!(!s.acceptable);
        assert!(s.hints.contains(&StrengthHint::CommonPassword));
        assert_eq!(s.score, 0);
    }

    #[test]
    fn penalises_repeats_and_sequences() {
        assert!(!estimate("aaaaaaaaaaaaaaaa").acceptable);
        assert!(estimate("abcdefghijklmnop")
            .hints
            .contains(&StrengthHint::Sequence));
        assert!(!estimate("abcdefghijklmnop").acceptable);
        assert!(!estimate("qwertyuiop123456").acceptable);
    }

    #[test]
    fn credits_word_passphrases_per_word() {
        let three = estimate("orbit lantern pebble");
        assert!(!three.acceptable, "3 dictionary words ≈ 39 bits");
        assert!(three.hints.contains(&StrengthHint::AddAnotherWord));
        let five = estimate("orbit lantern pebble justice marrow");
        assert!(five.acceptable);
        assert!(five.score >= 3);
    }

    #[test]
    fn accepts_strong_random_passphrases() {
        let s = estimate("v7#Lq9!rTz2@mK4x");
        assert!(s.acceptable);
        assert_eq!(s.score, 4);
        assert!(s.hints.is_empty());
    }

    #[test]
    fn output_never_contains_the_input() {
        let s = estimate("SECRET-MARKER-1234");
        assert!(!format!("{s:?}").contains("MARKER"));
    }
}
