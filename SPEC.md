# Markdown Editor — Spec (v1)

A minimal, keyboard-driven markdown editor for Linux. Single-file oriented. Source-first with a toggleable preview. **The product is the UX, not the feature list** — the bar is iA Writer, not Obsidian.

## Goals

- Open, edit, save one `.md` file at a time — fast launch, no project/vault concept.
- Source-only editor by default; press a key to flip to a rendered preview of the same file.
- Feel like a native Linux desktop app (`.desktop` entry, file associations, XDG dirs).
- **Feel beautiful to write in.** Typography, spacing, and calm are first-class requirements, not polish-phase work.

## Roadmap beyond v1

- Focus mode was pulled forward into v1 (paragraph-scope; sentence-scope and per-file persistence are later refinements).

## UX principles (iA Writer-inspired)

These are binding, not aspirational. If a feature would compromise one of these, cut the feature.

1. **Typography first.** A beautiful monospace typeface, generous line-height, a centered/max-width text column. The writing surface should look like a well-set page, not a text box.
2. **No chrome.** No toolbars, no ribbons, no sidebars. A subtle status line at the bottom (filename, dirty state, word count) and nothing else. Everything reachable by keyboard.
3. **Muted markdown syntax.** `#`, `*`, `_`, backticks, link brackets etc. render dimmer than prose in edit mode, so the text reads as text while structure stays visible.
4. **Calm palette.** Single light theme, locked. Soft ink, off-white background, muted olive for secondary text. No dark mode — the product has a look.
5. **Stillness.** No animations beyond what's functionally necessary (cursor, scroll). No popups, toasts, or modals during normal writing.
6. **Keyboard is primary.** Every action is reachable from the keyboard. Mouse is supported but never required.

## Non-goals (v1)

- No note vault / backlinks / tags / graph.
- No WYSIWYG or inline-rendered hybrid editing.
- No multi-tab or multi-window session management (one file per window).
- No plugin system, no cloud sync, no collaborative editing.
- No Windows/macOS builds.

## Stack

- **Shell:** Tauri 2 (Rust backend + system webview).
- **Frontend:** TypeScript + Vite. Editor component: CodeMirror 6.
- **Markdown → HTML:** `markdown-it` (CommonMark + GFM plugins) in the frontend.
- **Syntax highlighting:** Shiki or `highlight.js` inside preview.
- **Math:** KaTeX (auto-render on `$...$` and `$$...$$`).
- **Diagrams:** Mermaid (rendered from ` ```mermaid ` fenced blocks).
- **Export:** HTML via direct render; PDF via the webview's print-to-PDF API.

Rationale: Tauri gives a small binary and real Rust file I/O. Doing markdown rendering in the webview keeps KaTeX/Mermaid/Shiki simple (they're all web-native).

## Typography

- **Default typeface:** **Hasklig** (open source, SIL OFL — a Source Code Pro fork with programming ligatures). Bundled with the app as WOFF2.
- **Fallbacks:** `"Source Code Pro"`, `"JetBrains Mono"`, `ui-monospace`, `monospace`.
- **Size:** 16px default, user-adjustable via `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (persisted to state).
- **Line height:** 1.6 in edit mode, 1.7 in preview.
- **Text column:** max-width 70ch (edit) / ~68ch (preview), centered in the window. No full-width editing even on wide monitors.
- **Padding:** generous vertical padding so the first and last lines are never flush against the window edge.
- **Muted syntax tokens:** in edit mode, markdown markers (`#`, `*`, `_`, ``` ` ```, `[` `]`, `(` `)` in links, `>`, list bullets) render at ~40–50% contrast of body text. Implemented via CodeMirror decorations keyed off the markdown parser.

## Color

Single theme (light only). Palette locked: https://coolors.co/30343f-878472-fafaff-ff82bf-dd7596

| Role | Hex | Usage |
|---|---|---|
| Ghost White | `#FAFAFF` | Background |
| Space Cadet | `#30343F` | Body text |
| Artichoke | `#878472` | Muted — markdown syntax markers, status line, secondary text |
| Shimmering Blush | `#DD7596` | Accent — cursor, selection tint, dirty dot, link color |
| Brilliant Rose | `#FF82BF` | Reserved for strong/hover states in preview (links, callouts) |

Dark theme is explicitly out of scope — not in v1, not in the roadmap. Single-palette design is a product decision.

## UX

### Modes

1. **Edit mode** (default): full-window CodeMirror editing the raw markdown source.
2. **Preview mode**: full-window rendered HTML of the current buffer. Read-only.

A single key toggles between them (`Ctrl+E` tentative). No split view in v1.

Preview mode uses **Inter** (bundled, SIL OFL) for headings and **Charter** (bundled, Bitstream → X Consortium permissive license) for body prose, with Hasklig kept for inline `code` and code blocks. Charter was chosen as the closest screen-optimized open substitute for Georgia (same designer as Georgia: Matthew Carter).

### Window

- Single window per file. Opening a second file launches a second process/window.
- Title bar shows `<filename> [• if dirty] — Markdown`.
- Remember last window size/position in `$XDG_STATE_HOME/fippli-markdown/window.json`.

### Keybindings (v1)

| Action | Key |
|---|---|
| Toggle edit/preview | `Ctrl+E` |
| Toggle focus mode | `Ctrl+Shift+F` |
| Increase/decrease/reset font size | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Open | `Ctrl+O` |
| New (empty buffer) | `Ctrl+N` |
| Export to HTML | `Ctrl+Shift+H` |
| Export to PDF | `Ctrl+Shift+P` |
| Quit | `Ctrl+Q` |

Standard editor keys (undo/redo/find/replace) come from CodeMirror defaults.

## File handling

- **Formats:** `.md`, `.markdown`. UTF-8 only.
- **Open from CLI:** `fippli-markdown path/to/file.md` opens directly in edit mode.
- **Open with no arg:** empty untitled buffer; Save prompts for a path.
- **Dirty tracking:** compare current buffer hash to on-disk hash. Prompt on close if dirty.
- **External changes:** watch the open file; if it changes on disk and buffer is clean, reload. If dirty, show a non-blocking banner offering Reload / Keep Mine.
- **No autosave** in v1.

## Markdown flavor

- CommonMark + GitHub-flavored extensions (tables, strikethrough, task lists, autolinks).
- Front matter (`---` YAML block at top) is passed through visually (rendered as a dimmed code block in preview, editable as normal in source). No parsing of front matter values in v1.

## Export

- **HTML:** self-contained file — inlined CSS, inlined KaTeX fonts (or CDN link, TBD), Mermaid rendered to inline SVG at export time.
- **PDF:** via `webview.printToPdf()` on the preview DOM. Default paper: A4. No custom templates in v1.

## Theming

- One theme only — light, per the locked palette. No dark mode, no system following, no user-authored themes.

## Linux integration

- Ship a `.desktop` file with `MimeType=text/markdown;`.
- Binary name: `fippli-markdown`.
- Config: `$XDG_CONFIG_HOME/fippli-markdown/config.toml` (empty/optional in v1).
- State: `$XDG_STATE_HOME/fippli-markdown/`.
- Distribution: AppImage as primary artifact for v1. `.deb` and Flatpak deferred.

## Out of scope / open questions

- Focus mode ships in v1 (paragraph-scope only; sentence-scope and per-file persistence are later refinements).
- Spellcheck — not in v1.
- Image paste / drag-drop — not in v1 (would need a sidecar assets strategy).
- Whether KaTeX fonts ship inline in exported HTML or reference a CDN — decide during export impl.
- Final palette hex values — pending a design pass before M2.
- Whether to bundle a serif face for preview or rely on system serif — decide during M2.

## Milestones

1. **M1 — Skeleton + typography:** Tauri app launches, opens a file via CLI arg, edits, saves. Hasklig bundled, centered 70ch text column, locked light palette, muted markdown syntax via CodeMirror decorations. **The app should already feel beautiful at M1** — everything after is features layered on top.
2. **M2 — Preview:** `Ctrl+E` toggle, markdown-it rendering, syntax-highlighted code blocks, serif body in preview.
3. **M3 — Math + diagrams:** KaTeX + Mermaid in preview.
4. **M4 — Export:** HTML and PDF export paths.
5. **M5 — Packaging:** `.desktop` file, AppImage build, MIME association.
