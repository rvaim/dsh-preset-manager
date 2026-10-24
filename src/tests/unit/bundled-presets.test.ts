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
import { loadBundledPrompts } from '../../host/bundled/local-prompts.js'
import { BundledPresetRegistration } from '../../host/bundled/registration.js'
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

  it('retains only the intended model reference and refuses Codex interpolation', () => {
    assert.deepEqual([...prompts['standard-efficient'].matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1]), ['model'])
    assert.equal(prompts['codex-original'].includes('{{'), false)
    assert.throws(() => deriveBundledPresets(standard, { ...prompts, 'codex-original': '{{model}}' }), /refusing to interpolate/)
    assert.throws(() => deriveBundledPresets(standard, { ...prompts, 'standard-efficient': '{{unknown}}' }), /unexpected prompt variable/)
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

  it('loads both full resources with the network unavailable', async () => {
    const previous = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('network forbidden in prompt loading') }
    try { assert.deepEqual(await loadBundledPrompts(), prompts) } finally { globalThis.fetch = previous }
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
    assert.deepEqual(fake.attempts.map((entry) => entry.id), ['standard-efficient', 'codex-original'])
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
    assert.equal(fake.attempts.length, 0)
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
})
