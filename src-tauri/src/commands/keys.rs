//! Key commands (SPEC Appendix C, "Keys", allowed before unlock).
//!
//! 🔒 Passphrases and recovery keys arrive from the UI as strings and are moved into
//! `Zeroizing` immediately. They are never logged or put in error messages. The recovery
//! key is returned to the UI exactly once, for display. Argon2id runs on a blocking thread
//! so the UI stays responsive.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use ts_rs::TS;
use zeroize::Zeroizing;

use crate::crypto::kdf::DEFAULT_KDF;
use crate::crypto::keys::{self, UserKeysRow};
use crate::crypto::strength::{self, PassphraseStrength};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_SECRET_CHARS: usize = 1024;

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct KeysStatus {
    /// A wrapped key row exists on this device.
    pub has_keys: bool,
    pub unlocked: bool,
}

/// No `Debug`: it carries the recovery key and must never be formatted into a log.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct KeysWithRecovery {
    pub user_keys_row: UserKeysRow,
    /// Shown once to the user, never stored by the app.
    pub recovery_key: String,
}

#[tauri::command]
pub fn keys_status<R: Runtime>(app: AppHandle<R>) -> AppResult<KeysStatus> {
    let state = app.state::<AppState>();
    Ok(KeysStatus {
        has_keys: state.key_file.exists(),
        unlocked: state.keys.is_unlocked(),
    })
}

#[tauri::command]
pub fn keys_passphrase_strength(passphrase: String) -> AppResult<PassphraseStrength> {
    let passphrase = secret(passphrase, "passphrase")?;
    Ok(strength::estimate(&passphrase))
}

#[tauri::command]
pub async fn keys_bootstrap<R: Runtime>(
    app: AppHandle<R>,
    passphrase: String,
) -> AppResult<KeysWithRecovery> {
    let passphrase = secret(passphrase, "passphrase")?;
    blocking(app, move |state| {
        if state.key_file.exists() {
            return Err(AppError::Conflict);
        }
        require_strong(&passphrase)?;
        let (row, recovery_key, dek) = keys::bootstrap(passphrase.as_bytes(), DEFAULT_KDF)?;
        state.key_file.save(&row)?;
        state.keys.set(dek);
        tracing::info!("keys bootstrapped");
        Ok(KeysWithRecovery {
            user_keys_row: row,
            recovery_key: recovery_key.to_string(),
        })
    })
    .await
}

#[tauri::command]
pub async fn keys_unlock<R: Runtime>(
    app: AppHandle<R>,
    passphrase: String,
    user_keys_row: Option<UserKeysRow>,
) -> AppResult<()> {
    let passphrase = secret(passphrase, "passphrase")?;
    blocking(app, move |state| {
        let (row, from_server) = row_or_local(state, user_keys_row)?;
        let dek = keys::unwrap_with_passphrase(&row, passphrase.as_bytes())?;
        if from_server {
            state.key_file.save(&row)?;
        }
        state.keys.set(dek);
        tracing::info!(method = "passphrase", "keys unlocked");
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn keys_unlock_recovery<R: Runtime>(
    app: AppHandle<R>,
    recovery_key: String,
    user_keys_row: Option<UserKeysRow>,
) -> AppResult<()> {
    let recovery_key = secret(recovery_key, "recovery_key")?;
    blocking(app, move |state| {
        let (row, from_server) = row_or_local(state, user_keys_row)?;
        let dek = keys::unwrap_with_recovery(&row, &recovery_key)?;
        if from_server {
            state.key_file.save(&row)?;
        }
        state.keys.set(dek);
        tracing::info!(method = "recovery", "keys unlocked");
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn keys_lock<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    app.state::<AppState>().keys.lock();
    tracing::info!("keys locked");
    Ok(())
}

#[tauri::command]
pub async fn keys_change_passphrase<R: Runtime>(
    app: AppHandle<R>,
    old: String,
    new: String,
) -> AppResult<UserKeysRow> {
    let old = secret(old, "old")?;
    let new = secret(new, "new")?;
    blocking(app, move |state| {
        let row = state.key_file.load()?.ok_or(AppError::NotFound)?;
        let dek = keys::unwrap_with_passphrase(&row, old.as_bytes())?;
        require_strong(&new)?;
        let new_row = keys::rewrap_passphrase(&row, &dek, new.as_bytes())?;
        state.key_file.save(&new_row)?;
        state.keys.set(dek);
        tracing::info!("passphrase changed");
        Ok(new_row)
    })
    .await
}

#[tauri::command]
pub async fn keys_regenerate_recovery<R: Runtime>(
    app: AppHandle<R>,
    passphrase: String,
) -> AppResult<KeysWithRecovery> {
    let passphrase = secret(passphrase, "passphrase")?;
    blocking(app, move |state| {
        let row = state.key_file.load()?.ok_or(AppError::NotFound)?;
        let dek = keys::unwrap_with_passphrase(&row, passphrase.as_bytes())?;
        let (new_row, recovery_key) = keys::rewrap_recovery(&row, &dek)?;
        state.key_file.save(&new_row)?;
        state.keys.set(dek);
        tracing::info!("recovery key regenerated");
        Ok(KeysWithRecovery {
            user_keys_row: new_row,
            recovery_key: recovery_key.to_string(),
        })
    })
    .await
}

fn secret(value: String, field: &str) -> AppResult<Zeroizing<String>> {
    let value = Zeroizing::new(value);
    if value.is_empty() || value.chars().count() > MAX_SECRET_CHARS {
        return Err(AppError::Validation {
            field: field.into(),
            msg: "Enter between 1 and 1024 characters.".into(),
        });
    }
    Ok(value)
}

fn require_strong(passphrase: &str) -> AppResult<()> {
    if strength::estimate(passphrase).acceptable {
        Ok(())
    } else {
        Err(AppError::Validation {
            field: "passphrase".into(),
            msg: "Choose a longer, less predictable passphrase.".into(),
        })
    }
}

fn row_or_local(state: &AppState, provided: Option<UserKeysRow>) -> AppResult<(UserKeysRow, bool)> {
    match provided {
        Some(row) => Ok((row, true)),
        None => Ok((state.key_file.load()?.ok_or(AppError::NotFound)?, false)),
    }
}

async fn blocking<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppState) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<AppState>()))
        .await
        .map_err(|_| AppError::internal("keys.blocking"))?
}
