import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

import { mathPreserve } from "./md-math";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, {
          language: lang,
          ignoreIllegals: true,
        }).value;
      } catch {
        /* fall through to escape-only */
      }
    }
    return "";
  },
});

md.use(taskLists, { enabled: true, label: false });
md.use(mathPreserve);

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ? token.info.trim() : "";
  if (info === "mermaid") {
    const code = token.content.replace(/\n$/, "");
    return `<div class="mermaid">${md.utils.escapeHtml(code)}</div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        themeVariables: {
          background: "#FAFAFF",
          primaryColor: "#FAFAFF",
          primaryTextColor: "#30343F",
          primaryBorderColor: "#30343F",
          lineColor: "#30343F",
          secondaryColor: "#FAFAFF",
          tertiaryColor: "#FAFAFF",
          mainBkg: "#FAFAFF",
          noteBkgColor: "#FAFAFF",
          noteBorderColor: "#878472",
          edgeLabelBackground: "#FAFAFF",
          clusterBkg: "#FAFAFF",
          clusterBorder: "#878472",
        },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

export async function renderMermaidBlocks(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
  if (nodes.length === 0) return;
  try {
    const mermaid = await getMermaid();
    await mermaid.run({ nodes: Array.from(nodes) });
  } catch (e) {
    console.warn("mermaid render failed:", e);
  }
}

function extractFrontMatter(src: string): {
  frontMatter: string | null;
  body: string;
} {
  if (!src.startsWith("---\n")) return { frontMatter: null, body: src };
  const end = src.indexOf("\n---\n", 4);
  if (end === -1) return { frontMatter: null, body: src };
  return {
    frontMatter: src.slice(4, end),
    body: src.slice(end + 5),
  };
}

export function renderMarkdown(src: string): string {
  const { frontMatter, body } = extractFrontMatter(src);
  const bodyHtml = md.render(body);
  if (frontMatter === null) return bodyHtml;
  const fmHtml = `<pre class="front-matter"><code>${md.utils.escapeHtml(
    frontMatter,
  )}</code></pre>`;
  return fmHtml + bodyHtml;
}

// The in-app preview surface (createPreview / PreviewHandle / show /
// hide / toggle) used to live here. It was removed when the standalone
// `markdown-viewer` app took over rendering — the editor is now a pure
// authoring surface. renderMarkdown + renderMermaidBlocks above are
// kept because the syntax-guide and HTML export still need them.
