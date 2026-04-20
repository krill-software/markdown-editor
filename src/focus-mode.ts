import { RangeSetBuilder, StateEffect, StateField, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

export const toggleFocusMode = StateEffect.define<boolean>();

export const focusModeEnabled = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(toggleFocusMode)) return e.value;
    return value;
  },
});

const dimDecoration = Decoration.line({ class: "cm-focus-dim" });

function paragraphRange(
  doc: Text,
  pos: number,
): { fromLine: number; toLine: number } {
  const line = doc.lineAt(pos);
  let fromLine = line.number;
  let toLine = line.number;
  while (fromLine > 1) {
    const prev = doc.line(fromLine - 1);
    if (prev.text.trim() === "") break;
    fromLine--;
  }
  while (toLine < doc.lines) {
    const next = doc.line(toLine + 1);
    if (next.text.trim() === "") break;
    toLine++;
  }
  return { fromLine, toLine };
}

function buildDecorations(view: EditorView): DecorationSet {
  if (!view.state.field(focusModeEnabled)) return Decoration.none;
  const { state } = view;
  const { fromLine, toLine } = paragraphRange(state.doc, state.selection.main.head);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      if (line.number < fromLine || line.number > toLine) {
        builder.add(line.from, line.from, dimDecoration);
      }
      if (line.to >= state.doc.length) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const focusMode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      const fieldChanged =
        u.startState.field(focusModeEnabled) !== u.state.field(focusModeEnabled);
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        fieldChanged
      ) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
