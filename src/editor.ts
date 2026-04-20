import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";

import { focusMode, focusModeEnabled } from "./focus-mode";
import { mutedMarkdown } from "./muted-markdown";

export interface EditorHandle {
  view: EditorView;
  getDoc(): string;
  setDoc(contents: string): void;
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  onChange: (doc: string) => void,
): EditorHandle {
  const state = EditorState.create({
    doc: initial,
    extensions: [
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      mutedMarkdown,
      focusModeEnabled,
      focusMode,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString());
      }),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc: (contents: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: contents },
      });
    },
  };
}
