import "@krill-software/desktop-ui/styles";
import "./styles.css";
import "katex/dist/katex.min.css";

import { mountChrome, type MenuDef } from "@krill-software/desktop-ui";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { getMatches } from "@tauri-apps/plugin-cli";
import { confirm, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { redo, selectAll, undo } from "@codemirror/commands";

import { createEditor, type EditorHandle } from "./editor";
import { exportHtml, exportPdf } from "./export";
import { focusModeEnabled, toggleFocusMode } from "./focus-mode";
import { createPreview, type PreviewHandle } from "./preview";
import { createSyntaxGuide, type SyntaxGuideHandle } from "./syntax-guide";

interface PersistedState {
  font_size?: number;
  window?: { width: number; height: number; x: number; y: number };
}

interface DocState {
  path: string | null;
  savedHash: number;
  currentHash: number;
}

const FONT_MIN = 12;
const FONT_MAX = 28;
const FONT_DEFAULT = 16;
const UNTITLED_NAME = "untitled.md";

const persisted: PersistedState = {};
const docState: DocState = {
  path: null,
  savedHash: hash(""),
  currentHash: hash(""),
};

let editor: EditorHandle;
let preview: PreviewHandle;
let previewRoot: HTMLElement;
let syntaxGuide: SyntaxGuideHandle;
let saveStateTimer: number | undefined;

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isDirty(): boolean {
  return docState.currentHash !== docState.savedHash;
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}

function applyFontSize(size: number) {
  const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(size)));
  document.documentElement.style.setProperty("--fm-font-size", `${clamped}px`);
  persisted.font_size = clamped;
  schedulePersist();
}

function bumpFontSize(delta: number) {
  applyFontSize((persisted.font_size ?? FONT_DEFAULT) + delta);
}

function resetFontSize() {
  applyFontSize(FONT_DEFAULT);
}

function updateTitle() {
  const name = docState.path ? basename(docState.path) : UNTITLED_NAME;
  const mark = isDirty() ? " •" : "";
  const label = `${name}${mark} — Markdown Editor`;
  document.title = label;
  getCurrentWindow().setTitle(label).catch(() => {});
}

function updateStatus(contents: string) {
  const name = docState.path ? basename(docState.path) : UNTITLED_NAME;
  const nameEl = document.getElementById("status-name")!;
  const dirtyEl = document.getElementById("status-dirty")!;
  const wordsEl = document.getElementById("status-words")!;
  const modeEl = document.getElementById("status-mode")!;
  nameEl.textContent = name;
  dirtyEl.dataset.dirty = String(isDirty());
  const words = contents.trim() ? contents.trim().split(/\s+/).length : 0;
  wordsEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  modeEl.textContent = syntaxGuide?.isOpen()
    ? "help"
    : preview?.isOpen()
      ? "preview"
      : "";
}

function onDocChange(contents: string) {
  docState.currentHash = hash(contents);
  updateTitle();
  updateStatus(contents);
}

async function openPath(path: string) {
  try {
    const res = await invoke<{ path: string; contents: string }>("read_file", {
      path,
    });
    editor.setDoc(res.contents);
    const normalized = editor.getDoc();
    docState.path = res.path;
    docState.savedHash = hash(normalized);
    docState.currentHash = docState.savedHash;
    updateTitle();
    updateStatus(normalized);
  } catch (e) {
    console.error("open failed:", e);
  }
}

async function openViaDialog() {
  if (!(await confirmDiscardIfDirty())) return;
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (typeof selected === "string") {
    await openPath(selected);
  }
}

async function save(): Promise<boolean> {
  const contents = editor.getDoc();
  if (!docState.path) return saveAs();
  try {
    const written = await invoke<string>("write_file", {
      path: docState.path,
      contents,
    });
    docState.path = written;
    docState.savedHash = hash(contents);
    docState.currentHash = docState.savedHash;
    updateTitle();
    updateStatus(contents);
    return true;
  } catch (e) {
    console.error("save failed:", e);
    return false;
  }
}

async function saveAs(): Promise<boolean> {
  const path = await saveDialog({
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    defaultPath: docState.path ?? UNTITLED_NAME,
  });
  if (!path) return false;
  docState.path = path;
  return save();
}

async function newFile() {
  if (!(await confirmDiscardIfDirty())) return;
  editor.setDoc("");
  const normalized = editor.getDoc();
  docState.path = null;
  docState.savedHash = hash(normalized);
  docState.currentHash = docState.savedHash;
  updateTitle();
  updateStatus(normalized);
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!isDirty()) return true;
  return await confirm("You have unsaved changes. Discard them?", {
    title: "Unsaved changes",
    kind: "warning",
  });
}

async function quit() {
  await getCurrentWindow().close();
}

function togglePreview() {
  if (syntaxGuide?.isOpen()) syntaxGuide.hide();
  preview.toggle(editor.getDoc());
  updateStatus(editor.getDoc());
}

function toggleSyntaxGuide() {
  if (preview?.isOpen()) preview.hide();
  syntaxGuide.toggle();
  updateStatus(editor.getDoc());
}

function toggleFocus() {
  setFocus(!editor.view.state.field(focusModeEnabled));
}

function setFocus(enabled: boolean) {
  const view = editor.view;
  if (view.state.field(focusModeEnabled) === enabled) return;
  view.dispatch({ effects: toggleFocusMode.of(enabled) });
}

function installMarginClickToggle() {
  const root = document.getElementById("editor-root");
  if (!root) return;
  root.addEventListener(
    "mousedown",
    (e) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest(".cm-content")) setFocus(true);
      else if (target.closest(".cm-scroller")) setFocus(false);
    },
    { capture: true },
  );
}

function buildMenus(): MenuDef[] {
  const withFocus = (cmd: (view: any) => boolean) => {
    const view = editor.view;
    cmd(view);
    view.focus();
  };
  const clipboard = (command: "cut" | "copy" | "paste") => {
    editor.view.focus();
    document.execCommand(command);
  };
  return [
    {
      label: "File",
      items: [
        { label: "New", shortcut: "Ctrl+N", action: () => void newFile() },
        { label: "Open…", shortcut: "Ctrl+O", action: () => void openViaDialog() },
        { sep: true },
        { label: "Save", shortcut: "Ctrl+S", action: () => void save() },
        { label: "Save As…", shortcut: "Ctrl+Shift+S", action: () => void saveAs() },
        { sep: true },
        { label: "Export to HTML…", shortcut: "Ctrl+Shift+H", action: () => void runExportHtml() },
        { label: "Export to PDF…", shortcut: "Ctrl+Shift+P", action: () => void runExportPdf() },
        { sep: true },
        { label: "Quit", shortcut: "Ctrl+Q", action: () => void quit() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z", action: () => withFocus(undo) },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", action: () => withFocus(redo) },
        { sep: true },
        { label: "Cut", shortcut: "Ctrl+X", action: () => clipboard("cut") },
        { label: "Copy", shortcut: "Ctrl+C", action: () => clipboard("copy") },
        { label: "Paste", shortcut: "Ctrl+V", action: () => clipboard("paste") },
        { sep: true },
        { label: "Select All", shortcut: "Ctrl+A", action: () => withFocus(selectAll) },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Preview", shortcut: "Ctrl+E", action: togglePreview },
        { label: "Focus Mode", shortcut: "Ctrl+Shift+F", action: toggleFocus },
        { sep: true },
        { label: "Increase Font Size", shortcut: "Ctrl+=", action: () => bumpFontSize(1) },
        { label: "Decrease Font Size", shortcut: "Ctrl+-", action: () => bumpFontSize(-1) },
        { label: "Reset Font Size", shortcut: "Ctrl+0", action: resetFontSize },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Syntax Guide", action: toggleSyntaxGuide },
      ],
    },
  ];
}

/** Build the body chrome via desktop-ui's mountChrome, then graft the
 *  app's three working-view roots (editor / preview / syntax-guide) and
 *  the four status-line spans into the structure it returns. */
function initChrome() {
  const chrome = mountChrome({
    productName: "Markdown Editor",
    menus: buildMenus(),
    showStatusLine: true,
  });
  chrome.viewport.id = "app"; // existing styles target #app

  for (const id of ["editor-root", "preview-root", "syntax-guide-root"]) {
    const sec = document.createElement("section");
    sec.id = id;
    if (id !== "editor-root") {
      sec.classList.add("md-pane");
      sec.setAttribute("aria-hidden", "true");
    }
    chrome.viewport.appendChild(sec);
  }

  const sl = chrome.statusLine!;
  for (const id of ["status-name", "status-dirty", "status-mode", "status-words"]) {
    const span = document.createElement("span");
    span.id = id;
    if (id === "status-dirty") span.setAttribute("aria-hidden", "true");
    sl.appendChild(span);
  }
}

async function runExportHtml() {
  try {
    await exportHtml(editor.getDoc(), docState.path, previewRoot, preview);
  } catch (e) {
    console.error("HTML export failed:", e);
  }
}

async function runExportPdf() {
  try {
    await exportPdf(editor.getDoc(), preview);
  } catch (e) {
    console.error("PDF export failed:", e);
  }
}

function installKeybindings() {
  const mac = navigator.platform.toLowerCase().includes("mac");
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && syntaxGuide?.isOpen()) {
        syntaxGuide.hide();
        updateStatus(editor.getDoc());
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const shift = e.shiftKey;
      let handled = true;
      if (key === "s" && !shift) void save();
      else if (key === "s" && shift) void saveAs();
      else if (key === "o" && !shift) void openViaDialog();
      else if (key === "n" && !shift) void newFile();
      else if (key === "q" && !shift) void quit();
      else if (key === "e" && !shift) togglePreview();
      else if (key === "f" && shift) toggleFocus();
      else if (key === "h" && shift) void runExportHtml();
      else if (key === "p" && shift) void runExportPdf();
      else if (key === "=" || key === "+") bumpFontSize(1);
      else if (key === "-") bumpFontSize(-1);
      else if (key === "0") resetFontSize();
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
}

function schedulePersist() {
  if (saveStateTimer !== undefined) {
    clearTimeout(saveStateTimer);
  }
  saveStateTimer = window.setTimeout(() => {
    invoke("save_state", { state: persisted }).catch(() => {});
  }, 300);
}

async function installWindowPersistence() {
  const w = getCurrentWindow();
  if (persisted.window) {
    const { width, height, x, y } = persisted.window;
    await w.setSize(new LogicalSize(width, height)).catch(() => {});
    await w.setPosition(new LogicalPosition(x, y)).catch(() => {});
  }
  const record = async () => {
    try {
      const size = await w.innerSize();
      const pos = await w.outerPosition();
      const factor = await w.scaleFactor();
      persisted.window = {
        width: Math.round(size.width / factor),
        height: Math.round(size.height / factor),
        x: Math.round(pos.x / factor),
        y: Math.round(pos.y / factor),
      };
      schedulePersist();
    } catch {
      /* ignore */
    }
  };
  await w.onResized(record);
  await w.onMoved(record);
  await w.onCloseRequested(async (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    const ok = await confirm("You have unsaved changes. Close anyway?", {
      title: "Unsaved changes",
      kind: "warning",
    });
    if (ok) await w.destroy();
  });
}

async function boot() {
  try {
    const loaded = await invoke<PersistedState | null>("load_state");
    if (loaded) Object.assign(persisted, loaded);
  } catch {
    /* no prior state */
  }

  applyFontSize(persisted.font_size ?? FONT_DEFAULT);

  initChrome();

  const editorRoot = document.getElementById("editor-root")!;
  previewRoot = document.getElementById("preview-root")!;

  editor = createEditor(editorRoot, "", onDocChange);
  preview = createPreview(previewRoot, () => editor.view.focus());
  const syntaxGuideRoot = document.getElementById("syntax-guide-root")!;
  syntaxGuide = createSyntaxGuide(syntaxGuideRoot, () => {
    editor.view.focus();
    updateStatus(editor.getDoc());
  });

  installMarginClickToggle();
  installKeybindings();
  await installWindowPersistence();

  let openedFromArg = false;
  try {
    const matches = await getMatches();
    const fileArg = matches.args.file?.value;
    if (typeof fileArg === "string" && fileArg.length > 0) {
      await openPath(fileArg);
      openedFromArg = true;
    }
  } catch {
    /* cli plugin unavailable or no args */
  }

  if (!openedFromArg && import.meta.env.DEV) {
    try {
      const devFile = await invoke<string | null>("dev_test_file");
      if (devFile) await openPath(devFile);
    } catch {
      /* no dev file available */
    }
  }

  updateTitle();
  updateStatus(editor.getDoc());
  editor.view.focus();
}

boot().catch((e) => {
  console.error("boot failed:", e);
});
