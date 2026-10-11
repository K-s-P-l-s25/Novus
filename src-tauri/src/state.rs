//! Process-wide state managed by Tauri. Grows with later milestones
//! (database in M4, sync in M5).

use std::path::PathBuf;
use tracing_appender::non_blocking::WorkerGuard;

use crate::crypto::keys::{KeyFile, KeyStore};
use crate::secure_kv::SecureKv;

pub struct AppState {
    /// OS app-data directory; the database and attachments live here from M4.
    pub data_dir: PathBuf,
    /// The DEK while unlocked (SPEC §5.2). Locking zeroes it.
    pub keys: KeyStore,
    /// Local copy of the wrapped-key row, for offline unlock.
    pub key_file: KeyFile,
    /// Sealed small secrets (the Supabase session).
    pub secure_kv: SecureKv,
    /// Kept alive so buffered log lines are flushed on exit.
    _log_guard: Option<WorkerGuard>,
}

impl AppState {
    pub fn new(data_dir: PathBuf, log_guard: Option<WorkerGuard>) -> Self {
        let key_file = KeyFile::in_dir(&data_dir);
        let secure_kv = SecureKv::in_dir(&data_dir);
        Self {
            data_dir,
            keys: KeyStore::default(),
            key_file,
            secure_kv,
            _log_guard: log_guard,
        }
    }
}
