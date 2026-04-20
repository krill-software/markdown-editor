import "katex/dist/katex.min.css";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { getMatches } from "@tauri-apps/plugin-cli";
import { confirm, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { createEditor, type EditorHandle } from "./editor";
import { exportHtml, exportPdf } from "./export";
import { createPreview, type PreviewHandle } from "./preview";

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

const persisted: PersistedState = {};
const docState: DocState = {
  path: null,
  savedHash: hash(""),
  currentHash: hash(""),
};

let editor: EditorHandle;
let preview: PreviewHandle;
let previewRoot: HTMLElement;
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
  const name = docState.path ? basename(docState.path) : "Untitled";
  const mark = isDirty() ? " •" : "";
  const title = `${name}${mark} — Markdown`;
  document.title = title;
  getCurrentWindow().setTitle(title).catch(() => {});
}

function updateStatus(contents: string) {
  const name = docState.path ? basename(docState.path) : "Untitled";
  const nameEl = document.getElementById("status-name")!;
  const dirtyEl = document.getElementById("status-dirty")!;
  const wordsEl = document.getElementById("status-words")!;
  const modeEl = document.getElementById("status-mode")!;
  nameEl.textContent = name;
  dirtyEl.dataset.dirty = String(isDirty());
  const words = contents.trim() ? contents.trim().split(/\s+/).length : 0;
  wordsEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  modeEl.textContent = preview?.isOpen() ? "preview" : "";
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
    docState.path = res.path;
    docState.savedHash = hash(res.contents);
    docState.currentHash = docState.savedHash;
    updateTitle();
    updateStatus(res.contents);
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
    defaultPath: docState.path ?? "untitled.md",
  });
  if (!path) return false;
  docState.path = path;
  return save();
}

async function newFile() {
  if (!(await confirmDiscardIfDirty())) return;
  editor.setDoc("");
  docState.path = null;
  docState.savedHash = hash("");
  docState.currentHash = docState.savedHash;
  updateTitle();
  updateStatus("");
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
  preview.toggle(editor.getDoc());
  updateStatus(editor.getDoc());
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
    if (isDirty()) {
      const ok = await confirm("You have unsaved changes. Close anyway?", {
        title: "Unsaved changes",
        kind: "warning",
      });
      if (!ok) event.preventDefault();
    }
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

  const editorRoot = document.getElementById("editor-root")!;
  previewRoot = document.getElementById("preview-root")!;

  editor = createEditor(editorRoot, "", onDocChange);
  preview = createPreview(previewRoot, () => editor.view.focus());

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
