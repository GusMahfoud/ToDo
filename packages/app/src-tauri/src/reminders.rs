//! Reminder loop. Runs on a plain OS thread inside the Tauri process so it
//! keeps firing while the window is hidden (hidden webviews throttle JS timers).

use crate::db;
use std::{path::PathBuf, thread, time::Duration};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

pub const PAUSED_UNTIL_KEY: &str = "reminders_paused_until";
const TICK: Duration = Duration::from_secs(20);

pub fn start(app: AppHandle, db_path: PathBuf) {
    thread::Builder::new()
        .name("reminders".into())
        .spawn(move || {
            let mut conn = None;
            loop {
                if conn.is_none() {
                    match db::open(&db_path) {
                        Ok(c) => conn = Some(c),
                        Err(e) => eprintln!("[reminders] open failed: {e}"),
                    }
                }
                if let Some(c) = conn.as_ref() {
                    match tick(&app, c) {
                        Ok(0) => {}
                        Ok(n) => {
                            let _ = app.emit("reminders-fired", n);
                        }
                        Err(e) => {
                            eprintln!("[reminders] tick failed: {e}");
                            conn = None; // reopen next round (schema may not exist yet on first run)
                        }
                    }
                }
                thread::sleep(TICK);
            }
        })
        .expect("spawn reminder thread");
}

fn is_paused(conn: &rusqlite::Connection, now: i64) -> bool {
    db::get_setting(conn, PAUSED_UNTIL_KEY)
        .and_then(|v| v.parse::<i64>().ok())
        .map(|until| now < until)
        .unwrap_or(false)
}

/// Claims due reminders atomically (so nothing fires twice, even with several
/// app instances) and shows them, grouped when many are due at once.
fn tick(app: &AppHandle, conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    let now = db::now_ms();
    if is_paused(conn, now) {
        return Ok(0);
    }
    let mut stmt = conn.prepare(
        "UPDATE todos SET reminded_at = ?1
         WHERE status = 'open' AND remind_at IS NOT NULL
           AND remind_at <= ?1 AND reminded_at IS NULL
         RETURNING title",
    )?;
    let titles: Vec<String> = stmt
        .query_map([now], |r| r.get(0))?
        .filter_map(Result::ok)
        .collect();

    match titles.len() {
        0 => {}
        1..=3 => {
            for title in &titles {
                notify(app, "Reminder", title);
            }
        }
        n => notify(
            app,
            "Reminders",
            &format!(
                "{n} todos are due:\n{}",
                titles
                    .iter()
                    .take(5)
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n")
            ),
        ),
    }
    Ok(titles.len())
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("[reminders] notification failed: {e}");
    }
}

/// Pauses reminders for `minutes` (0 resumes). Returns the new `paused_until` ms.
pub fn pause(conn: &rusqlite::Connection, minutes: i64) -> rusqlite::Result<i64> {
    let until = if minutes <= 0 {
        0
    } else {
        db::now_ms() + minutes * 60_000
    };
    db::set_setting(conn, PAUSED_UNTIL_KEY, &until.to_string())?;
    Ok(until)
}
