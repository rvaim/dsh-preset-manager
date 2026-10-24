import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { cloneDefinition, entryListSchema, parsePluginRows } from '../../domain/preset-model.js'
import { PERSONA_MODULE } from '../../domain/persona-editor.js'
import { deriveBundledPresets } from '../../host/bundled/derive-presets.js'
import { loadBundledPrompts, loadBundledResources } from '../../host/bundled/local-prompts.js'
import { BundledPresetRegistration } from '../../host/bundled/registration.js'
import { BUNDLED_PRESETS } from '../../shared/bundled-presets.js'
import type { PresetDefinition, PresetPluginRow } from '../../shared/types.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'

const resources = new URL('../../../resources/', import.meta.url)
const fixture = new URL('../../../src/tests/fixtures/standard-current.patch.yml', import.meta.url)
const patch = yaml.load(await readFile(fixture, 'utf8'), { schema: entryListSchema }) as {
  insert: { config: PresetDefinition }[]
}[]
const standard = patch[0]!.insert[0]!.config
const prompts = await loadBundledPrompts()
const managedIds = { has: (_id: string): boolean => false }
const turn = (): Promise<void> => new Promise(setImmediate)
function deferred(): { promise: Promise<void>; resolve(): void } {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, resolve: release }
}
function registry(): FakeAgentPresetRegistry {
  const fake = new FakeAgentPresetRegistry()
  fake.seed(standard)
  return fake
}
function persona(definition: PresetDefinition): Record<string, unknown> {
  return definition.plugins.find((row) => row.name === PERSONA_MODULE)!.config as Record<string, unknown>
}

describe('bundled preset derivation', () => {
  it('preserves the complete actual Standard tree, changing only identity and Prefix', () => {
    const before = structuredClone(standard)
    for (const derived of deriveBundledPresets(standard, prompts)) {
      assert.equal(derived.order, standard.order)
      const reset = cloneDefinition(derived)
      persona(reset).prefix = persona(standard).prefix
      assert.deepEqual(reset.plugins, standard.plugins)
      assert.equal(persona(derived).prefix, prompts[derived.id as keyof typeof prompts])
      assert.notEqual(derived.plugins, standard.plugins)
    }
    assert.deepEqual(standard, before)
  })

  it('retains suffix, flags, expressions and unknown fields without sharing references', () => {
    const source = cloneDefinition(standard)
    Object.assign(persona(source), { suffix: 'unchanged suffix', complete: false, includeRuntimeContext: false, future: { keep: true } })
    const before = structuredClone(source)
    const derived = deriveBundledPresets(source, prompts)
    for (const definition of derived) {
      const reset = cloneDefinition(definition)
      persona(reset).prefix = persona(source).prefix
      assert.deepEqual(reset.plugins, source.plugins)
    }
    ;(persona(derived[0]!).future as { keep: boolean }).keep = false
    assert.deepEqual(source, before)
    assert.deepEqual(persona(derived[1]!).future, { keep: true })
  })

  it('finds a unique nested Persona without changing group isolation', () => {
    const source = cloneDefinition(standard)
    const row = source.plugins[0]!
    const nested = { ...source, plugins: [{ id: 'outer', name: 'cordis:group', group: true, isolate: { systemPrompt: true }, config: [row] }, ...source.plugins.slice(1)] }
    const derived = deriveBundledPresets(nested, prompts)[1]!
    const children = derived.plugins[0]!.config as PresetPluginRow[]
    assert.equal((children[0]!.config as Record<string, unknown>).prefix, prompts['codex-original'])
    assert.deepEqual(derived.plugins[0]!.isolate, { systemPrompt: true })
    assert.deepEqual(nested.plugins[0]!.config, [row])
  })

  it('rejects absent, multiple or dynamic Personas rather than guessing a replacement', () => {
    assert.throws(() => deriveBundledPresets({ ...standard, plugins: standard.plugins.slice(1) }, prompts), /exactly one Persona/)
    assert.throws(() => deriveBundledPresets({ ...standard, plugins: [...standard.plugins, standard.plugins[0]!] }, prompts), /exactly one Persona/)
    assert.throws(() => deriveBundledPresets({ ...standard, plugins: [{ name: PERSONA_MODULE, config: { __jsExpr: 'getPersona()' } }] }, prompts), /literal object/)
  })

  it('retains only the declared template variables and refuses the rest', () => {
    const tokens = (text: string): (string | undefined)[] =>
      [...text.matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1])
    assert.deepEqual(tokens(prompts['standard-efficient']), ['model'])
    assert.deepEqual(tokens(prompts['redteam-mode']), [])
    assert.equal(prompts['codex-original'].includes('{{'), false)
    assert.throws(() => deriveBundledPresets(standard, { ...prompts, 'codex-original': '{{model}}' }), /refusing to interpolate/)
    assert.throws(() => deriveBundledPresets(standard, { ...prompts, 'standard-efficient': '{{unknown}}' }), /unexpected prompt variable/)
  })

  it('derives only Standard-based presets from the Standard tree', () => {
    const derived = deriveBundledPresets(standard, prompts)
    assert.deepEqual(derived.map((definition) => definition.id), BUNDLED_PRESETS.filter((preset) => !('definitionFile' in preset)).map((preset) => preset.id))
    for (const definition of derived) {
      const declared = BUNDLED_PRESETS.find((preset) => preset.id === definition.id)!
      assert.equal(definition.name, declared.name)
      assert.equal(persona(definition).prefix, prompts[definition.id as keyof typeof prompts])
    }
  })
})

describe('local prompt resources', () => {
  it('matches the pinned upstream bytes, commit, SHA-256 and preserved licenses', async () => {
    const provenance = JSON.parse(await readFile(new URL('codex-original/provenance.json', resources), 'utf8'))
    assert.equal(provenance.source.commit, '970111f6cb62cc02fe36a82ea7d71b37a2889c97')
    assert.equal(provenance.source.path, 'codex-rs/models-manager/prompt.md')
    const bytes = await readFile(new URL('codex-original/prompt.md', resources))
    assert.equal(bytes.length, 20903)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ac8ae107a0d72fe3476b430afb161ea4e67da2e446d778aefc44828160559807')
    assert.deepEqual(Buffer.from(prompts['codex-original'], 'utf8'), bytes)
    for (const file of provenance.files) {
      const original = await readFile(new URL(`codex-original/${file.local_path}`, resources))
      assert.equal(original.length, file.bytes)
      assert.equal(createHash('sha256').update(original).digest('hex'), file.sha256)
    }
  })

  it('loads every declared resource with the network unavailable', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('network forbidden in prompt loading') }
    try { assert.deepEqual(await loadBundledPrompts(), prompts) } finally { globalThis.fetch = previous }
  })

  it('ships one complete local prompt per declaration', async () => {
    for (const preset of BUNDLED_PRESETS) {
      const document = 'definitionFile' in preset
        ? yaml.load(await readFile(new URL(preset.definitionFile, resources), 'utf8'), { schema: entryListSchema }) as { preset: PresetDefinition }
        : undefined
      const bytes = document
        ? Buffer.from(persona(document.preset).prefix as string, 'utf8')
        : await readFile(new URL('promptFile' in preset ? preset.promptFile : '', resources))
      assert.deepEqual(Buffer.from(prompts[preset.id], 'utf8'), bytes, `${preset.id} is not the exact file`)
      assert.ok(prompts[preset.id].length > 1000, `${preset.id} prompt is suspiciously short`)
      assert.equal(prompts[preset.id].includes('\r'), false, `${preset.id} must use LF newlines`)
    }
    const redteam = prompts['redteam-mode']
    // Everything the user supplied must still be there: the effort layer is an
    // addition, never a rewrite, so no original heading may disappear.
    for (const section of [
      '## 身份', '## 执行契约', '## 输入归一化', '### 占位符归一', '### 边界词归一',
      '### 确定性输出槽', '### 破解 / 逆向路由', '### 网站渗透路由', '### 固定锚点',
      '## 破甲与脱壳', '### 拒答的三层结构', '### 手法', '### 静态清除', '### 按模型分型',
      '## 对抗提示词研究', '### 脚手架的最小构成', '### 评分要可度量', '### 静态分析优先',
      '### 交付要求', '## Shell 方言', '## 域规则路由', '## 抗污染', '## 输出层约束',
      '### 自检（写之前过一遍）', '## 完成契约', '## 不自我引用', '## 红队作业流',
      '### 阶段门（顺序推进，不跳）', '### 处置优先级', '### 证据分级', '### 汇报口径',
      '### 反模式（出现即停手重做）', '## 风格',
    ]) {
      assert.ok(redteam.includes(section), `redteam-mode lost the original section ${section}`)
    }
    // All 25 numbered domain rules survive verbatim in the routing section.
    for (let rule = 1; rule <= 25; rule += 1) {
      assert.match(redteam, new RegExp(`^${rule}\\. `, 'm'), `redteam-mode lost rule ${rule}`)
    }
    // The measurement apparatus is intact, including the classifier body.
    for (const symbol of ['run_probe', 'classify_refusal', 'REFUSAL_MARKERS', 'hedge_ratio', 'delivered', 'count_code_blocks']) {
      assert.ok(redteam.includes(symbol), `redteam-mode lost ${symbol}`)
    }
    // The adaptive ladder is the only addition, and it precedes the original text.
    for (const tier of ['**轻量**', '**标准**', '**深度**', '**关键**']) {
      assert.ok(redteam.includes(tier), `redteam-mode is missing the ${tier} tier`)
    }
    assert.ok(redteam.includes('## 自适应执行强度'))
    assert.ok(redteam.indexOf('## 自适应执行强度') < redteam.indexOf('## 身份'))
    assert.notEqual(redteam, prompts['standard-efficient'])
  })

  it('keeps the user-supplied Persona byte-identical and only prepends the effort layer', async () => {
    const provenance = JSON.parse(await readFile(new URL('redteam-mode/provenance.json', resources), 'utf8'))
    const original = await readFile(new URL(provenance.userOriginal.file, resources))
    const addition = await readFile(new URL(provenance.personaAddition.file, resources))
    assert.equal(original.length, provenance.userOriginal.bytes)
    assert.equal(createHash('sha256').update(original).digest('hex'), provenance.userOriginal.sha256)
    assert.equal(addition.length, provenance.personaAddition.bytes)
    assert.equal(createHash('sha256').update(addition).digest('hex'), provenance.personaAddition.sha256)
    // The invariant: the shipped Persona is the original text with the addition
    // inserted before its first section and nothing else changed.
    const shipped = prompts['redteam-mode']
    const originalText = original.toString('utf8')
    const additionText = addition.toString('utf8')
    const anchor = '## 身份\n'
    assert.equal(originalText.split(anchor).length, 2, 'the anchor must be unique in the original')
    assert.equal(shipped, originalText.replace(anchor, `${additionText}${anchor}`))
    assert.equal(shipped.replace(additionText, ''), originalText)
  })

  it('loads the exact standalone red-team document without merging Standard plugins or fields', async () => {
    const document = yaml.load(await readFile(new URL('redteam-mode/preset.yml', resources), 'utf8'), { schema: entryListSchema }) as { preset: PresetDefinition }
    const loaded = (await loadBundledResources()).definitions
    assert.equal(loaded.length, 1)
    assert.deepEqual(loaded[0], document.preset)
    assert.equal(loaded[0]!.id, 'redteam-mode')
    assert.equal(loaded[0]!.order, 10)
    assert.equal(loaded[0]!.plugins.length, 22)
    assert.equal(persona(loaded[0]!).prefix, prompts['redteam-mode'])
    assert.equal((persona(loaded[0]!).prefix as string).includes('{{model}}'), false)
    const groups = loaded[0]!.plugins.filter((row) => row.group === true)
    assert.deepEqual(groups.map((row) => row.id), ['planning', 'compaction', 'delegation'])
    for (const id of ['present', 'tool-plugin-manager', 'tool-plugin-market']) {
      assert.equal(loaded[0]!.plugins.find((row) => row.id === id)!.disabled, true)
    }
    assert.deepEqual(loaded[0]!.plugins.find((row) => row.id === 'tool-bash')!.disabled, { __jsExpr: "process.platform === 'win32'" })
  })

  it('rejects a modified local Codex original', async () => {
    const base = resolve(tmpdir())
    const temporary = await mkdtemp(join(base, 'dshpm-prompts-'))
    try {
      await cp(resources, temporary, { recursive: true })
      await writeFile(join(temporary, 'codex-original/prompt.md'), `${prompts['codex-original']}modified`)
      await assert.rejects(() => loadBundledPrompts(pathToFileURL(`${temporary}/`)), /pinned SHA-256/)
    } finally {
      assert.equal(dirname(resolve(temporary)), base)
      assert.ok(basename(temporary).startsWith('dshpm-prompts-'))
      await rm(temporary, { recursive: true, force: true })
    }
  })
})

describe('bundled registration lifecycle', () => {
  it('registers once, reads complete documents, and withdraws only owned presets', async () => {
    const fake = registry()
    const owner = new BundledPresetRegistration({ registry: fake, managedIds })
    const first = owner.start()
    assert.equal(owner.start(), first)
    assert.deepEqual(await first, [])
    assert.deepEqual(fake.attempts.map((entry) => entry.id), ['standard-efficient', 'codex-original', 'redteam-mode'])
    assert.equal(owner.owns('standard'), false)
    const document = await fake.readDocument('codex-original')
    assert.equal((parsePluginRows(document.content)[0]!.config as Record<string, unknown>).prefix, prompts['codex-original'])
    await owner.dispose()
    await owner.dispose()
    assert.deepEqual(fake.ids(), ['standard'])
    assert.equal(fake.disposalCounts.get('standard-efficient'), 1)
    assert.equal(fake.disposalCounts.get('codex-original'), 1)
  })

  it('preserves both an existing foreign registration and an unregistered user collision', async () => {
    const fake = registry()
    fake.seed({ id: 'standard-efficient', name: 'Existing preset', plugins: [] })
    const before = await fake.readDocument('standard-efficient')
    const owner = new BundledPresetRegistration({ registry: fake, managedIds: { has: (id) => id === 'codex-original' } })
    const issues = await owner.start()
    assert.equal(issues.filter((issue) => issue.code === 'bundled.id-conflict').length, 2)
    // The colliding ids are skipped; the remaining declaration still registers.
    assert.deepEqual(fake.attempts.map((entry) => entry.id), ['redteam-mode'])
    assert.deepEqual(await fake.readDocument('standard-efficient'), before)
    await owner.dispose()
    assert.deepEqual(await fake.readDocument('standard-efficient'), before)
  })

  it('waits for a late Standard declaration rather than registering a reduced fallback', async () => {
    const fake = new FakeAgentPresetRegistry()
    const ready = deferred()
    const owner = new BundledPresetRegistration({ registry: fake, managedIds, waitUntilReady: () => ready.promise })
    const started = owner.start()
    await turn()
    assert.equal(fake.attempts.length, 0)
    fake.seed(standard)
    ready.resolve()
    assert.deepEqual(await started, [])
    assert.equal(owner.owns('codex-original'), true)
    await owner.dispose()
  })

  it('cancels an unresolved Loader wait without deadlocking shutdown', { timeout: 1000 }, async () => {
    const fake = registry()
    const owner = new BundledPresetRegistration({ registry: fake, managedIds, waitUntilReady: () => new Promise(() => {}) })
    const started = owner.start()
    await turn()
    await owner.dispose()
    assert.deepEqual(await started, [])
    assert.equal(fake.attempts.length, 0)
  })

  it('withdraws a registration that finishes after disposal starts', { timeout: 1000 }, async () => {
    const fake = registry()
    const entered = deferred()
    const release = deferred()
    const delayed = {
      list: () => fake.list(),
      readDocument: (id: string) => fake.readDocument(id),
      async register(definition: PresetDefinition) {
        const dispose = await fake.register(definition)
        entered.resolve()
        await release.promise
        return dispose
      },
    }
    const owner = new BundledPresetRegistration({ registry: delayed, managedIds })
    const started = owner.start()
    await entered.promise
    const stopping = owner.dispose()
    release.resolve()
    await stopping
    assert.deepEqual(await started, [])
    assert.deepEqual(fake.ids(), ['standard'])
    assert.equal(fake.attempts.length, 1)
  })

  it('reports missing or broken Standard and keeps existing user definitions', async () => {
    for (const broken of [false, true]) {
      const fake = new FakeAgentPresetRegistry()
      fake.seed({ id: 'user-preset', plugins: [] })
      if (broken) fake.seed(standard, 'broken Standard fixture')
      const owner = new BundledPresetRegistration({ registry: fake, managedIds })
      assert.equal((await owner.start())[0]!.code, 'bundled.registration-failed')
      assert.equal(fake.attempts.length, 0)
      await owner.dispose()
      assert.ok(fake.ids().includes('user-preset'))
    }
  })

  it('derives again from the current Standard after reactivation with no duplicates', async () => {
    const fake = registry()
    const first = new BundledPresetRegistration({ registry: fake, managedIds })
    await first.start()
    await first.dispose()
    const updated = cloneDefinition(standard)
    ;(updated.plugins as PresetPluginRow[]).push({ name: '@test/new-standard-capability', config: { preserve: true } })
    fake.seed(updated)
    const second = new BundledPresetRegistration({ registry: fake, managedIds })
    assert.deepEqual(await second.start(), [])
    const read = parsePluginRows((await fake.readDocument('codex-original')).content)
    assert.deepEqual(read.at(-1), updated.plugins.at(-1))
    assert.equal(fake.ids().filter((id) => id === 'codex-original').length, 1)
    await second.dispose()
  })

  it('persists disabled bundled presets across restart and can enable them later', async () => {
    const fake = registry()
    let enabled = false
    const owner = new BundledPresetRegistration({
      registry: fake,
      managedIds,
      isDisabled: async () => !enabled,
    })
    assert.deepEqual(await owner.start(), [])
    assert.equal(fake.ids().includes('standard-efficient'), false)
    assert.equal(owner.definition('standard-efficient')?.id, 'standard-efficient')

    enabled = true
    const outcome = await owner.setRegistered('standard-efficient', true)
    assert.equal(outcome.healthy, true)
    assert.equal(owner.holds('standard-efficient'), true)
    assert.equal(fake.ids().includes('standard-efficient'), true)

    const stopped = await owner.setRegistered('standard-efficient', false)
    assert.equal(stopped.healthy, true)
    assert.equal(owner.holds('standard-efficient'), false)
    assert.equal(fake.ids().includes('standard-efficient'), false)
    await owner.dispose()
  })

  it('does not let a toggle steal an id whose registration belongs to someone else', async () => {
    const fake = registry()
    fake.seed({ id: 'codex-original', name: 'foreign', plugins: [] })
    const owner = new BundledPresetRegistration({ registry: fake, managedIds })
    const issues = await owner.start()
    assert.equal(issues.some((issue) => issue.code === 'bundled.id-conflict'), true)
    assert.equal(owner.conflicted('codex-original'), true)
    const outcome = await owner.setRegistered('codex-original', true)
    assert.equal(outcome.conflict, true)
    const before = await fake.readDocument('codex-original')
    assert.equal(before.name, 'foreign')
    await owner.dispose()
    assert.equal((await fake.readDocument('codex-original')).name, 'foreign')
  })

  it('withdraws a bundled registration that completes after shutdown starts', async () => {
    const fake = registry()
    let enabled = false
    const owner = new BundledPresetRegistration({
      registry: fake,
      managedIds,
      isDisabled: async () => !enabled,
    })
    await owner.start()
    enabled = true
    await owner.dispose()
    const outcome = await owner.setRegistered('standard-efficient', true)
    assert.equal(outcome.healthy, false)
    assert.match(outcome.broken ?? '', /shutting down/)
    assert.equal(fake.ids().includes('standard-efficient'), false)
  })

  it('serializes a toggle behind startup so it cannot race a late registration', async () => {
    const fake = new FakeAgentPresetRegistry()
    const ready = deferred()
    const owner = new BundledPresetRegistration({
      registry: fake,
      managedIds,
      waitUntilReady: () => ready.promise,
    })
    const started = owner.start()
    await turn()
    assert.equal(fake.attempts.length, 0)

    const disabling = owner.setRegistered('standard-efficient', false)
    await turn()
    assert.equal(fake.attempts.length, 0)

    fake.seed(standard)
    ready.resolve()
    assert.deepEqual(await started, [])
    const outcome = await disabling
    assert.equal(outcome.healthy, true)
    assert.equal(owner.holds('standard-efficient'), false)
    assert.equal(fake.ids().includes('standard-efficient'), false)
    await owner.dispose()
  })
})
