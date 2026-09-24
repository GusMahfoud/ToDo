//! Locates the bundled `todo-mcp` sidecar so the Connect screen can point AI
//! clients at a stable absolute path.

use std::path::{Path, PathBuf};
use tauri::AppHandle;

const NAME: &str = "todo-mcp";

fn exe_name() -> String {
    if cfg!(windows) {
        format!("{NAME}.exe")
    } else {
        NAME.to_string()
    }
}

/// Sidecar next to the running executable (Tauri strips the target-triple suffix when bundling).
fn beside_executable() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join(exe_name());
    candidate.exists().then_some(candidate)
}

/// Dev fallback: the freshly built `binaries/todo-mcp-<triple>` in the source tree.
fn in_source_tree() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
    let entries = std::fs::read_dir(dir).ok()?;
    entries.filter_map(Result::ok).map(|e| e.path()).find(|p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with(&format!("{NAME}-")))
            .unwrap_or(false)
    })
}

/// AppImages mount at a new temp path on each launch, so a config that points
/// inside one breaks next time. Copy the sidecar to ~/.local/bin and refresh it
/// whenever the app version changes.
#[cfg(target_os = "linux")]
fn appimage_stable_copy(app: &AppHandle, source: &Path) -> Option<PathBuf> {
    use tauri::Manager;
    std::env::var_os("APPIMAGE")?;
    let home = app.path().home_dir().ok()?;
    let bin_dir = home.join(".local").join("bin");
    let target = bin_dir.join(NAME);
    let version = app.package_info().version.to_string();
    let stamp = app.path().app_data_dir().ok()?.join("todo-mcp.version");
    let current = std::fs::read_to_string(&stamp).unwrap_or_default();
    if !target.exists() || current.trim() != version {
        std::fs::create_dir_all(&bin_dir).ok()?;
        std::fs::copy(source, &target).ok()?;
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
        if let Some(parent) = stamp.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&stamp, version);
    }
    Some(target)
}

#[cfg(not(target_os = "linux"))]
fn appimage_stable_copy(_app: &AppHandle, _source: &Path) -> Option<PathBuf> {
    None
}

pub fn resolve(app: &AppHandle) -> Result<PathBuf, String> {
    let found = beside_executable().or_else(in_source_tree).ok_or_else(|| {
        format!(
            "{} not found next to the app. Run `bun run build:sidecar`.",
            exe_name()
        )
    })?;
    Ok(appimage_stable_copy(app, &found).unwrap_or(found))
}
