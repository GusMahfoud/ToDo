//! System tray. Menu-driven on purpose: on Linux (StatusNotifierItem) tray
//! icons generally only open their menu and don't deliver plain click events.

use crate::{db::AppDb, reminders};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub const TRAY_ID: &str = "main";

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open TodoMCP", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick-add", "Quick add…", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause reminders (1h)", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume reminders", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &quick,
            &PredefinedMenuItem::separator(app)?,
            &pause,
            &resume,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("TodoMCP")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quick-add" => {
                show_main(app);
                let _ = app.emit("quick-add", ());
            }
            "pause" => set_pause(app, 60),
            "resume" => set_pause(app, 0),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn set_pause(app: &AppHandle, minutes: i64) {
    let state = app.state::<AppDb>();
    let result = state
        .0
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|conn| reminders::pause(&conn, minutes).map_err(|e| e.to_string()));
    match result {
        Ok(until) => {
            let _ = app.emit("settings-changed", ());
            let body = if until == 0 {
                "Reminders resumed."
            } else {
                "Reminders paused for 1 hour."
            };
            reminders::notify(app, "TodoMCP", body);
        }
        Err(e) => eprintln!("[tray] pause failed: {e}"),
    }
}
