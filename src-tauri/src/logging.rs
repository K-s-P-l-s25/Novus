//! Local log file (SPEC §12 #5–6).
//!
//! 🔒 The no-plaintext rule: log IDs, counts, durations and error codes only. Never log
//! titles, note text, quest text, keys, passphrases, tokens or anything the user typed.
//! Logs stay on the device (daily rotation, 7 files) and are only shared through the
//! content-free "Export diagnostics" (M16).

use std::path::Path;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::error::{short_id, AppError};

pub const LOG_FILE_PREFIX: &str = "kaisen";
pub const LOG_RETENTION_FILES: usize = 7;

/// Starts file logging in `log_dir`. Keep the returned guard alive for the app's lifetime,
/// or buffered lines are lost on exit.
pub fn init(log_dir: &Path) -> Result<WorkerGuard, AppError> {
    std::fs::create_dir_all(log_dir)?;
    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_FILE_PREFIX)
        .filename_suffix("log")
        .max_log_files(LOG_RETENTION_FILES)
        .build(log_dir)
        .map_err(|_| AppError::Io)?;
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let filter = if cfg!(debug_assertions) {
        EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info,kaisen_lib=debug"))
    } else {
        EnvFilter::new("info")
    };
    let file_layer = fmt::layer().with_writer(writer).with_ansi(false);
    let stderr_layer = cfg!(debug_assertions).then(|| fmt::layer().with_writer(std::io::stderr));

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stderr_layer)
        .try_init()
        .map_err(|_| AppError::internal("logging.init"))?;

    install_panic_hook();
    Ok(guard)
}

/// Panics are logged with their source location and an id only. The panic message is
/// dropped because it can contain arbitrary values (`expect` text, formatted data).
fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let id = short_id();
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".into());
        tracing::error!(panic_id = %id, %location, "panic");
    }));
}
