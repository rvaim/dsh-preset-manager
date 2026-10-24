import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { PresetList, PresetRow, type PresetListProps } from '../../client/features/preset-list/PresetList.js'
import { presetDisplay } from '../../client/features/preset-display.js'
import { ActionButton } from '../../client/components/ActionButton.js'
import { Button } from '../../client/components/primitives.js'
import { Switch } from '../../client/components/Switch.js'
import { IconEdit } from '../../client/components/icons.js'
import { zh, en } from '../../client/locales/index.js'
import { OperationNotice, PresetWorkspace, type Confirmation } from '../../client/pages/PresetManagerPage.js'
import { PresetManagerStore } from '../../client/state/store.js'
import { Dialog } from '../../client/components/Dialog.js'
import { PromptFields, PresetEditor } from '../../client/features/persona-editor/PresetEditor.js'
import { PresetDetailView } from '../../client/features/preset-list/PresetDetailView.js'
import type { PresetDefinition, PresetSummary } from '../../shared/types.js'

type ToggleSummary = PresetSummary & { readonly canToggle?: boolean; readonly enabled?: boolean }

const source: ToggleSummary = {
  id: 'ptc', ownership: 'builtin', registration: 'registered',
  isDefault: false, health: 'healthy', pluginCount: 0,
}
const t = (key: string): string => zh[key] ?? key
function elements(node: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return []
    return [child, ...elements(child.props.children)]
  })
}
function textOf(node: React.ReactNode): string {
  return React.Children.toArray(node).flatMap((child) => {
    if (typeof child === 'string' || typeof child === 'number') return [String(child)]
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return []
    return [textOf(child.props.children)]
  }).join('')
}
function listProps(overrides: Partial<PresetListProps> = {}): PresetListProps {
  const noop = (): void => {}
  return {
    state: new PresetManagerStore().getState(), t, busy: false, ready: true,
    onView: noop, onEditPersona: noop, onExport: async () => true, onToggle: async () => true,
    onHistory: noop, onImport: noop, onData: noop, onRetry: noop,
    ...overrides,
  }
}
function rowProps(
  summary: ToggleSummary,
  overrides: Partial<PresetListProps> = {},
): PresetListProps & { readonly summary: ToggleSummary } {
  return {
    ...listProps(overrides),
    summary,
  }
}
function row(summary: ToggleSummary = source, overrides: Partial<PresetListProps> = {}): React.ReactElement {
  return PresetRow({ ...rowProps(summary, overrides), summary })
}
function withRenderedRows(node: React.ReactNode): React.ReactElement[] {
  return elements(node).flatMap((element) =>
    element.type === PresetRow ? [element, ...elements(PresetRow(element.props))] : [element])
}
function switchIn(node: React.ReactNode): React.ReactElement {
  const found = elements(node).find((element) => element.type === Switch)
  assert.ok(found)
  return found
}

describe('native preset rows', () => {
  it('supplies the native purpose copy for all four shipped presets', () => {
    for (const id of ['standard', 'ptc', 'minimal', 'cordis']) {
      const display = presetDisplay({ ...source, id }, t)
      assert.ok(display.description.length > 20)
      assert.equal(display.description.includes('builtin.'), false)
    }
  })
  it('localizes bundled names even when the Host publishes a Chinese name', () => {
    for (const [id, chinese, english] of [
      ['standard-efficient', '标准增强', 'Standard Efficient'],
      ['codex-original', 'Codex 原版', 'Codex Original'],
    ] as const) {
      const summary = { ...source, id, name: chinese }
      assert.equal(presetDisplay(summary, t).name, chinese)
      assert.equal(presetDisplay(summary, (key) => en[key] ?? key).name, english)
      assert.equal(presetDisplay({ ...summary, ownership: 'managed', name: 'My copy' }, t).name, 'My copy')
    }
  })
  it('preserves a custom preset author’s description', () => {
    const display = presetDisplay({ ...source, ownership: 'managed', name: 'My mode', description: 'My purpose' }, t)
    assert.deepEqual(display, { name: 'My mode', description: 'My purpose' })
  })
  it('keeps Fork out of the preset row', () => {
    const buttons = elements(row()).filter((element) => element.type === ActionButton)
    assert.equal(buttons.some((element) => element.props.label === t('action.fork')), false)
  })
  it('disables all row controls during an operation', () => {
    const controls = elements(row({ ...source, canToggle: true }, { busy: true }))
      .filter((element) => element.type === Button || element.type === ActionButton || element.type === Switch)
    assert.ok(controls.length >= 3)
    assert.ok(controls.every((control) => control.props.disabled === true))
  })
})

describe('preset row enablement', () => {
  it('renders a switch only for entries the Host marks toggleable', () => {
    const cases = [
      { summary: { ...source, id: 'standard-efficient', ownership: 'builtin' as const, canToggle: true }, expected: true },
      { summary: { ...source, id: 'managed-mode', ownership: 'managed' as const, canToggle: true }, expected: true },
      { summary: { ...source, id: 'ptc', ownership: 'builtin' as const, canToggle: false }, expected: false },
      { summary: { ...source, id: 'foreign-mode', ownership: 'third-party' as const }, expected: false },
    ]
    for (const entry of cases) {
      assert.equal(elements(row(entry.summary)).some((element) => element.type === Switch), entry.expected)
    }
  })

  it('passes the exact preset id and requested boolean to the toggle callback', async () => {
    const calls: [string, boolean][] = []
    const onToggle = async (id: string, enabled: boolean): Promise<boolean> => {
      calls.push([id, enabled])
      return true
    }
    switchIn(row({ ...source, id: 'enabled-mode', ownership: 'managed', canToggle: true, enabled: true }, { onToggle }))
      .props.onChange(false)
    switchIn(row({ ...source, id: 'disabled-mode', ownership: 'managed', canToggle: true, enabled: false }, { onToggle }))
      .props.onChange(true)
    await Promise.resolve()
    assert.deepEqual(calls, [['enabled-mode', false], ['disabled-mode', true]])
  })

  it('locks the switch for the enabled DSH default while keeping view and copy available', async () => {
    const viewed: string[] = []
    const copied: string[] = []
    const node = row({
      ...source, id: 'default-mode', ownership: 'managed',
      isDefault: true, canToggle: true, enabled: true,
    }, {
      onView: (id) => viewed.push(id),
      onExport: async (id) => { copied.push(id); return true },
    })
    const toggle = switchIn(node)
    assert.equal(toggle.props.disabled, true)
    Switch(toggle.props).props.onClick()
    const view = elements(node).find((element) => element.type === Button && element.props.children === t('action.viewConfig'))
    const copy = elements(node).find((element) => element.type === ActionButton && element.props.label === t('action.copy'))
    assert.ok(view)
    assert.ok(copy)
    assert.notEqual(view.props.disabled, true)
    assert.notEqual(copy.props.disabled, true)
    view.props.onClick()
    assert.equal(await copy.props.onAction(), true)
    assert.deepEqual(viewed, ['default-mode'])
    assert.deepEqual(copied, ['default-mode'])
  })

  it('shows disabled instead of registration failure and keeps managed actions available', async () => {
    const viewed: string[] = []
    const edited: string[] = []
    const copied: string[] = []
    const node = row({
      ...source, id: 'stopped-mode', ownership: 'managed', registration: 'failed', health: 'broken',
      canToggle: true, enabled: false,
    }, {
      onView: (id) => viewed.push(id),
      onEditPersona: (id) => edited.push(id),
      onExport: async (id) => { copied.push(id); return true },
    })
    const article = elements(node).find((element) => element.type === 'article')
    assert.ok(article)
    assert.equal(article.props['data-disabled'], true)
    assert.match(textOf(node), new RegExp(t('state.disabled')))
    assert.equal(textOf(node).includes(t('state.failed')), false)
    const view = elements(node).find((element) => element.type === Button && element.props.children === t('action.viewConfig'))
    const edit = elements(node).find((element) =>
      element.type === Button && React.Children.toArray(element.props.children).some((child) =>
        React.isValidElement(child) && child.type === IconEdit))
    const copy = elements(node).find((element) => element.type === ActionButton && element.props.label === t('action.copy'))
    assert.ok(view)
    assert.ok(edit)
    assert.ok(copy)
    assert.notEqual(view.props.disabled, true)
    assert.notEqual(edit.props.disabled, true)
    assert.notEqual(copy.props.disabled, true)
    view.props.onClick()
    edit.props.onClick()
    assert.equal(await copy.props.onAction(), true)
    assert.deepEqual(viewed, ['stopped-mode'])
    assert.deepEqual(edited, ['stopped-mode'])
    assert.deepEqual(copied, ['stopped-mode'])
    assert.equal(switchIn(node).props.checked, false)
  })

  it('marks only the current switch busy and disables every control while an operation runs', () => {
    const first = { ...source, id: 'first', ownership: 'managed' as const, canToggle: true }
    const second = { ...source, id: 'second', ownership: 'managed' as const, canToggle: true }
    const state: PresetListProps['state'] = {
      ...new PresetManagerStore().getState(), status: 'ready', mount: { status: 'ready' },
      snapshot: { phase: 'ready', presets: [first, second], dataDirectory: '/tmp', diagnostics: [], busy: false },
      togglingId: 'first',
    }
    const tree = PresetList(listProps({ state, busy: true }))
    const rows = withRenderedRows(tree).filter((element) => element.type === 'article')
    const firstRow = rows.find((element) => element.props['data-preset-id'] === 'first')
    const secondRow = rows.find((element) => element.props['data-preset-id'] === 'second')
    assert.ok(firstRow)
    assert.ok(secondRow)
    assert.equal(switchIn(firstRow).props.busy, true)
    assert.equal(switchIn(secondRow).props.busy, false)
    const controls = withRenderedRows(tree).filter((element) =>
      element.type === Button || element.type === ActionButton || element.type === Switch)
    assert.ok(controls.length >= 6)
    assert.ok(controls.every((control) => control.props.disabled === true))
  })

  it('exposes switch semantics and ignores activation while disabled or busy', () => {
    const changes: boolean[] = []
    const active = Switch({ checked: true, label: 'Disable My mode', onChange: (next) => changes.push(next) })
    assert.equal(active.props.role, 'switch')
    assert.equal(active.props['aria-checked'], true)
    assert.equal(active.props['aria-label'], 'Disable My mode')
    assert.notEqual(active.props.disabled, true)
    active.props.onClick()
    for (const blocked of [
      Switch({ checked: false, label: 'Enable My mode', disabled: true, onChange: (next) => changes.push(next) }),
      Switch({ checked: false, label: 'Enable My mode', busy: true, onChange: (next) => changes.push(next) }),
    ]) {
      assert.equal(blocked.props.disabled, true)
      blocked.props.onClick()
    }
    assert.deepEqual(changes, [false])
  })

  it('shows toggle failures only beside the owning row', () => {
    const manager = new PresetManagerStore()
    const failure = {
      level: 'error' as const, message: 'Toggle failed',
      localAction: { kind: 'toggle' as const, id: 'first' },
    }
    const state: PresetListProps['state'] = {
      ...manager.getState(), status: 'ready', mount: { status: 'ready' },
      snapshot: {
        phase: 'ready',
        presets: [
          { ...source, id: 'first', ownership: 'managed', canToggle: true },
          { ...source, id: 'second', ownership: 'managed', canToggle: true },
        ],
        dataDirectory: '/tmp', diagnostics: [], busy: false,
      },
      notice: failure,
    }
    const rows = PresetList(listProps({ state }))
    const alerts = withRenderedRows(rows).filter((element) => element.props.role === 'alert')
    assert.equal(alerts.length, 1)
    const first = withRenderedRows(rows).find((element) =>
      element.type === 'article' && element.props['data-preset-id'] === 'first')
    const second = withRenderedRows(rows).find((element) =>
      element.type === 'article' && element.props['data-preset-id'] === 'second')
    assert.ok(first)
    assert.ok(second)
    assert.equal(textOf(first).includes('Toggle failed'), true)
    assert.equal(textOf(second).includes('Toggle failed'), false)
  })
})

describe('grid and independent dialogs', () => {
  const noop = (): void => {}
  function workspace(kind: 'list' | 'detail' | 'editor', store = new PresetManagerStore(), confirmation: Confirmation = 'none'): React.ReactElement {
    const view = kind === 'list' ? { kind } as const : kind === 'detail'
      ? { kind, id: 'custom' } as const : { kind, id: 'custom', mode: 'persona' } as const
    return PresetWorkspace({
      state: { ...store.getState(), view }, store, t, busy: false, ready: true,
      confirmation, onRequestClose: noop, onClose: noop, onKeepEditing: noop,
      onDeleteRequest: noop, onDelete: noop, onSave: noop, onOverlay: noop,
    })
  }
  it('keeps the same keyed grid present behind either dialog', () => {
    const keys = ['list', 'detail', 'editor'].map((kind) => {
      const grid = elements(workspace(kind as 'list' | 'detail' | 'editor')).find((node) => node.type === PresetList)
      assert.ok(grid)
      return grid.key
    })
    assert.equal(new Set(keys).size, 1)
  })
  it('opens the edit action directly without invoking the viewer', () => {
    const manager = new PresetManagerStore()
    let edit = '', viewed = ''
    manager.openEditor = async (id) => { edit = id }
    manager.openDetail = async (id) => { viewed = id }
    const grid = elements(workspace('list', manager)).find((node) => node.type === PresetList)!
    grid.props.onEditPersona('my-mode')
    assert.equal(edit, 'my-mode')
    assert.equal(viewed, '')
  })
  it('uses read-only content in view and editable content in the separate edit dialog', () => {
    for (const kind of ['detail', 'editor'] as const) {
      const nodes = elements(workspace(kind))
      assert.ok(nodes.some((node) => node.type === Dialog))
      assert.equal(nodes.some((node) => node.type === PresetEditor), kind === 'editor')
      assert.equal(nodes.some((node) => node.type === PresetDetailView), kind === 'detail')
    }
  })
  it('places Fork in the viewer footer only', () => {
    for (const kind of ['detail', 'editor'] as const) {
      const dialog = elements(workspace(kind)).find((node) => node.type === Dialog)!
      const fork = elements(dialog.props.footer).find((node) => node.type === ActionButton && node.props.label === t('action.fork'))
      assert.equal(!!fork, kind === 'detail')
    }
  })
  it('opens independent confirmations while keeping the editor footer unchanged', () => {
    let baseline: unknown
    for (const confirmation of ['none', 'delete', 'discard', 'save'] as const) {
      const dialogs = elements(workspace('editor', new PresetManagerStore(), confirmation)).filter((node) => node.type === Dialog)
      assert.equal(dialogs.length, confirmation === 'none' ? 1 : 2)
      const labels = elements(dialogs[0]!.props.footer).filter((node) => node.type === Button).map((node) => node.props.children)
      if (baseline === undefined) baseline = labels
      else assert.deepEqual(labels, baseline)
      if (confirmation !== 'none') assert.equal(dialogs[1]!.props.variant, 'confirm')
    }
  })

})

describe('simple copy, export and prompt editing', () => {
  it('exports directly without requesting an export overlay', () => {
    const manager = new PresetManagerStore()
    let exported = '', opened = false
    manager.copyConfiguration = async (id) => { exported = id; return true }
    const noop = (): void => {}
    const nodes = elements(PresetWorkspace({
      state: manager.getState(), store: manager, t, busy: false, ready: true,
      confirmation: 'none', onRequestClose: noop, onClose: noop, onKeepEditing: noop,
      onDeleteRequest: noop, onDelete: noop, onSave: noop, onOverlay: () => { opened = true },
    }))
    nodes.find((node) => node.type === PresetList)!.props.onExport('ptc')
    assert.equal(exported, 'ptc')
    assert.equal(opened, false)
  })
  it('shows the prompt verbatim, removes the replacement switch and preserves its existing value', () => {
    const definition = { id: 'mine', plugins: [{ name: '@deepseek-ai/dsh-persona', config: {
      prefix: 'Original prompt', complete: true, includeRuntimeContext: false,
    } }] }
    let edited = definition
    const nodes = elements(PromptFields({ definition, t, onChange: (next) => { edited = next as typeof definition } }))
    assert.equal(nodes.some((node) => node.type === 'input' && node.props.type === 'checkbox'), false)
    const text = nodes.find((node) => node.type === 'textarea')!
    assert.equal(text.props.value, 'Original prompt')
    text.props.onChange({ target: { value: 'My edited prompt' } })
    assert.equal(edited.plugins[0]!.config.prefix, 'My edited prompt')
    assert.equal(nodes.filter((node) => node.type === 'textarea').length, 1)
    assert.equal(edited.plugins[0]!.config.complete, true)
    assert.equal(edited.plugins[0]!.config.includeRuntimeContext, false)
  })
})

describe('local action feedback', () => {
  it('does not render a page banner for clipboard or fork feedback', () => {
    const manager = new PresetManagerStore()
    for (const kind of ['fork', 'copy'] as const) {
      const state = { ...manager.getState(), notice: { level: 'success' as const, message: 'Done', localAction: { kind, id: 'ptc' } } }
      assert.equal(OperationNotice({ state, store: manager, t }), null)
    }
  })
})

describe('recursive persona editing', () => {
  it('edits the selected nested suffix without changing another persona or its scope', () => {
    const definition: PresetDefinition = { id: 'nested', plugins: [
      { name: '@deepseek-ai/dsh-persona', config: { prefix: 'root prefix', suffix: 'root suffix' } },
      { name: 'cordis:group', group: true, isolate: { example: true }, config: [
        { name: '@deepseek-ai/dsh-persona', config: { prefix: 'nested prefix', suffix: 'nested suffix', complete: false, includeRuntimeContext: false } },
      ] },
    ] }
    let edited = definition
    const nodes = elements(PromptFields({ definition, path: [1, 0], part: 'suffix', t, onChange: (next) => { edited = next } }))
    const texts = nodes.filter((node) => node.type === 'textarea')
    assert.equal(texts[0]!.props.value, 'nested suffix')
    texts[0]!.props.onChange({ target: { value: 'new nested suffix' } })
    const group = edited.plugins[1]!
    const nested = (group.config as PresetDefinition['plugins'])[0]!
    assert.equal((nested.config as Record<string, unknown>).suffix, 'new nested suffix')
    assert.deepEqual(edited.plugins[0], definition.plugins[0])
    assert.deepEqual(group.isolate, { example: true })
    assert.equal((nested.config as Record<string, unknown>).includeRuntimeContext, false)
  })
  it('keeps dynamic template expressions out of the plain-text editing path', () => {
    const definition: PresetDefinition = { id: 'dynamic', plugins: [
      { name: '@deepseek-ai/dsh-persona', config: { prefix: { __jsExpr: 'ctx.example.prompt' }, suffix: '' } },
    ] }
    const texts = elements(PromptFields({ definition, t, onChange: () => {} })).filter((node) => node.type === 'textarea')
    assert.equal(texts[0]!.props.readOnly, true)
    assert.match(texts[0]!.props.value, /ctx.example.prompt/)
    const suffix = elements(PromptFields({ definition, part: 'suffix', t, onChange: () => {} })).find((node) => node.type === 'textarea')!
    assert.equal(suffix.props.readOnly, false)
  })
})

describe('dynamic Persona configuration', () => {
  it('does not pretend a complete config expression is an editable literal prompt', () => {
    const definition: PresetDefinition = { id: 'expression', plugins: [
      { name: '@deepseek-ai/dsh-persona', config: { __jsExpr: 'ctx.example.persona' } },
    ] }
    let changed = false
    const text = elements(PromptFields({ definition, t, onChange: () => { changed = true } })).find((node) => node.type === 'textarea')!
    assert.equal(text.props.readOnly, true)
    assert.match(text.props.value, /ctx.example.persona/)
    text.props.onChange({ target: { value: 'must not be lost into an expression marker' } })
    assert.equal(changed, false)
  })
})
