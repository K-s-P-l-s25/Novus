//! Process-wide state managed by Tauri. Grows with later milestones
//! (keys in M2, database in M4, sync in M5).

use std::path::PathBuf;
use tracing_appender::non_blocking::WorkerGuard;

pub struct AppState {
    /// OS app-data directory; the database and attachments live here from M4.
    pub data_dir: PathBuf,
    /// Kept alive so buffered log lines are flushed on exit.
    _log_guard: WorkerGuard,
}

impl AppState {
    pub fn new(data_dir: PathBuf, log_guard: WorkerGuard) -> Self {
        Self {
            data_dir,
            _log_guard: log_guard,
        }
    }
}
