//! Tauri commands invoked from the React UI.

use crate::{
    connect::{self, Client, Preview, ServerEntry, WriteResult},
    db::{self, AppDb, ExecResult},
    reminders, sidecar,
};
use serde_json::{Map, Value};
use tauri::{AppHandle, State};

type CmdResult<T> = Result<T, String>;

fn lock(state: &State<'_, AppDb>) -> CmdResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    state.0.lock().map_err(|e| format!("database lock poisoned: {e}"))
}

#[tauri::command]
pub fn db_exec(state: State<'_, AppDb>, sql: String, params: Vec<Value>) -> CmdResult<ExecResult> {
    let conn = lock(&state)?;
    db::exec(&conn, &sql, &params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_select(state: State<'_, AppDb>, sql: String, params: Vec<Value>) -> CmdResult<Vec<Map<String, Value>>> {
    let conn = lock(&state)?;
    db::select(&conn, &sql, &params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_path(app: AppHandle) -> CmdResult<String> {
    connect::db_path(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn mcp_binary_path(app: AppHandle) -> CmdResult<String> {
    sidecar::resolve(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn mcp_server_entry(app: AppHandle) -> CmdResult<ServerEntry> {
    connect::server_entry(&app)
}

#[tauri::command]
pub fn client_config_preview(app: AppHandle, client: Client) -> CmdResult<Preview> {
    connect::preview(&app, client)
}

#[tauri::command]
pub fn client_config_write(app: AppHandle, client: Client) -> CmdResult<WriteResult> {
    connect::write(&app, client)
}

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> CmdResult<()> {
    reminders::notify(&app, &title, &body);
    Ok(())
}

/// Pause reminders for `minutes`; 0 resumes. Returns paused_until (ms).
#[tauri::command]
pub fn pause_reminders(state: State<'_, AppDb>, minutes: i64) -> CmdResult<i64> {
    let conn = lock(&state)?;
    reminders::pause(&conn, minutes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_path(path: String) -> CmdResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> CmdResult<Map<String, Value>> {
    let info = app.package_info();
    let mut m = Map::new();
    m.insert("name".into(), Value::String(info.name.clone()));
    m.insert("version".into(), Value::String(info.version.to_string()));
    m.insert("os".into(), Value::String(std::env::consts::OS.into()));
    m.insert("arch".into(), Value::String(std::env::consts::ARCH.into()));
    m.insert("appimage".into(), Value::Bool(std::env::var_os("APPIMAGE").is_some()));
    Ok(m)
}
