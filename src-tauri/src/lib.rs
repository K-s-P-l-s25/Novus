//! KAISEN core. All business logic, crypto, database and sync merge live in Rust;
//! the UI talks to it only through the commands registered here (SPEC §1.2).

pub mod commands;
pub mod crypto;
pub mod error;
pub mod logging;
pub mod state;

use tauri::Manager;

use crate::error::AppError;
use crate::state::AppState;

/// Local database schema version; bumped by migrations from M4.
pub const SCHEMA_VERSION: u32 = 0;
/// Sync payload format version (SPEC §7.9).
pub const PAYLOAD_V: u32 = 1;

/// Registers every IPC command. Shared by the app and the command tests.
pub fn with_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::app::app_info,
        commands::keys::keys_status,
        commands::keys::keys_passphrase_strength,
        commands::keys::keys_bootstrap,
        commands::keys::keys_unlock,
        commands::keys::keys_unlock_recovery,
        commands::keys::keys_lock,
        commands::keys::keys_change_passphrase,
        commands::keys::keys_regenerate_recovery,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = with_commands(tauri::Builder::default())
        .setup(|app| {
            let paths = app.path();
            let data_dir = paths
                .app_data_dir()
                .map_err(|_| AppError::internal("setup.data_dir"))?;
            let log_dir = paths
                .app_log_dir()
                .map_err(|_| AppError::internal("setup.log_dir"))?;
            std::fs::create_dir_all(&data_dir).map_err(AppError::from)?;
            let guard = logging::init(&log_dir)?;
            tracing::info!(
                version = %app.package_info().version,
                platform = std::env::consts::OS,
                "app started"
            );
            app.manage(AppState::new(data_dir, Some(guard)));
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        // Logging may not be up yet; the error type is content-free.
        eprintln!("KAISEN failed to start: {e}");
        std::process::exit(1);
    }
}
