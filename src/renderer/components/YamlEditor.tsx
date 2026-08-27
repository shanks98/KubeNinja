import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

/** A CodeMirror 6 YAML editor (view/edit). Emits changes; honours `editable`. */
export function YamlEditor({ value, editable = false, onChange }: {
  value: string;
  editable?: boolean;
  onChange?: (v: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editCompartment = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          yaml(),
          oneDark,
          EditorView.theme({ '&': { height: '100%', fontSize: '12.5px' }, '.cm-scroller': { fontFamily: 'var(--mono)' } }),
          editCompartment.current.of([EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a new document when the source value changes (e.g. switching objects).
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  // Toggle editability without recreating the editor.
  useEffect(() => {
    view.current?.dispatch({ effects: editCompartment.current.reconfigure([EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]) });
  }, [editable]);

  return <div ref={host} className="cm-host" />;
}
