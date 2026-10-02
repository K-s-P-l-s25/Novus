//! M0 spike S1: Tauri v2 hello-world with one invoke() round-trip.
use serde::Serialize;
use std::time::Instant;

#[derive(Serialize)]
struct Ping {
    echo: String,
    platform: &'static str,
    rust_ms: f64,
}

#[tauri::command]
fn spike_ping(msg: String) -> Ping {
    let t = Instant::now();
    let echo = msg.chars().rev().collect::<String>();
    Ping { echo, platform: std::env::consts::OS, rust_ms: t.elapsed().as_secs_f64() * 1000.0 }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![spike_ping])
        .run(tauri::generate_context!())
    {
        eprintln!("tauri run failed: {e}");
        std::process::exit(1);
    }
}
