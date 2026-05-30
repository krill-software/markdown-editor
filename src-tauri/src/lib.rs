mod watch;

use std::fs;
use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use krill_desktop_core::{fs as kfs, state as kstate, dev as kdev, updater::BuilderExt};

const SLUG: &str = "krill-markdown-editor";

#[derive(Default)]
struct AppCtx {
    /// Active file watcher, if any. Dropping it stops the watch.
    /// Opening a new file swaps atomically: drop old, install new.
    watch: Mutex<Option<watch::Watch>>,
}

#[derive(Debug, Serialize)]
struct FileRead {
    path: String,
    contents: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<FileRead, String> {
    let p = Path::new(&path);
    let contents = fs::read_to_string(p).map_err(|e| kfs::format_io_err(&path, e))?;
    Ok(FileRead {
        path: kfs::absolute_path(p),
        contents,
    })
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<String, String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| kfs::format_io_err(&path, e))?;
        }
    }
    fs::write(p, contents).map_err(|e| kfs::format_io_err(&path, e))?;
    Ok(kfs::absolute_path(p))
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppState {
    font_size: Option<u32>,
    window: Option<kstate::WindowGeometry>,
}

#[tauri::command]
fn load_state() -> Option<AppState> {
    kstate::load(SLUG, "state.json")
}

#[tauri::command]
fn save_state(state: AppState) -> Result<(), String> {
    kstate::save(SLUG, "state.json", &state)
}

#[tauri::command]
fn dev_test_file() -> Option<String> {
    kdev::test_file(env!("CARGO_MANIFEST_DIR"), &["test.md"])
}

/// Shell out to krill-markdown-viewer so the user can flip from
/// authoring to a calmer reading surface. Detached so quitting the
/// editor doesn't also kill the viewer.
#[tauri::command]
fn open_in_viewer(path: String) -> Result<(), String> {
    std::process::Command::new("krill-markdown-viewer")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("couldn't launch krill-markdown-viewer: {e}"))
}

/// Start watching `path` for external changes. Emits the
/// `file-changed` event whenever the file is modified on disk.
/// Replaces any prior watcher.
#[tauri::command]
async fn watch_file(
    path: String,
    app: AppHandle,
    state: State<'_, Arc<AppCtx>>,
) -> Result<(), String> {
    let mut g = state.watch.lock().await;
    *g = None;
    let w = watch::start(Path::new(&path), app).map_err(|e| format!("{e:#}"))?;
    *g = Some(w);
    Ok(())
}

/// Stop watching whatever's currently watched. No-op if nothing is.
#[tauri::command]
async fn stop_watching(state: State<'_, Arc<AppCtx>>) -> Result<(), String> {
    *state.watch.lock().await = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ctx = Arc::new(AppCtx::default());
    tauri::Builder::default()
        .manage(ctx)
        .with_updater()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            load_state,
            save_state,
            dev_test_file,
            open_in_viewer,
            watch_file,
            stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
