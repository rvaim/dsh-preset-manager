import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { PresetList, PresetCard, type PresetListProps } from '../../client/features/preset-list/PresetList.js'
import { presetDisplay } from '../../client/features/preset-display.js'
import { ActionButton } from '../../client/components/ActionButton.js'
import { Button } from '../../client/components/primitives.js'
import { zh, en } from '../../client/locales/index.js'
import { OperationNotice, PresetWorkspace, type Confirmation } from '../../client/pages/PresetManagerPage.js'
import { PresetManagerStore } from '../../client/state/store.js'
import { Dialog } from '../../client/components/Dialog.js'
import { PromptFields, PresetEditor } from '../../client/features/persona-editor/PresetEditor.js'
import { PresetDetailView } from '../../client/features/preset-list/PresetDetailView.js'
import type { PresetDefinition, PresetSummary } from '../../shared/types.js'

const source: PresetSummary = {
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
function card(busy: boolean, clone: (id: string) => void): React.ReactElement {
  const noop = (): void => {}
  return PresetCard({
    summary: source, t, busy, ready: true,
    state: {} as PresetListProps['state'],
    onView: noop, onEditPersona: noop, onExport: async () => true,
    onHistory: noop, onImport: noop, onData: noop, onRetry: noop,
  })
}

describe('native preset cards', () => {
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
  it('keeps Fork out of the preset card', () => {
    const buttons = elements(card(false, () => {})).filter((element) => element.type === ActionButton)
    assert.equal(buttons.some((element) => element.props.label === t('action.fork')), false)
  })
  it('disables all card actions during an operation', () => {
    const buttons = elements(card(true, () => {})).filter((element) => element.type === Button || element.type === ActionButton)
    assert.ok(buttons.length >= 2)
    assert.ok(buttons.every((button) => button.props.disabled === true))
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
