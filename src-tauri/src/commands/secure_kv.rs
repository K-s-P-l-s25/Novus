//! Encrypted key-value commands (SPEC Appendix C, "Secure KV"). They need the DEK, so they
//! return `Locked` while locked; the UI buffers the Supabase session in memory until unlock.

use tauri::{AppHandle, Manager, Runtime};

use crate::crypto::kdf::labels;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub fn secure_kv_get<R: Runtime>(app: AppHandle<R>, key: String) -> AppResult<Option<String>> {
    let state = app.state::<AppState>();
    let kv_key = state.keys.subkey(labels::KV)?;
    Ok(state.secure_kv.get(&kv_key, &key)?.map(|v| v.to_string()))
}

#[tauri::command]
pub fn secure_kv_set<R: Runtime>(app: AppHandle<R>, key: String, value: String) -> AppResult<()> {
    let value = zeroize::Zeroizing::new(value);
    let state = app.state::<AppState>();
    let kv_key = state.keys.subkey(labels::KV)?;
    state.secure_kv.set(&kv_key, &key, &value)
}

#[tauri::command]
pub fn secure_kv_delete<R: Runtime>(app: AppHandle<R>, key: String) -> AppResult<()> {
    let state = app.state::<AppState>();
    // Deleting needs no key material, but stays behind the lock like the other KV commands.
    state.keys.with_dek(|_| Ok(()))?;
    state.secure_kv.delete(&key)
}
