import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import charterBold from "/src/assets/fonts/Charter-Bold.woff2?url";
import charterBoldIt from "/src/assets/fonts/Charter-BoldItalic.woff2?url";
import charterIt from "/src/assets/fonts/Charter-Italic.woff2?url";
import charterReg from "/src/assets/fonts/Charter-Regular.woff2?url";
import hasklgBold from "/src/assets/fonts/Hasklig-Bold.woff2?url";
import hasklgBoldIt from "/src/assets/fonts/Hasklig-BoldItalic.woff2?url";
import hasklgIt from "/src/assets/fonts/Hasklig-Italic.woff2?url";
import hasklgReg from "/src/assets/fonts/Hasklig-Regular.woff2?url";
import interBold from "/src/assets/fonts/Inter-Bold.woff2?url";
import interReg from "/src/assets/fonts/Inter-Regular.woff2?url";
import interSB from "/src/assets/fonts/Inter-SemiBold.woff2?url";

import type { PreviewHandle } from "./preview";

interface FontSpec {
  family: string;
  weight: number;
  style: "normal" | "italic";
  url: string;
}

const FONTS: FontSpec[] = [
  { family: "Charter", weight: 400, style: "normal", url: charterReg },
  { family: "Charter", weight: 700, style: "normal", url: charterBold },
  { family: "Charter", weight: 400, style: "italic", url: charterIt },
  { family: "Charter", weight: 700, style: "italic", url: charterBoldIt },
  { family: "Inter", weight: 400, style: "normal", url: interReg },
  { family: "Inter", weight: 600, style: "normal", url: interSB },
  { family: "Inter", weight: 700, style: "normal", url: interBold },
  { family: "Hasklig", weight: 400, style: "normal", url: hasklgReg },
  { family: "Hasklig", weight: 700, style: "normal", url: hasklgBold },
  { family: "Hasklig", weight: 400, style: "italic", url: hasklgIt },
  { family: "Hasklig", weight: 700, style: "italic", url: hasklgBoldIt },
];

const KATEX_CSS_CDN =
  "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";

async function fontToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function buildFontFaceCss(): Promise<string> {
  const parts = await Promise.all(
    FONTS.map(async (f) => {
      const data = await fontToDataUrl(f.url);
      return `@font-face {
  font-family: "${f.family}";
  font-weight: ${f.weight};
  font-style: ${f.style};
  font-display: block;
  src: url("${data}") format("woff2");
}`;
    }),
  );
  return parts.join("\n");
}

const PREVIEW_CSS = `
:root {
  --fm-mono: "Hasklig", "Source Code Pro", "JetBrains Mono", ui-monospace, monospace;
  --fm-serif: "Charter", Georgia, "Liberation Serif", serif;
  --fm-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --fm-bg: #FAFAFF;
  --fm-text: #30343F;
  --fm-muted: #878472;
  --fm-accent: #DD7596;
  --fm-selection: rgba(221, 117, 150, 0.22);
  --fm-rule: rgba(48, 52, 63, 0.08);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--fm-bg);
  color: var(--fm-text);
  font-family: var(--fm-serif);
  font-size: 18px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

main {
  max-width: 68ch;
  margin: 0 auto;
  padding: clamp(32px, 6vh, 80px) clamp(24px, 4vw, 48px);
}

main :is(h1, h2, h3, h4, h5, h6) {
  font-family: var(--fm-sans);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.015em;
  margin: 1.6em 0 0.6em;
  color: var(--fm-text);
}
main > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
main h1 { font-size: 1.75em; }
main h2 { font-size: 1.4em; }
main h3 { font-size: 1.2em; }
main h4 { font-size: 1.05em; }
main h5 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em; }
main h6 { font-size: 0.95em; color: var(--fm-muted); text-transform: uppercase; letter-spacing: 0.06em; }

main p { margin: 0 0 1em; }
main :is(em, i) { font-style: italic; }
main :is(strong, b) { font-weight: 700; }
main del, main s { color: var(--fm-muted); }

main a {
  color: var(--fm-accent);
  text-decoration: none;
  border-bottom: 1px solid var(--fm-selection);
}

main :is(ul, ol) { margin: 0 0 1em; padding-left: 1.5em; }
main li { margin: 0.25em 0; }
main li.task-list-item { list-style: none; margin-left: -1.2em; }
main li.task-list-item input[type="checkbox"] { margin-right: 0.4em; accent-color: var(--fm-accent); transform: translateY(1px); }

main blockquote {
  margin: 0 0 1em;
  padding: 0.1em 1em;
  border-left: 2px solid var(--fm-accent);
  color: var(--fm-muted);
  font-style: italic;
}
main blockquote p { margin: 0.5em 0; }

main hr {
  border: 0; margin: 2em auto; width: 6em; height: 1px;
  background: linear-gradient(90deg, transparent, var(--fm-muted), transparent);
  opacity: 0.55;
}

main :is(code, pre) {
  font-family: var(--fm-mono);
  font-feature-settings: "calt" 1, "liga" 1;
}
main :not(pre) > code {
  font-size: 0.9em;
  background: var(--fm-rule);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
main pre {
  margin: 0 0 1em;
  padding: 0.9em 1em;
  background: var(--fm-rule);
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.9em;
  line-height: 1.55;
}
main pre code { background: transparent; padding: 0; font-size: inherit; }

main .front-matter {
  color: var(--fm-muted);
  font-size: 0.8em;
  background: transparent;
  border: 1px dashed var(--fm-rule);
  border-radius: 3px;
  padding: 0.5em 0.8em;
  margin-bottom: 2em;
}

main .mermaid { margin: 1.5em 0; text-align: center; }
main .mermaid svg { max-width: 100%; height: auto; display: inline-block; }

main .math-block { margin: 1.5em 0; overflow-x: auto; }
main .math-block .katex-display { margin: 0; }
main .math-error {
  font-family: var(--fm-mono);
  color: var(--fm-accent);
  background: var(--fm-rule);
  padding: 0.1em 0.4em;
  border-radius: 3px;
}

main table {
  border-collapse: collapse; margin: 0 0 1em; width: 100%; font-size: 0.95em;
}
main thead th {
  text-align: left; font-weight: 700;
  border-bottom: 1px solid var(--fm-text);
  padding: 0.45em 0.8em;
}
main tbody td { padding: 0.4em 0.8em; border-bottom: 1px solid var(--fm-rule); }
main table tr:last-child td { border-bottom: none; }

main img { max-width: 100%; height: auto; display: block; margin: 1em auto; }

main kbd {
  font-family: var(--fm-mono); font-size: 0.85em;
  background: var(--fm-rule); border: 1px solid var(--fm-selection);
  border-radius: 3px; padding: 0.05em 0.35em;
}

/* highlight.js token colors */
main pre {
  --hl-keyword: #6B4A7A;
  --hl-type: #4A7C9A;
  --hl-string: var(--fm-accent);
  --hl-number: #B07B3E;
  --hl-comment: var(--fm-muted);
}
main .hljs-comment, main .hljs-quote { color: var(--hl-comment); font-style: italic; }
main .hljs-keyword, main .hljs-selector-tag, main .hljs-subst { color: var(--hl-keyword); font-weight: 700; }
main .hljs-string, main .hljs-regexp, main .hljs-addition, main .hljs-meta .hljs-string { color: var(--hl-string); }
main .hljs-number, main .hljs-literal { color: var(--hl-number); }
main .hljs-type, main .hljs-built_in, main .hljs-class .hljs-title, main .hljs-property, main .hljs-tag, main .hljs-name { color: var(--hl-type); }
main .hljs-title, main .hljs-title.function_, main .hljs-section, main .hljs-function .hljs-title { color: var(--fm-text); font-weight: 700; }
main .hljs-variable, main .hljs-params, main .hljs-attr, main .hljs-attribute { color: var(--fm-text); }
main .hljs-meta, main .hljs-meta .hljs-keyword { color: var(--hl-comment); }
main .hljs-deletion { color: var(--fm-accent); text-decoration: line-through; }
main .hljs-emphasis { font-style: italic; }
main .hljs-strong { font-weight: 700; }
`.trim();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function deriveTitle(body: string, fallback: string): string {
  const m = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) {
    const stripped = m[1].replace(/<[^>]+>/g, "").trim();
    if (stripped) return stripped;
  }
  return fallback;
}

function buildHtmlDocument(title: string, body: string, css: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${KATEX_CSS_CDN}">
<style>
${css}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

async function ensurePreviewReady(
  docSource: string,
  preview: PreviewHandle,
): Promise<void> {
  if (!preview.isOpen()) {
    preview.show(docSource);
  } else {
    preview.show(docSource);
  }
  await new Promise((r) => setTimeout(r, 450));
}

export async function exportHtml(
  docSource: string,
  currentPath: string | null,
  previewRoot: HTMLElement,
  preview: PreviewHandle,
): Promise<void> {
  await ensurePreviewReady(docSource, preview);

  const body = previewRoot.innerHTML;
  const fontCss = await buildFontFaceCss();
  const css = `${fontCss}\n\n${PREVIEW_CSS}`;
  const defaultName = stripExt(basename(currentPath ?? "untitled.md")) + ".html";
  const title = deriveTitle(body, stripExt(defaultName));
  const doc = buildHtmlDocument(title, body, css);

  const target = await saveDialog({
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    defaultPath: defaultName,
  });
  if (!target) return;

  await invoke("write_file", { path: target, contents: doc });
}

export async function exportPdf(
  docSource: string,
  preview: PreviewHandle,
): Promise<void> {
  await ensurePreviewReady(docSource, preview);
  window.print();
}
