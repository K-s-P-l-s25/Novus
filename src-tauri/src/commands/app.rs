use serde::Serialize;
use ts_rs::TS;

use crate::error::AppResult;
use crate::{PAYLOAD_V, SCHEMA_VERSION};

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AppInfo {
    pub version: String,
    /// Local database schema version. 0 until the database exists (M4).
    pub schema_version: u32,
    /// Sync payload format version (SPEC §7.9).
    pub payload_v: u32,
    /// `windows`, `android`, `linux`, ...
    pub platform: String,
    /// Stable per-install id, created with the database in M4.
    pub device_id: Option<String>,
}

pub(crate) fn info(version: String) -> AppInfo {
    AppInfo {
        version,
        schema_version: SCHEMA_VERSION,
        payload_v: PAYLOAD_V,
        platform: std::env::consts::OS.to_owned(),
        device_id: None,
    }
}

#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppResult<AppInfo> {
    Ok(info(app.package_info().version.to_string()))
}

#[cfg(test)]
mod tests {
    #[test]
    fn reports_platform_and_versions() {
        let i = super::info("9.9.9".into());
        assert_eq!(i.version, "9.9.9");
        assert_eq!(i.platform, std::env::consts::OS);
        assert_eq!(i.payload_v, 1);
        assert!(i.device_id.is_none());
    }
}
