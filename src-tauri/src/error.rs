//! Typed errors returned by every command (SPEC §14.2).
//!
//! 🔒 Error values cross into JavaScript and may be logged, so they must never carry
//! user content, keys or passphrases. `Validation::field` is a code identifier and
//! `msg` a fixed, content-free explanation. Anything unexpected becomes `Internal`
//! with a short id that matches one log line.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, TS)]
#[serde(tag = "kind")]
#[ts(export)]
pub enum AppError {
    #[error("keys are locked")]
    Locked,
    #[error("not found")]
    NotFound,
    #[error("invalid value for {field}")]
    Validation { field: String, msg: String },
    #[error("limit reached: {what}")]
    LimitReached { what: String },
    #[error("conflict")]
    Conflict,
    #[error("cryptographic check failed")]
    Crypto,
    #[error("storage i/o failed")]
    Io,
    #[error("internal error {id}")]
    Internal { id: String },
}

impl AppError {
    /// Logs an unexpected failure under a fresh short id and returns `Internal { id }`.
    ///
    /// `context` must be a fixed string chosen by the caller (e.g. `"setup.log_dir"`),
    /// never something derived from user data. The underlying error is deliberately
    /// not logged: its message could contain content (SQL values, paths, payloads).
    pub fn internal(context: &'static str) -> Self {
        let id = short_id();
        tracing::error!(error_id = %id, context, "internal error");
        AppError::Internal { id }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        // `ErrorKind` is content-free; the message (which may include a path) is dropped.
        tracing::warn!(io_kind = ?e.kind(), "i/o error");
        AppError::Io
    }
}

/// 8 hex characters: short enough to read out from a toast, unique enough per session.
pub(crate) fn short_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..8].to_owned()
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_with_kind_tag() {
        let v = serde_json::to_value(AppError::Locked).unwrap();
        assert_eq!(v, serde_json::json!({ "kind": "Locked" }));
        let v = serde_json::to_value(AppError::Validation {
            field: "name".into(),
            msg: "too long".into(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "kind": "Validation", "field": "name", "msg": "too long" })
        );
    }

    #[test]
    fn internal_exposes_only_the_id() {
        let AppError::Internal { id } = AppError::internal("test.context") else {
            panic!("expected Internal");
        };
        assert_eq!(id.len(), 8);
        let v = serde_json::to_value(AppError::Internal { id: id.clone() }).unwrap();
        assert_eq!(v, serde_json::json!({ "kind": "Internal", "id": id }));
    }

    #[test]
    fn io_error_drops_the_message() {
        let e = std::io::Error::new(std::io::ErrorKind::NotFound, "/secret/SECRET-MARKER");
        let app: AppError = e.into();
        assert_eq!(app, AppError::Io);
        assert!(!format!("{app} {app:?}").contains("SECRET-MARKER"));
    }
}
