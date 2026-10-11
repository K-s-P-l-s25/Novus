//! Drives the key commands through Tauri's IPC layer (mock runtime), as the UI would.

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

use kaisen_lib::state::AppState;

const PASS: &str = "orbit lantern pebble justice marrow";
const NEW_PASS: &str = "velvet quarry nimbus harbor tidal";

fn app() -> (
    tauri::App<tauri::test::MockRuntime>,
    WebviewWindow<tauri::test::MockRuntime>,
    std::path::PathBuf,
) {
    let dir =
        std::env::temp_dir().join(format!("kaisen-keys-cmd-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dir).unwrap();
    let app = kaisen_lib::with_commands(mock_builder())
        .build(mock_context(noop_assets()))
        .unwrap();
    app.manage(AppState::new(dir.clone(), None));
    let w = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (app, w, dir)
}

fn call(
    w: &WebviewWindow<tauri::test::MockRuntime>,
    cmd: &str,
    args: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        w,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: if cfg!(any(windows, target_os = "android")) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

fn status(w: &WebviewWindow<tauri::test::MockRuntime>) -> Value {
    call(w, "keys_status", json!({})).unwrap()
}

#[test]
fn full_key_lifecycle_over_ipc() {
    let (_app, w, dir) = app();
    assert_eq!(status(&w), json!({ "has_keys": false, "unlocked": false }));
    assert_eq!(
        call(&w, "keys_unlock", json!({ "passphrase": PASS })).unwrap_err()["kind"],
        "NotFound"
    );

    // Weak passphrases are refused before any key exists.
    let err = call(&w, "keys_bootstrap", json!({ "passphrase": "hunter2" })).unwrap_err();
    assert_eq!(err["kind"], "Validation");
    assert_eq!(status(&w)["has_keys"], false);

    // Bootstrap: keys exist, unlocked, recovery key returned once, row has no plaintext.
    let boot = call(&w, "keys_bootstrap", json!({ "passphrase": PASS })).unwrap();
    let recovery = boot["recovery_key"].as_str().unwrap().to_owned();
    assert_eq!(recovery.len(), 65);
    assert!(!boot["user_keys_row"].to_string().contains("orbit"));
    assert_eq!(
        boot["user_keys_row"]["kdf_params"],
        json!({ "m_kib": 65536, "t": 3, "p": 1 })
    );
    assert_eq!(status(&w), json!({ "has_keys": true, "unlocked": true }));
    assert_eq!(
        call(&w, "keys_bootstrap", json!({ "passphrase": PASS })).unwrap_err()["kind"],
        "Conflict"
    );

    // Lock zeroes the key; the store reports Locked to anything that needs it.
    call(&w, "keys_lock", json!({})).unwrap();
    assert_eq!(status(&w)["unlocked"], false);
    {
        let state = w.app_handle().state::<AppState>();
        assert_eq!(
            state.keys.subkey("kaisen/db/v1").unwrap_err(),
            kaisen_lib::error::AppError::Locked
        );
    }

    // Wrong passphrase, then right one.
    let err = call(
        &w,
        "keys_unlock",
        json!({ "passphrase": "not my passphrase" }),
    )
    .unwrap_err();
    assert_eq!(
        err,
        json!({ "kind": "Validation", "field": "passphrase", "msg": "That passphrase is not correct." })
    );
    call(&w, "keys_unlock", json!({ "passphrase": PASS })).unwrap();
    let db_key_before = w
        .app_handle()
        .state::<AppState>()
        .keys
        .subkey("kaisen/db/v1")
        .unwrap();

    // Change passphrase: the DEK (and so every sub-key) is unchanged.
    call(
        &w,
        "keys_change_passphrase",
        json!({ "old": PASS, "new": NEW_PASS }),
    )
    .unwrap();
    call(&w, "keys_lock", json!({})).unwrap();
    assert_eq!(
        call(&w, "keys_unlock", json!({ "passphrase": PASS })).unwrap_err()["kind"],
        "Validation"
    );
    call(&w, "keys_unlock", json!({ "passphrase": NEW_PASS })).unwrap();
    let db_key_after = w
        .app_handle()
        .state::<AppState>()
        .keys
        .subkey("kaisen/db/v1")
        .unwrap();
    assert_eq!(*db_key_before, *db_key_after);

    // Recovery key unlocks; regenerating it retires the old one.
    call(&w, "keys_lock", json!({})).unwrap();
    call(
        &w,
        "keys_unlock_recovery",
        json!({ "recoveryKey": recovery }),
    )
    .unwrap();
    let regen = call(
        &w,
        "keys_regenerate_recovery",
        json!({ "passphrase": NEW_PASS }),
    )
    .unwrap();
    let new_recovery = regen["recovery_key"].as_str().unwrap().to_owned();
    call(&w, "keys_lock", json!({})).unwrap();
    assert_eq!(
        call(
            &w,
            "keys_unlock_recovery",
            json!({ "recoveryKey": recovery })
        )
        .unwrap_err()["kind"],
        "Validation"
    );
    call(
        &w,
        "keys_unlock_recovery",
        json!({ "recoveryKey": new_recovery }),
    )
    .unwrap();

    // A row passed in (as fetched from Supabase on a new device) is used and kept locally.
    let row = regen["user_keys_row"].clone();
    std::fs::remove_file(dir.join("user_keys.json")).unwrap();
    call(&w, "keys_lock", json!({})).unwrap();
    assert_eq!(status(&w)["has_keys"], false);
    call(
        &w,
        "keys_unlock",
        json!({ "passphrase": NEW_PASS, "userKeysRow": row }),
    )
    .unwrap();
    assert_eq!(status(&w), json!({ "has_keys": true, "unlocked": true }));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn strength_command_reports_without_echoing() {
    let (_app, w, dir) = app();
    let s = call(
        &w,
        "keys_passphrase_strength",
        json!({ "passphrase": "SECRET-MARKER-x" }),
    )
    .unwrap();
    assert!(!s.to_string().contains("MARKER"));
    assert_eq!(s["acceptable"], false);
    let s = call(
        &w,
        "keys_passphrase_strength",
        json!({ "passphrase": PASS }),
    )
    .unwrap();
    assert_eq!(s["acceptable"], true);
    std::fs::remove_dir_all(&dir).unwrap();
}
