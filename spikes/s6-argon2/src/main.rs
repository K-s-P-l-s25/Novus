//! M0 spike S6: Argon2id unlock timing.
//! Throwaway code. Run on the phone (see docs/SPIKES.md) and on Windows.
//! Usage: spike-s6-argon2 [runs]   (default 5 runs per parameter set)
use argon2::{Algorithm, Argon2, Params, Version};
use std::time::Instant;

fn main() {
    let runs: usize = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(5);
    // (m_kib, t, p): spec default, spec fallback, and two lighter points for comparison.
    let sets = [(65536u32, 3u32, 1u32), (32768, 3, 1), (65536, 2, 1), (19456, 2, 1)];
    let pass = b"correct horse battery staple";
    let salt = [7u8; 16];
    println!("arch={} os={} runs={runs}", std::env::consts::ARCH, std::env::consts::OS);
    println!("{:>8} {:>3} {:>3} {:>10} {:>10} {:>10}", "m_kib", "t", "p", "min_ms", "median_ms", "max_ms");
    for (m, t, p) in sets {
        let params = Params::new(m, t, p, Some(32)).expect("valid params");
        let a = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let mut out = [0u8; 32];
        a.hash_password_into(pass, &salt, &mut out).expect("warm-up");
        let mut ms: Vec<f64> = (0..runs)
            .map(|_| {
                let s = Instant::now();
                a.hash_password_into(pass, &salt, &mut out).expect("hash");
                s.elapsed().as_secs_f64() * 1000.0
            })
            .collect();
        ms.sort_by(|a, b| a.total_cmp(b));
        println!("{:>8} {:>3} {:>3} {:>10.0} {:>10.0} {:>10.0}", m, t, p, ms[0], ms[ms.len() / 2], ms[ms.len() - 1]);
    }
}
