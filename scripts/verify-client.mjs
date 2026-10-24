/**
 * Activate the actual packed Client and Host entries as ordinary Cordis plugins.
 * Real Gateway, Registry, plugin injection, stores and application use cases run
 * against an isolated home. Only the carrier, preset registry and UI shell
 * services are fixtures. No DOM/React renderer is emulated and no profile changes.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Context, Service } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import HostGateway from '@deepseek-ai/dsh-api-gateway'
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client'
import yaml from 'js-yaml'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = resolve(process.argv[2] ?? join(root, 'dist'))
const hostEntry = await import(pathToFileURL(join(dist, 'host/index.js')).href)
const { replaceCompositionRow } = await import(pathToFileURL(join(dist, 'domain/composition-editor.js')).href)
const { writePersona } = await import(pathToFileURL(join(dist, 'domain/persona-editor.js')).href)
const { dumpPluginRows, dumpPresetDocument, entryListSchema } = await import(pathToFileURL(join(dist, 'domain/preset-model.js')).href)
const standardPatch = yaml.load(await readFile(join(root, 'src/tests/fixtures/standard-current.patch.yml'), 'utf8'), { schema: entryListSchema })
const standardDefinition = standardPatch[0].insert[0].config
const standardBefore = JSON.stringify(standardDefinition)
const host = new Context()
const client = new Context()
const temporaryBase = resolve(tmpdir())
const temporaryHome = await mkdtemp(join(temporaryBase, 'dshpm-client-'))
const interceptors = new Set()
const providers = new Map()
const registeredTools = new Map()
const rows = new Map([
  ['standard', standardDefinition],
  ['ptc', { id: 'ptc', name: 'PTC', description: 'PTC fixture', plugins: [
    { name: '@deepseek-ai/dsh-persona', config: { prefix: 'selected second preset', complete: true } },
  ] }],
])
let pageEntry
let snapshotFailure = false
let delayedSnapshot
let releaseSnapshot
let snapshotRequested
let delayedDetail
let releaseDetail
let detailRequested
let editorFailure = false
let delayedClone
let releaseClone
let cloneRequested
const peer = { principal: { kind: 'owner' }, interactions: 'none', signal: new AbortController().signal }

// Faithful registry fixture; the plugin's real repository and use cases own data.
const registry = {
  async list() { return [...rows.values()].map(({ id, name, description, order }) => ({ id, name, description, order })) },
  async readDocument(id) {
    const definition = rows.get(id)
    if (!definition) throw new Error(`Unknown preset ${id}`)
    return { agentPreset: id, name: definition.name, description: definition.description, content: dumpPluginRows(definition.plugins) }
  },
  async register(definition) {
    assert.equal(rows.has(definition.id), false)
    rows.set(definition.id, definition)
    return async () => { if (rows.get(definition.id) === definition) rows.delete(definition.id) }
  },
}

// Shell fixtures preserve actual Cordis service tracing and effect ownership.
class ShellSlots extends Service {
  constructor(ctx) { super(ctx, 'slots') }
  inject(_slot, callback) { return this.ctx.effect(callback) }
  register(options, component) {
    return this.ctx.effect(() => {
      const entry = { options, component }
      pageEntry = entry
      return () => { if (pageEntry === entry) pageEntry = undefined }
    })
  }
}
class ShellLocale extends Service {
  dictionaries = new Map()
  constructor(ctx) { super(ctx, 'locale') }
  register(namespace, dictionaries) {
    return this.ctx.effect(() => {
      this.dictionaries.set(namespace, dictionaries)
      return () => this.dictionaries.delete(namespace)
    })
  }
  bind(namespace) { return (key) => this.dictionaries.get(namespace)?.zh[key] ?? key }
}

function waitForState(store, predicate, label) {
  if (predicate(store.getState())) return Promise.resolve(store.getState())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error(`${label}: ${JSON.stringify({ status: store.getState().status, mount: store.getState().mount.status, notice: store.getState().notice })}`)) }, 4000)
    const unsubscribe = store.subscribe(() => {
      const state = store.getState()
      if (!predicate(state)) return
      clearTimeout(timer)
      unsubscribe()
      resolve(state)
    })
  })
}
let passed = 0
function check(label, callback) { callback(); passed++; console.log(`PASS  ${label}`) }
function pageStore() {
  assert.ok(pageEntry, 'actual Client must register its settings section')
  // The registered wrapper returns the actual page element with the store it uses.
  // This executes no renderer or hooks and makes no claim about visual appearance.
  const element = pageEntry.component()
  assert.ok(element.props.store)
  return element.props.store
}

try {
  await host.plugin(TypertRegistry)
  host.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  host.provide('connection', { rpc: { intercept(prefix, claims, dispatch) {
    const entry = { prefix, claims, dispatch }; interceptors.add(entry)
    return () => { interceptors.delete(entry) }
  } } })
  host.provide('tools', {
    register(definition) {
      assert.equal(registeredTools.has(definition.name), false)
      registeredTools.set(definition.name, definition)
      return () => { registeredTools.delete(definition.name) }
    },
  })
  host.provide('dshHomePath', () => temporaryHome)
  host.provide('agentPresets', registry)
  let releaseHostTree
  const hostTreeReady = new Promise((resolve) => { releaseHostTree = resolve })
  host.provide('loader', { await: () => hostTreeReady })
  await host.plugin(HostGateway)
  const hostPlugin = await host.plugin(hostEntry)
  let initialSnapshotSettled = false
  const initialSnapshot = host.get('presetManager').snapshot().then((snapshot) => {
    initialSnapshotSettled = true
    return snapshot
  })
  await new Promise(setImmediate)
  check('Host apply settles while the initial snapshot waits for the Standard source', () => assert.equal(initialSnapshotSettled, false))
  releaseHostTree()
  await initialSnapshot
  const storedAtStartup = await readdir(join(temporaryHome, 'dsh-preset-manager', 'presets'))
  check('bundled startup does not create user preset files', () => assert.deepEqual(storedAtStartup, []))

  await client.plugin(TypertRegistry)
  client.provide('connection', {
    interactions: 'none',
    rpc: {
      open: () => { throw new Error('unexpected stream in unary test') },
      async call(prefix, endpoint, payload, signal) {
        if (delayedDetail && endpoint === 'presetManager/detail') {
          const delayed = delayedDetail
          detailRequested?.()
          await delayed
        }
        if (editorFailure && endpoint === 'presetManager/renderYaml') throw new Error('fixture editor unavailable')
        if (delayedClone && endpoint === 'presetManager/clone') {
          const delayed = delayedClone
          cloneRequested?.()
          await delayed
        }
        if (endpoint === 'presetManager/snapshot') {
          if (snapshotFailure) throw new Error('fixture connection unavailable')
          if (delayedSnapshot) {
            const delayed = delayedSnapshot
            snapshotRequested?.()
            await delayed
          }
        }
        const entry = [...interceptors].find((item) => item.prefix === prefix && item.claims(endpoint))
        assert.ok(entry, `Host must claim ${endpoint}`)
        const result = await entry.dispatch(endpoint, JSON.parse(JSON.stringify(payload)), signal, peer)
        return JSON.parse(JSON.stringify(result))
      },
    },
  })
  await client.plugin(ClientGateway)
  await client.plugin(ShellSlots)
  await client.plugin(ShellLocale)
  client.provide('cordisInspect', {
    register(provider) {
      assert.equal(providers.has(provider.manifest.id), false)
      providers.set(provider.manifest.id, provider)
      return () => { providers.delete(provider.manifest.id) }
    },
  })
  let entry
  const require = createRequire(import.meta.url)
  runInNewContext(await readFile(join(dist, 'client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(module) { entry = module.factory(require) } } },
  }, { filename: join(dist, 'client.js') })
  assert.ok(entry?.apply && entry?.inject)
  let plugin = await client.plugin(entry)
  let store = pageStore()
  await waitForState(store, (state) => state.status === 'ready', 'initial list load')
  check('actual bundled Client entry reaches ready under real plugin injection', () => {
    assert.equal(store.getState().mount.status, 'ready')
    assert.ok(store.getState().snapshot.presets.some((row) => row.id === 'standard'))
    assert.equal(store.getState().notice, undefined)
  })
  check('page API remains stable within one namespace lifetime', () => assert.equal(store.apiForPanel, store.apiForPanel))
  const status = providers.get('@rvaim/dsh-preset-manager').query('getStatus')
  check('read-only diagnostics reflect the actual page store', () => {
    assert.equal(status.mountStatus, 'ready')
    assert.equal(status.loadStatus, 'ready')
    assert.equal(status.presetCount, 5)
    assert.doesNotThrow(() => JSON.stringify(status))
  })

  const bundledApi = store.apiForPanel
  const redteamDocument = yaml.load(await readFile(join(dist, '..', 'resources/redteam-mode/preset.yml'), 'utf8'), { schema: entryListSchema }).preset
  const bundledText = {
    'standard-efficient': await readFile(join(dist, '..', 'resources/standard-efficient/prefix.md'), 'utf8'),
    'codex-original': await readFile(join(dist, '..', 'resources/codex-original/prompt.md'), 'utf8'),
    'redteam-mode': redteamDocument.plugins[0].config.prefix,
  }
  const codexText = bundledText['codex-original']
  check('all bundled presets appear as read-only built-ins through the actual Host entry', () => {
    for (const id of Object.keys(bundledText)) {
      assert.equal(store.getState().snapshot.presets.find((row) => row.id === id)?.ownership, 'builtin')
      assert.ok(rows.has(id))
    }
    assert.equal(JSON.stringify(rows.get('standard')), standardBefore)
  })
  for (const id of Object.keys(bundledText)) {
    const detail = await bundledApi.detail(id)
    assert.equal(detail.editable, false)
    const persona = detail.definition.plugins.find((row) => row.name === '@deepseek-ai/dsh-persona')
    assert.equal(persona.config.prefix, bundledText[id])
    assert.equal(detail.definition.name, { 'standard-efficient': '标准增强', 'codex-original': 'Codex 原版', 'redteam-mode': '红队模式' }[id])
    if (id === 'redteam-mode') {
      assert.deepEqual(detail.definition, redteamDocument)
    } else {
      const restored = structuredClone(detail.definition.plugins)
      restored.find((row) => row.name === '@deepseek-ai/dsh-persona').config.prefix = standardDefinition.plugins[0].config.prefix
      assert.deepEqual(restored, standardDefinition.plugins)
      assert.equal(detail.definition.order, standardDefinition.order)
    }
    await assert.rejects(() => bundledApi.remove({ id }), /不是本插件管理的预设/)
  }
  check('bundled documents preserve the complete Standard tree and exact local prompt text', () => assert.equal(JSON.stringify(rows.get('standard')), standardBefore))
  assert.equal((await bundledApi.detail('redteam-mode')).summary.canToggle, true)
  assert.equal(await store.setEnabled('redteam-mode', false), true)
  check('full red-team preset can be disabled while remaining readable without document changes', () => {
    assert.equal(rows.has('redteam-mode'), false)
    assert.equal(store.getState().snapshot.presets.find((row) => row.id === 'redteam-mode').enabled, false)
  })
  assert.deepEqual((await bundledApi.detail('redteam-mode')).definition, redteamDocument)
  await bundledApi.clone({ sourceId: 'redteam-mode', newId: 'redteam-fixture-copy' })
  check('deriving the red-team preset preserves every supplied plugin and prompt field', () => {
    assert.deepEqual(rows.get('redteam-fixture-copy').plugins, redteamDocument.plugins)
  })
  await bundledApi.remove({ id: 'redteam-fixture-copy' })
  assert.equal(await store.setEnabled('redteam-mode', true), true)
  assert.deepEqual(rows.get('redteam-mode'), redteamDocument)
  const enablementTool = registeredTools.get('preset_manager_set_enabled')
  assert.ok(enablementTool)
  await enablementTool.execute({ id: 'codex-original', enabled: false })
  const disabledBundled = (await bundledApi.snapshot()).presets.find((row) => row.id === 'codex-original')
  check('the agent tool withdraws a bundled preset while its disabled manager row remains visible', () => {
    assert.equal(rows.has('codex-original'), false)
    assert.equal(disabledBundled.canToggle, true)
    assert.equal(disabledBundled.enabled, false)
    assert.equal(disabledBundled.registration, 'not-registered')
  })
  const inactiveDetail = await bundledApi.detail('codex-original')
  check('disabled bundled presets retain read-only access to the complete original definition', () => {
    assert.equal(inactiveDetail.editable, false)
    assert.equal(inactiveDetail.definition.plugins.find((row) => row.name === '@deepseek-ai/dsh-persona').config.prefix, codexText)
  })
  await assert.rejects(() => bundledApi.setEnabled({ id: 'standard', enabled: false }))
  check('native DSH presets cannot be switched off through the plugin', () => assert.equal(JSON.stringify(rows.get('standard')), standardBefore))
  const bundledCopy = await bundledApi.clone({ sourceId: 'codex-original', newId: 'codex-user-copy' })
  check('a bundled preset forks into an independently editable user preset', () => assert.equal(bundledCopy.ok, true))
  assert.equal((await bundledApi.detail('codex-user-copy')).editable, true)
  await bundledApi.remove({ id: 'codex-user-copy' })
  await bundledApi.setEnabled({ id: 'codex-original', enabled: true })
  check('the UI Remote operation restores the same bundled preset after tool-based disablement', () => {
    assert.ok(rows.has('codex-original'))
    assert.equal(rows.get('codex-original').plugins.find((row) => row.name === '@deepseek-ai/dsh-persona').config.prefix, codexText)
  })
  await store.refresh()
  const importText = (await bundledApi.shareText('codex-original')).yaml
  await store.previewImport(importText, 'share')
  check('import collision produces one authoritative ID error through the actual Host entry', () => {
    assert.equal(store.getState().preview.idConflict.conflict, true)
    assert.equal(store.getState().preview.validation.errors.filter((issue) => issue.path === 'id').length, 1)
  })
  const { parseShareText, dumpShareText } = await import(pathToFileURL(join(dist, 'sharing/share-format.js')).href)
  const importedDocument = parseShareText(importText)
  assert.equal(importedDocument.ok, true)
  const editedImportText = dumpShareText({ ...importedDocument.document.preset, id: 'codex-imported-copy' })
  store.clearPreview()
  await store.previewImport(editedImportText, 'share')
  check('editing the ID inside the original YAML produces the validated import identity', () => {
    assert.equal(store.getState().preview.definition.id, 'codex-imported-copy')
    assert.equal(store.getState().preview.validation.ok, true)
    assert.equal(store.getState().previewingImport, false)
  })
  assert.equal(await store.confirmImport({ text: importText, source: 'share', acknowledgedRisks: true }), false)
  assert.equal(await store.confirmImport({ text: editedImportText, source: 'share', acknowledgedRisks: true }), true)
  check('only the newly previewed import identity is registered and the original is preserved', () => {
    assert.ok(rows.has('codex-imported-copy'))
    assert.ok(rows.has('codex-original'))
    assert.equal(rows.get('codex-original').plugins.find((row) => row.name === '@deepseek-ai/dsh-persona').config.prefix, codexText)
  })
  await bundledApi.remove({ id: 'codex-imported-copy' })
  store.clearPreview()

  assert.equal(await store.clone({ sourceId: 'standard', newId: 'switch-custom', name: 'Switch fixture' }), true)
  assert.equal(await store.setEnabled('switch-custom', false), true)
  check('a managed preset switch removes selection availability without removing its list entry', () => {
    assert.equal(rows.has('switch-custom'), false)
    const managed = store.getState().snapshot.presets.find((row) => row.id === 'switch-custom')
    assert.equal(managed.enabled, false)
    assert.equal(managed.canToggle, true)
    assert.equal(store.getState().notice, undefined)
  })
  await store.openEditor('switch-custom', 'yaml')
  store.setDraft({ ...store.getState().draft, name: 'Edited while disabled' })
  assert.equal(await store.save(), true)
  check('saving a disabled managed preset does not register it implicitly', () => {
    assert.equal(rows.has('switch-custom'), false)
    assert.equal(store.getState().detail.definition.name, 'Edited while disabled')
  })
  const disabledHistory = await bundledApi.history('switch-custom')
  assert.ok(disabledHistory.length > 0)
  await bundledApi.restore({ id: 'switch-custom', revision: disabledHistory[0].revision })
  check('restoring a disabled preset revision preserves its disabled state', () => assert.equal(rows.has('switch-custom'), false))
  await bundledApi.clone({ sourceId: 'switch-custom', newId: 'switch-derived' })
  check('deriving from a disabled preset creates an enabled independent preset', () => assert.ok(rows.has('switch-derived')))
  await bundledApi.remove({ id: 'switch-derived' })
  await bundledApi.remove({ id: 'switch-custom' })
  await bundledApi.clone({ sourceId: 'standard', newId: 'switch-custom' })
  check('a deleted disabled ID can be reused as an enabled new preset', () => assert.ok(rows.has('switch-custom')))
  await bundledApi.remove({ id: 'switch-custom' })
  store.backToList()
  assert.equal(await store.clone({ sourceId: 'standard', newId: 'check-copy', name: '验证复制' }), true)
  await store.openEditor('check-copy', 'yaml')
  check('page clone, list refresh and YAML editor use the actual Host entry', () => {
    assert.equal(rows.has('check-copy'), true)
    assert.equal(store.getState().detail.editable, true)
    assert.equal(typeof store.getState().yamlText, 'string')
    assert.equal(store.getState().notice, undefined)
  })
  check('a freshly opened editor has no unsaved changes', () => assert.equal(store.hasUnsavedChanges, false))
  store.setDraft({ ...store.getState().draft, name: 'Edited in dialog' })
  check('editing the draft activates unsaved-change protection', () => assert.equal(store.hasUnsavedChanges, true))
  const pendingSave = store.save()
  store.setDraft({ ...store.getState().draft, name: 'Typing during save must be blocked' })
  assert.equal(await pendingSave, true)
  check('saving the editor commits its draft and resets the dirty baseline', () => {
    assert.equal(rows.get('check-copy').name, 'Edited in dialog')
    assert.equal(store.hasUnsavedChanges, false)
  })
  store.setDraft({ ...store.getState().draft, name: 'Saved despite snapshot failure' })
  snapshotFailure = true
  assert.equal(await store.save(), false)
  check('a committed save keeps a visible warning when grid synchronization fails', () => {
    assert.equal(rows.get('check-copy').name, 'Saved despite snapshot failure')
    assert.equal(store.getState().view.kind, 'editor')
    assert.equal(store.getState().notice.level, 'warning')
    assert.equal(store.hasUnsavedChanges, false)
  })
  snapshotFailure = false
  await store.refresh()
  await store.setYaml('[')
  assert.equal(await store.save(), false)
  check('invalid YAML cannot save an older valid draft', () => {
    assert.ok(store.getState().yamlError)
    assert.equal(rows.get('check-copy').name, 'Saved despite snapshot failure')
  })
  store.setEditorMode('persona')
  check('a YAML parse error preserves its text instead of silently switching modes', () => {
    assert.equal(store.getState().view.mode, 'yaml')
    assert.equal(store.getState().yamlText, '[')
  })
  const validPlugins = store.getState().draft.plugins
  await store.setYaml(dumpPresetDocument({ ...store.getState().draft, plugins: [null] }))
  store.setDraft({ ...store.getState().draft, name: 'Metadata edit while YAML invalid' })
  assert.equal(await store.save(), false)
  store.setEditorMode('persona')
  check('structurally invalid YAML never replaces the editable prompt draft', () => {
    assert.equal(store.getState().view.mode, 'yaml')
    assert.deepEqual(store.getState().draft.plugins, validPlugins)
    assert.ok(store.getState().yamlError || store.getState().validation?.ok === false)
  })
  await store.setYaml(dumpPresetDocument({ ...store.getState().draft, plugins: validPlugins }))
  store.setEditorMode('persona')
  assert.equal(store.getState().view.mode, 'persona')
  await store.openEditor('check-copy', 'yaml')
  const gridSnapshot = store.getState().snapshot
  store.backToList()
  check('closing the editor keeps the current grid snapshot in place', () => {
    assert.equal(store.getState().snapshot, gridSnapshot)
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().draft, undefined)
  })
  delayedDetail = new Promise((resolve) => { releaseDetail = resolve })
  const reading = new Promise((resolve) => { detailRequested = resolve })
  const lateView = store.openDetail('check-copy')
  await reading
  store.backToList()
  delayedDetail = undefined
  releaseDetail()
  await lateView
  check('closing a viewer cancels late content without reopening a dialog', () => {
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().detail, undefined)
  })
  assert.equal(await store.remove('check-copy'), true)
  check('page deletion unregisters the preset and refreshes its list', () => {
    assert.equal(rows.has('check-copy'), false)
    assert.equal(store.getState().snapshot.presets.some((row) => row.id === 'check-copy'), false)
  })

  const selected = store.getState().snapshot.presets.find((row) => row.id === 'ptc')
  const copying = store.duplicate(selected, '副本')
  assert.equal(await store.duplicate(selected, '副本'), false)
  assert.equal(await copying, true)
  check('copy duplicates the selected card and stays on the grid', () => {
    assert.equal(rows.has('standard-copy'), false)
    assert.deepEqual(rows.get('ptc-copy').plugins, rows.get('ptc').plugins)
    assert.equal(rows.get('ptc-copy').description, 'PTC fixture')
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().draft, undefined)
    assert.equal(rows.get('ptc-copy').name, 'PTC 副本')
  })
  assert.equal(await store.duplicate(selected, '副本'), true)
  check('copy generates a free ID and name without opening an editor', () => {
    assert.ok(rows.has('ptc-copy-2'))
    assert.equal(rows.get('ptc-copy-2').name, 'PTC 副本 2')
    assert.equal(store.getState().view.kind, 'list')
  })
  await store.remove('ptc-copy')
  await store.remove('ptc-copy-2')

  editorFailure = true
  assert.equal(await store.duplicate(selected, '副本'), true)
  check('copy succeeds independently of editor availability', () => {
    assert.ok(rows.has('ptc-copy'))
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().busy, false)
    assert.match(store.getState().notice.message, /已派生/)
  })
  editorFailure = false
  await store.openEditor('ptc-copy', 'persona')
  assert.equal(store.getState().draft.id, 'ptc-copy')
  store.setDraft(writePersona(store.getState().draft, { prefix: 'Edited prompt text' }))
  store.setEditorMode('yaml')
  check('prompt edits are present when switching to configuration YAML', () => assert.match(store.getState().yamlText, /Edited prompt text/))
  store.setEditorMode('persona')
  assert.equal(await store.save(), true)
  check('prompt editing saves the text while preserving the existing composition mode', () => {
    const persona = rows.get('ptc-copy').plugins[0].config
    assert.equal(persona.prefix, 'Edited prompt text')
    assert.equal(persona.complete, true)
  })
  const group = { name: 'cordis:group', group: true, id: 'planning', isolate: { local: 'realm' }, config: [
    { id: 'plan', name: '@deepseek-ai/dsh-plan-mode', disabled: { __jsExpr: 'false' },
      config: { section: 'Original plugin prompt', unknownSetting: { keep: true } }, intercept: { example: 'keep' } },
  ] }
  const withGroup = { ...store.getState().draft, order: 42, plugins: [...store.getState().draft.plugins, group] }
  const groupIndex = withGroup.plugins.length - 1
  store.setDraft(withGroup)
  store.setEditorMode('plugins')
  const plan = group.config[0]
  store.setDraft(replaceCompositionRow(store.getState().draft, [groupIndex, 0], { ...plan, config: { ...plan.config, section: 'Edited plugin prompt' } }))
  store.setCompositionError('unfinished entry YAML')
  assert.equal(store.hasUnsavedChanges, true)
  assert.equal(await store.save(), false)
  store.setEditorMode('persona')
  assert.equal(store.getState().view.mode, 'plugins')
  store.setCompositionError(undefined)
  assert.equal(await store.save(), true)
  check('nested plugin edits preserve scopes, conditions and unknown configuration', () => {
    const saved = rows.get('ptc-copy')
    assert.equal(saved.order, 42)
    const nested = saved.plugins[groupIndex]
    assert.deepEqual(nested.isolate, { local: 'realm' })
    assert.deepEqual(nested.config[0].disabled, { __jsExpr: 'false' })
    assert.equal(nested.config[0].config.section, 'Edited plugin prompt')
    assert.deepEqual(nested.config[0].config.unknownSetting, { keep: true })
  })
  store.setEditorMode('yaml')
  const document = { ...store.getState().draft, name: 'Changed in full YAML', description: 'Whole document', order: 7 }
  await store.setYaml(dumpPresetDocument(document))
  check('full YAML edits update metadata and the complete plugin composition together', () => {
    assert.equal(store.getState().draft.name, 'Changed in full YAML')
    assert.equal(store.getState().draft.order, 7)
    assert.equal(store.getState().draft.plugins[groupIndex].config[0].config.section, 'Edited plugin prompt')
  })
  await store.setYaml(dumpPresetDocument({ ...document, id: 'different-id' }))
  assert.equal(await store.save(), false)
  check('full YAML cannot silently rename the stable preset identity', () => assert.equal(store.getState().draft.id, 'ptc-copy'))
  await store.setYaml(dumpPresetDocument(document))
  assert.equal(await store.save(), true)
  await store.remove('ptc-copy')

  const expectedExport = await store.apiForPanel.exportPreset('ptc')
  let clipboard = ''
  assert.equal(await store.copyConfiguration('ptc', async (text) => { clipboard = text }), true)
  check('export writes the exact share configuration and leaves the grid open', () => {
    assert.equal(clipboard, expectedExport.yaml)
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().notice.level, 'success')
    assert.equal(store.getState().notice.localAction.kind, 'copy')
    assert.equal(store.getState().notice.localAction.id, 'ptc')
  })
  assert.equal(await store.copyConfiguration('ptc', async () => { throw new Error('clipboard denied') }), false)
  check('clipboard rejection reports failure without claiming a successful export', () => {
    assert.equal(store.getState().notice.level, 'error')
    assert.equal(store.getState().view.kind, 'list')
    assert.equal(store.getState().busy, false)
  })

  const api = store.apiForPanel
  const [pageA, pageB] = await Promise.all([
    api.clone({ sourceId: 'ptc', name: 'PTC 副本' }),
    api.clone({ sourceId: 'ptc', name: 'PTC 副本' }),
  ])
  check('Host allocates distinct copies for concurrent pages with stale lists', () => {
    assert.equal(pageA.ok, true)
    assert.equal(pageB.ok, true)
    assert.notEqual(pageA.preset.id, pageB.preset.id)
  })
  const preserved = JSON.stringify(rows.get(pageA.preset.id))
  await assert.rejects(() => api.clone({ sourceId: 'standard', newId: pageA.preset.id }), /已存在/)
  check('explicit clone collisions never overwrite an existing managed preset', () => {
    assert.equal(JSON.stringify(rows.get(pageA.preset.id)), preserved)
  })
  await store.refresh()
  await store.remove(pageA.preset.id)
  await store.remove(pageB.preset.id)

  delayedClone = new Promise((resolve) => { releaseClone = resolve })
  const cloneStarted = new Promise((resolve) => { cloneRequested = resolve })
  const stale = store.duplicate(selected, '副本')
  await cloneStarted
  const binding = store.getState().mount
  store.attachMount({ status: 'mounting' })
  check('namespace withdrawal releases the busy state of an in-flight copy', () => assert.equal(store.getState().busy, false))
  store.attachMount(binding)
  await waitForState(store, (state) => state.status === 'ready', 'namespace rebind')
  delayedClone = undefined
  releaseClone()
  assert.equal(await stale, false)
  await store.refresh()
  check('late copy completion cannot disable the replacement binding', () => {
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().mount.status, 'ready')
  })
  await store.remove('ptc-copy')

  snapshotFailure = true
  await store.load()
  check('a real carrier error with object details becomes a readable failed state', () => {
    assert.equal(store.getState().status, 'failed')
    assert.equal(store.getState().notice.level, 'error')
    assert.ok(store.getState().notice.message.length > 0)
  })
  snapshotFailure = false
  await store.load()
  check('retry recovers after the connection becomes available', () => assert.equal(store.getState().status, 'ready'))

  const previous = store
  await plugin.dispose()
  check('plugin disposal clears page, diagnostics and namespace API', () => {
    assert.equal(pageEntry, undefined)
    assert.equal(providers.size, 0)
    assert.equal(client.get('remote.presetManager'), undefined)
    assert.notEqual(previous.getState().mount.status, 'ready')
    assert.throws(() => previous.apiForPanel, /Host/)
  })
  plugin = await client.plugin(entry)
  store = pageStore()
  await waitForState(store, (state) => state.status === 'ready', 'list load after enable')
  check('disable then enable loads a new page store and working namespace', () => {
    assert.notEqual(store, previous)
    assert.equal(store.getState().mount.status, 'ready')
  })

  delayedSnapshot = new Promise((resolve) => { releaseSnapshot = resolve })
  const requested = new Promise((resolve) => { snapshotRequested = resolve })
  const pending = store.load()
  await requested
  await plugin.dispose()
  delayedSnapshot = undefined
  releaseSnapshot()
  await pending
  check('late snapshot cannot restore a disposed namespace or page state', () => {
    assert.notEqual(store.getState().mount.status, 'ready')
    assert.equal(store.getState().status, 'idle')
    assert.equal(store.getState().snapshot, undefined)
  })

  // Cancel immediately, before the mount promise settles; no orphan namespace.
  const immediate = client.plugin(entry)
  await immediate.dispose()
  await new Promise(setImmediate)
  check('cancel during activation leaves no namespace, settings row or diagnostics', () => {
    assert.equal(pageEntry, undefined)
    assert.equal(providers.size, 0)
    assert.equal(client.get('remote.presetManager'), undefined)
  })
  await host.get('presetManager').clone('standard', 'switch-persist', undefined, undefined)
  await registeredTools.get('preset_manager_set_enabled').execute({ id: 'switch-persist', enabled: false })
  await registeredTools.get('preset_manager_set_enabled').execute({ id: 'codex-original', enabled: false })
  await hostPlugin.dispose()
  check('Host disposal unregisters the enablement tool along with its presets', () => assert.equal(registeredTools.size, 0))
  check('Host disposal withdraws bundled presets and preserves Standard', () => {
    assert.equal(rows.has('standard-efficient'), false)
    assert.equal(rows.has('codex-original'), false)
    assert.equal(rows.has('redteam-mode'), false)
    assert.equal(JSON.stringify(rows.get('standard')), standardBefore)
  })
  const replacementHost = await host.plugin(hostEntry)
  const replacementSnapshot = await host.get('presetManager').snapshot()
  check('bundled and managed enablement choices survive Host reactivation', () => {
    for (const id of ['codex-original', 'switch-persist']) {
      assert.equal(rows.has(id), false)
      assert.equal(replacementSnapshot.presets.find((row) => row.id === id).enabled, false)
    }
    assert.ok(rows.has('standard-efficient'))
  })
  await registeredTools.get('preset_manager_set_enabled').execute({ id: 'codex-original', enabled: true })
  await registeredTools.get('preset_manager_set_enabled').execute({ id: 'switch-persist', enabled: true })
  check('Host reactivation registers every bundled preset without duplicate IDs', () => {
    for (const id of ['standard-efficient', 'codex-original', 'redteam-mode']) assert.ok(rows.has(id))
    assert.notEqual(replacementSnapshot.presets.find((row) => row.id === 'redteam-mode').enabled, false)
  })
  await replacementHost.dispose()
  console.log(`\n${passed}/${passed} complete Client/Host entry checks passed (${dist})`)
} finally {
  releaseDetail?.()
  releaseClone?.()
  releaseSnapshot?.()
  await client.fiber.dispose()
  await host.fiber.dispose()
  const target = resolve(temporaryHome)
  assert.equal(dirname(target), temporaryBase)
  assert.ok(basename(target).startsWith('dshpm-client-'))
  console.log(`Cleaning owned fixture home: ${target}`)
  await rm(target, { recursive: true, force: true })
}
