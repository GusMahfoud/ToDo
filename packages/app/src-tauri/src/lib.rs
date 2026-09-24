//! TodoMCP desktop shell: window lifecycle, tray, reminders, and a thin SQLite
//! bridge for the React UI. Everything else lives in `@todomcp/core`.

mod commands;
mod connect;
mod db;
mod reminders;
mod sidecar;
mod tray;

use std::sync::Mutex;
use tauri::Manager;

/// `--hidden` (what autostart passes) starts in the tray without a window.
fn wants_hidden_start() -> bool {
    std::env::args().skip(1).any(|a| a == "--hidden")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be first so it runs before other plugins can interfere.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main(app);
        }));
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let db_path = connect::db_path(app.handle())?;
            let conn = db::open(&db_path)?;
            app.manage(db::AppDb(Mutex::new(conn)));

            tray::build(app.handle())?;
            reminders::start(app.handle().clone(), db_path);

            if !wants_hidden_start() {
                tray::show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides to the tray; Quit lives in the tray menu.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_exec,
            commands::db_select,
            commands::db_path,
            commands::mcp_binary_path,
            commands::mcp_server_entry,
            commands::client_config_preview,
            commands::client_config_write,
            commands::show_notification,
            commands::pause_reminders,
            commands::reveal_path,
            commands::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TodoMCP");
}
