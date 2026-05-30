# Markdown Editor — Spec

A minimal markdown editor for Linux. Single-file, source-only,
typography-first. **The product is the UX, not the feature list** —
the bar is iA Writer, not Obsidian.

## In one sentence

**A calm, source-only markdown editor that delegates rendering to
its companion app, markdown-viewer.**

## Identity

| Where                | Value                                         |
|----------------------|-----------------------------------------------|
| Slug                 | `markdown-editor`                             |
| Binary               | `krill-markdown-editor`                       |
| Cargo package        | `krill-markdown-editor`                       |
| Cargo lib            | `krill_markdown_editor_lib`                   |
| `package.json` name  | `krill-markdown-editor`                       |
| productName          | `Markdown Editor`                             |
| State dir            | `$XDG_STATE_HOME/krill-markdown-editor/`      |
| GitHub repo          | `krill-software/markdown-editor`              |

## Goals

- Open, edit, save one `.md` file at a time. Fast launch, no
  project/vault concept.
- Be a **pure authoring surface** — text + muted markdown syntax in
  a calm typographic frame. No live preview, no split view.
- Hand rendering off to **markdown-viewer** (companion app):
  `Ctrl+Shift+V` opens the saved file in the viewer for inspection.
- Feel like a native Linux app (`.desktop` entry, file association,
  XDG dirs, real binary).
- **Feel beautiful to write in.** Typography, spacing, and stillness
  are first-class requirements, not polish.

## Non-goals (v1 and roadmap)

- **No live preview mode.** Removed in favour of delegating to
  markdown-viewer. The window stays in source view always.
- **No WYSIWYG / hybrid rendered editing.**
- No note vault, backlinks, tags, or graph view.
- No multi-tab; one file per window.
- No plugin system, cloud sync, or collaborative editing.
- No dark mode (suite-wide constraint; system-following palette
  inversion only).
- No Windows / macOS builds.

## UX principles (iA Writer-inspired)

These are binding, not aspirational.

1. **Typography first.** Hasklig at 16px, centered ~70ch column,
   generous line-height. The writing surface should look like a
   well-set page, not a text box.
2. **No chrome.** No toolbars, no ribbons, no sidebars. Just the
   shared krill titlebar + status line.
3. **Muted markdown syntax.** `#`, `*`, `_`, backticks, link
   brackets render at ~40–50% contrast of body text so prose reads
   as prose while structure stays legible.
4. **Stillness.** No animations beyond cursor/scroll. No popups or
   toasts during writing — only the calm external-change banner
   if the open file is modified on disk while the buffer is dirty.
5. **Keyboard primary.** Every action reachable from the keyboard.

## Stack

- **Shell:** Tauri 2 (Rust backend + system webview).
- **Frontend:** TypeScript + Vite. Editor: CodeMirror 6 (history,
  line numbers, search, lineWrapping; no language modes beyond a
  thin markdown decoration layer for syntax muting).
- **Chrome:** [`@krill-software/desktop-ui`](https://github.com/krill-software/desktop-ui)
  provides titlebar, menu, status line, palette tokens, bundled
  JetBrains Mono + Hasklig, and the action registry.
- **State / fs / file watcher:** [`krill-desktop-core`](https://github.com/krill-software/desktop-core)
  for XDG dirs and file helpers; local `watch.rs` (notify-rs) for
  the external-change watcher.
- **Markdown rendering pipeline:** kept locally — `markdown-it` +
  `markdown-it-task-lists` + `highlight.js` + `katex` + `mermaid`.
  Used **only** by Export-to-HTML and the in-app Syntax Guide
  reference, never as a live preview surface.

## Typography

| Surface         | Family       | Size  | Notes                              |
|-----------------|--------------|-------|------------------------------------|
| Editor body     | Hasklig      | 16px  | User-adjustable Ctrl = / − / 0     |
| Chrome (menu, titlebar, status) | JetBrains Mono | 12px | From desktop-ui     |
| Syntax-guide / exported HTML body | Charter | 16px | Bundled by app             |
| Exported HTML headings | Inter   | varies | Bundled by app                   |

- Centered text column, max 70ch (edit) / ~68ch (export).
- Muted markdown markers via a CodeMirror decoration plugin
  (`muted-markdown.ts`).
- Font size persisted to state.

## Color

Locked palette from `@krill-software/desktop-ui`. See krill STYLE.md
for the canonical set. No app-specific palette tokens.

## UX

### Modes

The window is always in **edit mode**. There is no preview mode
inside this app. To inspect rendered output, the user invokes
`Ctrl+Shift+V` ("Open in Viewer"), which shells out to
`krill-markdown-viewer` detached.

### Focus mode

`Ctrl+Shift+F` toggles paragraph focus — every line except the
active paragraph fades to muted. No persistence per-file in v1.

### Window

- Single window per file. Opening a second file launches a second
  process/window.
- Titlebar: filename centered, dirty marker (Shimmering Blush `•`)
  hung absolute-right of the filename by desktop-ui's
  `body[data-dirty]` rule. The OS-level window title is
  `<filename> — Markdown Editor` (no inline dirty mark; the
  visual marker carries it).
- Status line: `vX.Y.Z` left (per STYLE.md convention); mode badge
  + word count right.
- Window geometry persisted to
  `$XDG_STATE_HOME/krill-markdown-editor/state.json`.

### Keybindings

| Action                            | Key             |
|-----------------------------------|-----------------|
| Open                              | `Ctrl+O`        |
| Save                              | `Ctrl+S`        |
| Save As                           | `Ctrl+Shift+S`  |
| New (empty buffer)                | `Ctrl+N`        |
| Quit                              | `Ctrl+Q`        |
| Open in Viewer                    | `Ctrl+Shift+V`  |
| Focus mode                        | `Ctrl+Shift+F`  |
| Export to HTML                    | `Ctrl+Shift+H`  |
| Increase / decrease / reset font  | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Undo / Redo / Select-all          | CodeMirror defaults |

## File handling

- **Formats:** `.md`, `.markdown`, `.mdown`, `.mkd`. UTF-8 only.
- **Open from CLI:** `krill-markdown-editor path/to/file.md`.
- **Open with no arg:** empty untitled buffer.
- **Dirty tracking:** compare current buffer hash to last-saved
  hash. Confirm on close / open / new if dirty.
- **External-change handling:** the open file's parent directory
  is watched via `notify`. On a change event for the open file:
  - If the buffer is **clean**, the file is silently reloaded.
  - If the buffer is **dirty**, a calm bottom-right banner appears
    with "Reload" (lose local edits) and "Keep mine" (re-baseline
    so the next save overwrites disk).
- **No autosave** in v1.

## Markdown flavor (rendering pipeline)

The rendering pipeline is **not** exposed as a live preview. It
runs only when:
- The user invokes Export-to-HTML (output written to a file).
- The user opens the Syntax Guide (in-app reference document).

It supports:
- CommonMark + GitHub-flavored extensions (tables, strikethrough,
  task lists, autolinks).
- Syntax-highlighted code blocks via `highlight.js`.
- Math: KaTeX, on `$…$` (inline) and `$$…$$` (block).
- Diagrams: Mermaid, in `mermaid` fenced code blocks.
- Front matter: `---` YAML block at top passed through visually.

## Export

- **HTML:** self-contained file via `Ctrl+Shift+H`. Inlined CSS,
  inlined bundled fonts (Charter, Inter, Hasklig), KaTeX CSS from
  CDN, Mermaid rendered to inline SVG at export time.
- **PDF:** **removed.** Use markdown-viewer's PDF export instead.

## Theming

Light only, suite-wide locked palette. No dark mode toggle, no
theme picker, no user palettes. (The shared dark-mode response
via `prefers-color-scheme` inverts background + ink only.)

## Linux integration

- `.desktop` entry with `MimeType=text/markdown;`.
- Binary name: `krill-markdown-editor`.
- State: `$XDG_STATE_HOME/krill-markdown-editor/state.json`.
- Distribution: AppImage + `.deb` via shared krill release
  workflow. In-app updater wired through desktop-ui.

## Open questions

- Whether to drop the in-app Syntax Guide entirely and link to a
  web reference (would let us remove the rendering pipeline from
  this app's runtime). Deferred.
- Whether the HTML export should self-contain KaTeX CSS (currently
  via CDN, brittle if offline at view time).

## Milestones

1. **M1 — Editor + typography.** Done. Tauri shell, CodeMirror
   surface, Hasklig, muted syntax, save/open/new, status line,
   font-size persistence.
2. **M2 — Focus mode.** Done. `Ctrl+Shift+F` paragraph fade.
3. **M3 — Companion handoff.** Done. `Ctrl+Shift+V` shells out to
   `krill-markdown-viewer` for rendered output.
4. **M4 — Export to HTML.** Done.
5. **M5 — External-change watcher.** Done. Reload-if-clean,
   banner-if-dirty.
6. **M6 — Suite convention pass.** Done. Version in statusInfo,
   dirty marker via desktop-ui, no inline dirty in document.title.
