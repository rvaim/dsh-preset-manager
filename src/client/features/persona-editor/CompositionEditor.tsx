/** Edit the actual Cordis entry tree; each selected row keeps its complete YAML. */
import * as React from 'react'
import type { PresetDefinition, PresetPluginRow } from '../../../shared/types.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { YamlEditor } from '../../components/YamlEditor.js'
import { Button } from '../../components/primitives.js'
import { dumpPluginRows, parsePluginRows, isGroupRow, isLoaderExpression } from '../../../domain/preset-model.js'
import { validatePreset } from '../../../domain/preset-validator.js'
import { listCompositionRows, getCompositionRow, replaceCompositionRow, appendCompositionRow, removeCompositionRow, moveCompositionRow } from '../../../domain/composition-editor.js'

export interface CompositionEditorProps {
  definition: PresetDefinition
  t: Translate
  busy: boolean
  error?: string
  onChange(next: PresetDefinition): void
  onError(error: string | undefined): void
}

export function CompositionEditor(props: CompositionEditorProps): React.ReactElement {
  const { definition, t } = props
  const entries = listCompositionRows(definition)
  const [selection, setSelection] = React.useState<readonly number[]>(entries[0]?.path ?? [])
  const [version, setVersion] = React.useState(0)
  const [packageName, setPackageName] = React.useState('')
  const active = entries.find((entry) => entry.path.join('.') === selection.join('.')) ?? entries[0]
  const path = active?.path
  const row = active?.row
  const locked = props.busy || props.error !== undefined
  const parent = path && row && isGroupRow(row) ? path : path && path.length > 1 ? path.slice(0, -1) : undefined
  const siblingRows = path && path.length > 1 ? getCompositionRow(definition, path.slice(0, -1)).config as PresetPluginRow[] : definition.plugins
  const apply = (next: PresetDefinition, selected?: readonly number[]): void => {
    props.onChange(next)
    props.onError(undefined)
    if (selected) setSelection(selected)
    setVersion((value) => value + 1)
  }
  const add = (group: boolean): void => {
    const name = packageName.trim()
    if (!group && !name) return
    const next = appendCompositionRow(definition, parent, group ? { name: 'cordis:group', group: true, config: [] } : { name, config: {} })
    const peers = parent ? getCompositionRow(next, parent).config as PresetPluginRow[] : next.plugins
    apply(next, [...(parent ?? []), peers.length - 1])
    setPackageName('')
  }
  const move = (delta: -1 | 1): void => {
    if (!path) return
    const next = moveCompositionRow(definition, path, delta)
    apply(next.definition, next.path)
  }
  return React.createElement('div', { className: 'dshpm-composition-layout' },
    React.createElement('div', { className: 'dshpm-composition-tree' },
      React.createElement('div', { className: 'dshpm-composition-add' },
        React.createElement('input', { className: 'dshpm-input', value: packageName, disabled: locked,
          'aria-label': t('composition.package'), placeholder: '@scope/plugin',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPackageName(event.target.value) }),
        React.createElement(Button, { disabled: locked || !packageName.trim(), onClick: () => add(false) }, t('composition.addPlugin')),
        React.createElement(Button, { disabled: locked, onClick: () => add(true) }, t('composition.addGroup')),
        React.createElement('span', { className: 'dshpm-hint' }, t('composition.addTarget', { target: parent ? getCompositionRow(definition, parent).id || t('composition.group') : t('composition.root') })),
      ),
      React.createElement('div', { className: 'dshpm-tree-list', 'aria-label': t('editor.tabPlugins') },
        entries.map((entry) => React.createElement(CompositionTreeRow, {
          key: entry.path.join('.'), definition, entry, t, disabled: locked,
          selected: active?.path.join('.') === entry.path.join('.'), onSelect: () => setSelection(entry.path),
        }))),
      entries.length === 0 ? React.createElement('p', { className: 'dshpm-hint' }, t('composition.empty')) : null,
    ),
    !row || !path ? React.createElement('div', { className: 'dshpm-composition-detail' }, t('composition.empty')) :
      React.createElement('div', { className: 'dshpm-composition-detail' },
        React.createElement('div', { className: 'dshpm-composition-detail-head' },
          React.createElement('code', { className: 'dshpm-editor-id' }, row.name),
          React.createElement('div', { className: 'dshpm-toolbar' },
            React.createElement(Button, { small: true, disabled: locked || path[path.length - 1] === 0, onClick: () => move(-1) }, t('composition.moveUp')),
            React.createElement(Button, { small: true, disabled: locked || path[path.length - 1] === siblingRows.length - 1, onClick: () => move(1) }, t('composition.moveDown')),
            React.createElement(Button, { small: true, disabled: locked || isLoaderExpression(row.disabled), onClick: () => apply(replaceCompositionRow(definition, path, { ...row, disabled: row.disabled !== true }), path) }, t(row.disabled === true ? 'composition.enable' : 'composition.disable')),
            React.createElement(Button, { small: true, variant: 'danger', disabled: locked, onClick: () => apply(removeCompositionRow(definition, path), []) }, t('composition.remove')),
          )),
        React.createElement('p', { className: 'dshpm-hint' }, t('composition.entryHint')),
        React.createElement(EntryYamlEditor, { key: `${path.join('.')}:${version}`, ...props, path, row }),
      ),
  )
}

function EntryYamlEditor(props: CompositionEditorProps & { path: readonly number[]; row: PresetPluginRow }): React.ReactElement {
  const [text, setText] = React.useState(() => dumpPluginRows([props.row]))
  const edit = (value: string): void => {
    setText(value)
    try {
      const rows = parsePluginRows(value)
      if (rows.length !== 1) throw new Error(props.t('composition.oneEntry'))
      const next = replaceCompositionRow(props.definition, props.path, rows[0]!)
      const validation = validatePreset(next)
      if (!validation.ok) throw new Error(validation.errors.map((issue) => issue.message).join('\n'))
      props.onChange(next)
      props.onError(undefined)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error))
    }
  }
  return React.createElement(YamlEditor, {
    value: text, readOnly: props.busy, label: props.t('composition.entryYaml'), onChange: edit,
  })
}

/** Aligned label/description columns with continuous ancestor branches. */
export function CompositionTreeRow({ definition, entry, t, disabled, selected, onSelect }: {
  definition: PresetDefinition
  entry: { path: number[]; row: PresetPluginRow; depth: number }
  t: Translate
  disabled: boolean
  selected: boolean
  onSelect(): void
}): React.ReactElement {
  const group = isGroupRow(entry.row)
  const guides = Array.from({ length: entry.depth }, (_, level) => {
    const parent = getCompositionRow(definition, entry.path.slice(0, level + 1))
    const siblings = parent.config as PresetPluginRow[]
    const last = entry.path[level + 1] === siblings.length - 1
    if (level < entry.depth - 1 && last) return null
    return React.createElement('span', { key: level, className: 'dshpm-tree-guide',
      style: { insetInlineStart: 17 + level * 18, height: level === entry.depth - 1 && last ? 17 : '100%' },
    })
  })
  return React.createElement('button', {
    type: 'button', className: 'dshpm-tree-node', disabled, title: entry.row.name,
    'aria-current': selected ? 'true' : undefined, style: { paddingInlineStart: 10 + entry.depth * 18 }, onClick: onSelect,
  },
    React.createElement('span', { className: 'dshpm-tree-lines', 'aria-hidden': true },
      guides,
      entry.depth > 0 ? React.createElement('span', { className: 'dshpm-tree-connector', style: { insetInlineStart: 17 + (entry.depth - 1) * 18 } }) : null,
      group && Array.isArray(entry.row.config) && entry.row.config.length > 0 ? React.createElement('span', { className: 'dshpm-tree-stem', style: { insetInlineStart: 17 + entry.depth * 18 } }) : null,
    ),
    React.createElement('svg', { className: 'dshpm-tree-icon', viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
      fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 },
      React.createElement('path', { d: group ? 'M2 4h4l1.4 1.5H14v7H2z M2 4V2.5h4l1.4 1.5' : 'M4 2.5h6l2 2v9H4z M10 2.5v2h2 M6 7h4 M6 9.5h4' })),
    React.createElement('span', { className: 'dshpm-tree-text' },
      React.createElement('span', { className: 'dshpm-tree-label' }, entry.row.id || (group ? t('composition.group') : entry.row.name)),
      React.createElement('span', { className: 'dshpm-tree-description' }, entry.row.disabled === true ? t('composition.disabled') : isLoaderExpression(entry.row.disabled) ? t('composition.conditional') : entry.row.name),
    ),
  )
}
