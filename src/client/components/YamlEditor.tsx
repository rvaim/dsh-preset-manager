/** Real YAML editor shared by entry, full-document and read-only views. */
import * as React from 'react'
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import { tags } from '@lezer/highlight'
import { indentGuideColumns } from './yaml-indentation.js'

const externalChange = Annotation.define<boolean>()
export const yamlHighlightStyle = HighlightStyle.define([
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--dshpm-code-key)' },
  { tag: [tags.string, tags.special(tags.string), tags.content], color: 'var(--dshpm-code-string)' },
  { tag: [tags.bool, tags.null, tags.atom], color: 'var(--dshpm-code-atom)' },
  { tag: tags.number, color: 'var(--dshpm-code-number)' },
  { tag: [tags.meta, tags.annotation, tags.typeName, tags.labelName, tags.keyword], color: 'var(--dshpm-code-meta)' },
  { tag: tags.comment, color: 'var(--dsw-alias-label-secondary)', fontStyle: 'italic' },
  { tag: tags.punctuation, color: 'var(--dsw-alias-label-secondary)' },
])

function guideDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc
  const lines = doc.toString().split('\n')
  const guides: ReturnType<Decoration['range']>[] = []
  let previous = -1
  for (const visible of view.visibleRanges) {
    for (let position = visible.from; position <= visible.to;) {
      const line = doc.lineAt(position)
      if (line.from !== previous) {
        const columns = indentGuideColumns(lines, line.number - 1, view.state.tabSize)
        if (columns > 0) guides.push(Decoration.line({
          class: 'dshpm-code-indent', attributes: { style: `--dshpm-indent-columns:${columns}` },
        }).range(line.from))
        previous = line.from
      }
      if (line.to >= visible.to || line.to === doc.length) break
      position = line.to + 1
    }
  }
  return Decoration.set(guides, true)
}
const indentGuides = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = guideDecorations(view) }
  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) this.decorations = guideDecorations(update.view)
  }
}, { decorations: (plugin) => plugin.decorations })

export interface YamlEditorProps {
  value: string
  label: string
  readOnly?: boolean
  placeholder?: string
  onChange?(value: string): void
}

export function YamlEditor(props: YamlEditorProps): React.ReactElement {
  const container = React.useRef<HTMLDivElement>(null)
  const editor = React.useRef<EditorView>()
  const onChange = React.useRef(props.onChange)
  const editable = React.useRef(new Compartment())
  onChange.current = props.onChange
  const accessibility = (readOnly: boolean, label: string, emptyText?: string) => [
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-readonly': String(readOnly), tabindex: '0' }),
    ...(emptyText ? [placeholder(emptyText)] : []),
  ]
  React.useLayoutEffect(() => {
    const view = new EditorView({ parent: container.current!, state: EditorState.create({
      doc: props.value,
      extensions: [
        yaml(), lineNumbers(), foldGutter(), history(), drawSelection(),
        highlightActiveLine(), highlightActiveLineGutter(), bracketMatching(), indentOnInput(),
        indentUnit.of('  '), EditorState.tabSize.of(2),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        syntaxHighlighting(yamlHighlightStyle), indentGuides,
        editable.current.of(accessibility(props.readOnly === true, props.label, props.placeholder)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.every((transaction) => transaction.annotation(externalChange))) onChange.current?.(update.state.doc.toString())
        }),
      ],
    }) })
    editor.current = view
    return () => { editor.current = undefined; view.destroy() }
  }, [])
  React.useLayoutEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== props.value) view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.value },
      annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
    })
  }, [props.value])
  React.useLayoutEffect(() => {
    editor.current?.dispatch({ effects: editable.current.reconfigure(accessibility(props.readOnly === true, props.label, props.placeholder)) })
  }, [props.readOnly, props.label, props.placeholder])
  return React.createElement('div', { ref: container, className: 'dshpm-code-editor', 'data-code-editor': 'yaml' })
}
