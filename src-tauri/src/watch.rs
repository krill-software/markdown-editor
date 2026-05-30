//! File-change watcher driving live re-renders.
//!
//! We watch the **parent directory**, not the file itself. Most text
//! editors (vim's default, VS Code, even sed -i) save atomically by
//! writing to a tempfile and renaming over the target — that breaks
//! inode-based file watchers. Watching the parent and filtering by
//! filename catches every common save flow.
//!
//! Debouncing happens on the frontend (80ms via setTimeout) because
//! each event already triggers a Tauri IPC roundtrip and we want
//! exactly-once re-rendering even if notify fires a burst.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use notify::{recommended_watcher, Event, EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Holds an active watcher. Drop to stop watching.
pub struct Watch {
    _watcher: notify::RecommendedWatcher,
}

pub fn start(path: &Path, app: AppHandle) -> Result<Watch> {
    let target: PathBuf = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf());
    let parent = target
        .parent()
        .ok_or_else(|| anyhow!("path has no parent: {}", target.display()))?
        .to_path_buf();

    let target_for_cb = target.clone();
    let mut watcher = recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(ev) = res else { return };
        // Skip access events (mtime reads, etc.) and metadata-only
        // changes — only content-altering events warrant a re-render.
        let interesting = matches!(
            ev.kind,
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
        );
        if !interesting { return }
        if ev.paths.iter().any(|p| p == &target_for_cb) {
            let _ = app.emit("file-changed", target_for_cb.display().to_string());
        }
    })
    .context("creating file watcher")?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .with_context(|| format!("starting watch on {}", parent.display()))?;

    Ok(Watch { _watcher: watcher })
}
