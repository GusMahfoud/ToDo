//! Thin rusqlite layer. The UI's `Db` adapter (`@todomcp/core` → `TauriDb`)
//! forwards `exec`/`select` here, so the TypeScript `Store` runs unchanged
//! against one connection owned by the Rust process.

use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{path::Path, sync::Mutex, time::Duration};

/// The connection the UI talks through. Serialised by the mutex; the
/// TypeScript side additionally serialises its own transactions.
pub struct AppDb(pub Mutex<Connection>);

pub const DB_FILE: &str = "todos.db";

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

#[derive(Serialize)]
pub struct ExecResult {
    pub changes: usize,
    #[serde(rename = "lastInsertId")]
    pub last_insert_id: i64,
}

fn to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn from_sql(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(format!("<blob {} bytes>", b.len())),
    }
}

/// Runs a statement that returns no rows. Statements that *do* return rows
/// (e.g. `PRAGMA journal_mode`) are tolerated by draining them.
pub fn exec(conn: &Connection, sql: &str, params: &[Value]) -> rusqlite::Result<ExecResult> {
    let values: Vec<SqlValue> = params.iter().map(to_sql).collect();
    match conn.execute(sql, params_from_iter(values.iter())) {
        Ok(changes) => Ok(ExecResult {
            changes,
            last_insert_id: conn.last_insert_rowid(),
        }),
        Err(rusqlite::Error::ExecuteReturnedResults) => {
            select(conn, sql, params)?;
            Ok(ExecResult {
                changes: 0,
                last_insert_id: conn.last_insert_rowid(),
            })
        }
        Err(e) => Err(e),
    }
}

pub fn select(conn: &Connection, sql: &str, params: &[Value]) -> rusqlite::Result<Vec<Map<String, Value>>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let values: Vec<SqlValue> = params.iter().map(to_sql).collect();
    let rows = stmt.query_map(params_from_iter(values.iter()), |row| {
        let mut map = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            map.insert(name.clone(), from_sql(row.get_ref(i)?));
        }
        Ok(map)
    })?;
    rows.collect()
}

/// Reads a value from the shared `settings` table (None if the table or key is missing).
pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
        .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
