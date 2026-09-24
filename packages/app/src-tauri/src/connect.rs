//! "Connect to AI client": merges a `todo` entry into Cursor / Claude Desktop
//! JSON configs without touching other servers, backing up first.

use crate::{db, sidecar};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const SERVER_KEY: &str = "todo";

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Client {
    Cursor,
    ClaudeDesktop,
}

#[derive(Serialize)]
pub struct ServerEntry {
    pub command: String,
    pub args: Vec<String>,
    pub env: Map<String, Value>,
}

#[derive(Serialize)]
pub struct Preview {
    pub client: Client,
    pub path: String,
    pub exists: bool,
    pub before: String,
    pub after: String,
    pub already_configured: bool,
    pub candidates: Vec<String>,
}

#[derive(Serialize)]
pub struct WriteResult {
    pub path: String,
    pub backup_path: Option<String>,
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(db::DB_FILE))
}

/// The entry every client gets. `TODO_DB_PATH` is always explicit so the app
/// and the MCP server can never disagree about which file to open.
pub fn server_entry(app: &AppHandle) -> Result<ServerEntry, String> {
    let bin = sidecar::resolve(app)?;
    let mut env = Map::new();
    env.insert(
        "TODO_DB_PATH".into(),
        Value::String(db_path(app)?.to_string_lossy().into_owned()),
    );
    Ok(ServerEntry {
        command: bin.to_string_lossy().into_owned(),
        args: vec![],
        env,
    })
}

fn candidates(app: &AppHandle, client: Client) -> Result<Vec<PathBuf>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(match client {
        Client::Cursor => vec![home.join(".cursor").join("mcp.json")],
        Client::ClaudeDesktop => {
            let file = "claude_desktop_config.json";
            if cfg!(windows) {
                let mut v = Vec::new();
                // MSIX (Microsoft Store / new installer) builds read a virtualised copy of %APPDATA%.
                if let Ok(local) = app.path().local_data_dir() {
                    let pkg = local.join("Packages").join("Claude_pzs8sxrjxfjjc");
                    if pkg.exists() {
                        v.push(
                            pkg.join("LocalCache")
                                .join("Roaming")
                                .join("Claude")
                                .join(file),
                        );
                    }
                }
                if let Ok(roaming) = app.path().data_dir() {
                    v.push(roaming.join("Claude").join(file));
                }
                v
            } else if cfg!(target_os = "macos") {
                vec![home
                    .join("Library")
                    .join("Application Support")
                    .join("Claude")
                    .join(file)]
            } else {
                let config = app.path().config_dir().map_err(|e| e.to_string())?;
                vec![config.join("Claude").join(file)]
            }
        }
    })
}

fn pick_path(paths: &[PathBuf]) -> Result<PathBuf, String> {
    paths
        .iter()
        .find(|p| p.exists())
        .or_else(|| paths.first())
        .cloned()
        .ok_or_else(|| "No config location known for this client".to_string())
}

fn read_json(path: &PathBuf) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let text = text.trim_start_matches('\u{feff}');
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err(format!("{} is not a JSON object", path.display())),
        Err(e) => Err(format!(
            "{} is not valid JSON ({e}). Fix or remove it first.",
            path.display()
        )),
    }
}

fn merged(existing: &Map<String, Value>, entry: &ServerEntry) -> Map<String, Value> {
    let mut out = existing.clone();
    let mut servers = match out.get("mcpServers") {
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    };
    servers.insert(
        SERVER_KEY.into(),
        json!({ "command": entry.command, "args": entry.args, "env": entry.env }),
    );
    out.insert("mcpServers".into(), Value::Object(servers));
    out
}

fn pretty(map: &Map<String, Value>) -> String {
    serde_json::to_string_pretty(&Value::Object(map.clone())).unwrap_or_default()
}

pub fn preview(app: &AppHandle, client: Client) -> Result<Preview, String> {
    let entry = server_entry(app)?;
    let all = candidates(app, client)?;
    let path = pick_path(&all)?;
    let existing = read_json(&path)?;
    let after = merged(&existing, &entry);
    let already = existing
        .get("mcpServers")
        .and_then(|s| s.get(SERVER_KEY))
        .map(|cur| cur == after["mcpServers"].get(SERVER_KEY).unwrap_or(&Value::Null))
        .unwrap_or(false);
    Ok(Preview {
        client,
        exists: path.exists(),
        before: pretty(&existing),
        after: pretty(&after),
        already_configured: already,
        candidates: all
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect(),
        path: path.to_string_lossy().into_owned(),
    })
}

/// Re-derives the merge from disk (never trusts UI text), backs up, writes UTF-8 without BOM.
pub fn write(app: &AppHandle, client: Client) -> Result<WriteResult, String> {
    let entry = server_entry(app)?;
    let path = pick_path(&candidates(app, client)?)?;
    let existing = read_json(&path)?;
    let after = merged(&existing, &entry);

    let backup = if path.exists() {
        let stamp = db::now_ms() / 1000;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let backup = path.with_file_name(format!("{name}.{stamp}.bak"));
        std::fs::copy(&path, &backup).map_err(|e| format!("Backup failed: {e}"))?;
        Some(backup.to_string_lossy().into_owned())
    } else {
        None
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    std::fs::write(&path, format!("{}\n", pretty(&after)))
        .map_err(|e| format!("Write failed: {e}"))?;
    Ok(WriteResult {
        path: path.to_string_lossy().into_owned(),
        backup_path: backup,
    })
}
