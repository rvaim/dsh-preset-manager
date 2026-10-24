/**
 * Persisted enablement and bundled-preset lifecycle.
 *
 * These tests exercise the real repository, runtime adapter and service over a
 * fake DSH registry. They focus on the states users can otherwise lose: a
 * restart resurrecting a disabled preset, a failed write leaving runtime and
 * disk disagreeing, a disabled definition becoming unreadable, and a foreign
 * owner being toggled by mistake.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { FilePresetRepository } from '../../host/adapters/file-preset-repository.js'
import { DynamicPresetRegistryAdapter } from '../../host/adapters/dynamic-preset-registry.js'
import { DshPresetSource } from '../../host/adapters/dsh-preset-source.js'
import { RegistrationManager } from '../../host/lifecycle/registration-manager.js'
import { restoreStoredPresets } from '../../host/lifecycle/startup-restore.js'
import { PresetManagerService } from '../../host/application/preset-manager-service.js'
import type { ApplicationDeps } from '../../host/application/deps.js'
import type { BundledPresetRuntime } from '../../host/ports/bundled-presets.js'
import type { PresetDefinition } from '../../shared/types.js'
import { ManagerErrorCode } from '../../shared/errors.js'
import { revisionOf } from '../../domain/preset-revision.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'

const roots: string[] = []
const OFFICIAL_IDS = ['standard', 'ptc', 'minimal', 'cordis'] as const

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function preset(id: string, name = id): PresetDefinition {
  return {
    id,
    name,
    plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: name } }],
  }
}

function bundledRuntime(
  definitions: ReadonlyMap<string, PresetDefinition>,
  state: {
    readonly holds?: (id: string) => boolean
    readonly conflicted?: (id: string) => boolean
    readonly setRegistered?: (
      id: string,
      enabled: boolean,
    ) => Promise<{ healthy: boolean; broken?: string; conflict?: boolean }>
  } = {},
): BundledPresetRuntime & {
  readonly calls: { id: string; enabled: boolean }[]
} {
  const calls: { id: string; enabled: boolean }[] = []
  return {
    ids: [...definitions.keys()],
    holds: state.holds ?? (() => false),
    conflicted: state.conflicted ?? (() => false),
    definition: (id) => definitions.get(id),
    setRegistered: async (id, enabled) => {
      calls.push({ id, enabled })
      return state.setRegistered === undefined
        ? { healthy: true }
        : state.setRegistered(id, enabled)
    },
    calls,
  } as BundledPresetRuntime & { readonly calls: { id: string; enabled: boolean }[] }
}

interface Harness {
  readonly dataDir: string
  readonly repository: FilePresetRepository
  readonly registry: FakeAgentPresetRegistry
  readonly service: PresetManagerService
  readonly deps: ApplicationDeps
  readonly bundledCalls: { id: string; enabled: boolean }[]
}

async function harness(options: {
  readonly bundled?: ReadonlyMap<string, PresetDefinition>
  readonly disabled?: readonly string[]
  readonly seeded?: readonly PresetDefinition[]
  readonly defaultId?: string
  readonly setRegistered?: (
    id: string,
    enabled: boolean,
  ) => Promise<{ healthy: boolean; broken?: string; conflict?: boolean }>
} = {}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dshpm-enablement-'))
  roots.push(root)
  const dataDir = join(root, 'data')
  const repository = new FilePresetRepository({ directory: dataDir })
  await repository.ensure()
  for (const id of options.disabled ?? []) await repository.setPresetDisabled(id, true)

  const registry = new FakeAgentPresetRegistry()
  for (const entry of options.seeded ?? []) registry.seed(entry)
  const managedIds = new Set<string>()
  const adapter = new DynamicPresetRegistryAdapter({
    registry,
    managedIds: { has: (id) => managedIds.has(id) },
    isShippedPreset: (id) => OFFICIAL_IDS.includes(id as (typeof OFFICIAL_IDS)[number]),
  })
  const registrations = new RegistrationManager({ runtime: adapter })
  const bundled = bundledRuntime(options.bundled ?? new Map(), {
    ...(options.setRegistered === undefined ? {} : { setRegistered: options.setRegistered }),
  })
  const source = new DshPresetSource({
    reader: registry,
    managedIds: { has: (id) => managedIds.has(id) },
    isShippedPreset: (id) => OFFICIAL_IDS.includes(id as (typeof OFFICIAL_IDS)[number]),
    bundled,
    defaultId: async () => options.defaultId,
  })
  const deps: ApplicationDeps = {
    repository,
    source,
    bundled,
    registrations,
    resolveModule: () => true,
    defaultPresetId: async () => options.defaultId,
    warn: () => {},
    now: Date.now,
  }
  const service = new PresetManagerService(deps)
  const outcome = await restoreStoredPresets({ repository, registrations })
  service.markReady(outcome.diagnostics)
  return { dataDir, repository, registry, service, deps, bundledCalls: bundled.calls }
}

describe('managed preset enablement', () => {
  it('persists disabled state, survives restart, and remains viewable and editable', async () => {
    const h = await harness({ defaultId: 'standard' })
    await h.repository.save(preset('editable', 'before disable'), 'create')
    await h.deps.registrations.register(preset('editable', 'before disable'), revisionOf(preset('editable', 'before disable')))

    const result = await h.service.setEnabled({ id: 'editable', enabled: false })
    assert.equal(result.applied, true)
    assert.equal(result.preset?.enabled, false)
    assert.equal(h.registry.ids().includes('editable'), false)

    const snapshot = await h.service.snapshot()
    const row = snapshot.presets.find((entry) => entry.id === 'editable')
    assert.equal(row?.enabled, false)
    assert.equal(row?.canToggle, true)
    assert.equal(row?.registration, 'not-registered')

    // Reading and editing a stopped preset do not register it again.
    assert.equal((await h.service.detail('editable')).definition.name, 'before disable')
    assert.match((await h.service.exportPreset('editable')).yaml, /dsh-agent-preset-share/)
    const edit = await h.service.save({
      definition: preset('editable', 'edited while stopped'),
      expectedRevision: (await h.repository.get('editable'))?.revision,
    })
    assert.equal(edit.applied, true)
    assert.equal(h.registry.ids().includes('editable'), false)

    const restartedRegistry = new FakeAgentPresetRegistry()
    const restartedAdapter = new DynamicPresetRegistryAdapter({
      registry: restartedRegistry,
      managedIds: { has: (id) => id === 'editable' },
    })
    const restartedRegistrations = new RegistrationManager({ runtime: restartedAdapter })
    const outcome = await restoreStoredPresets({
      repository: h.repository,
      registrations: restartedRegistrations,
    })
    assert.deepEqual(outcome.restored, [])
    assert.equal(restartedRegistry.ids().includes('editable'), false)
  })

  it('compensates runtime state when persistence fails', async () => {
    const h = await harness({ defaultId: 'standard' })
    const definition = preset('atomic')
    await h.repository.save(definition, 'create')
    await h.deps.registrations.register(definition, revisionOf(definition))
    const original = h.repository.setPresetDisabled.bind(h.repository)
    h.repository.setPresetDisabled = async () => {
      throw new Error('disk full')
    }
    try {
      await assert.rejects(
        () => h.service.setEnabled({ id: 'atomic', enabled: false }),
        (error: unknown) =>
          error instanceof Error &&
          'code' in error &&
          error.code === ManagerErrorCode.storageFailure,
      )
    } finally {
      h.repository.setPresetDisabled = original
    }
    assert.equal(h.registry.ids().includes('atomic'), true)
    assert.equal(await h.repository.isPresetDisabled('atomic'), false)
    assert.match((await readFile(join(h.dataDir, 'presets', 'atomic.yml'), 'utf8')), /atomic/)
  })

  it('refuses the DSH-selected default but allows re-enabling a stopped default', async () => {
    const h = await harness({ defaultId: 'locked', disabled: ['stopped'] })
    await h.repository.save(preset('locked'), 'create')
    await h.repository.save(preset('stopped'), 'create')
    await assert.rejects(
      () => h.service.setEnabled({ id: 'locked', enabled: false }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === ManagerErrorCode.invalidInput,
    )
    assert.equal(h.registry.ids().includes('locked'), false)
    const enabled = await h.service.setEnabled({ id: 'stopped', enabled: true })
    assert.equal(enabled.applied, true)
    assert.equal(h.registry.ids().includes('stopped'), true)
  })

  it('refuses official, foreign, and same-id user presets', async () => {
    const h = await harness({
      disabled: ['standard-efficient'],
      seeded: [
        preset('standard'),
        preset('ptc'),
        preset('minimal'),
        preset('cordis'),
        preset('foreign'),
        preset('standard-efficient', 'user declaration'),
      ],
      bundled: new Map([['standard-efficient', preset('standard-efficient', 'bundled')]]),
    })
    for (const id of [...OFFICIAL_IDS, 'foreign']) {
      await assert.rejects(
        () => h.service.setEnabled({ id, enabled: false }),
        (error: unknown) =>
          error instanceof Error &&
          'code' in error &&
          error.code === ManagerErrorCode.presetNotOwned,
      )
    }
    assert.deepEqual(h.bundledCalls, [])
    assert.equal(h.registry.ids().includes('standard-efficient'), true)
  })
})

describe('bundled preset enablement', () => {
  it('toggles bundled presets and keeps their IDs reserved while disabled', async () => {
    const bundled = new Map([['standard-efficient', preset('standard-efficient', 'bundled')]])
    const h = await harness({ bundled, defaultId: 'standard' })
    const result = await h.service.setEnabled({ id: 'standard-efficient', enabled: false })
    assert.equal(result.applied, true)
    assert.deepEqual(h.bundledCalls, [{ id: 'standard-efficient', enabled: false }])
    assert.equal(await h.repository.isPresetDisabled('standard-efficient'), true)

    const known = await h.deps.source.knownIds()
    assert.equal(known.get('standard-efficient'), 'builtin')
    await assert.rejects(
      () => h.service.importPreset({
        text: [
          'kind: dsh-agent-preset-share',
          'formatVersion: 1',
          'preset:',
          '  id: standard-efficient',
          '  plugins: []',
          '',
        ].join('\n'),
        source: 'share',
        acknowledgedRisks: true,
      }),
      (error: unknown) => {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        return code === ManagerErrorCode.presetInvalid
      },
    )
  })

  it('restores bundled definitions for view/copy/export while disabled', async () => {
    const definition = preset('codex-original', 'bundled original')
    const h = await harness({
      disabled: ['codex-original'],
      bundled: new Map([['codex-original', definition]]),
      defaultId: 'standard',
    })
    const snapshot = await h.service.snapshot()
    const row = snapshot.presets.find((entry) => entry.id === 'codex-original')
    assert.equal(row?.enabled, false)
    assert.equal(row?.ownership, 'builtin')
    assert.equal(row?.canToggle, true)
    assert.equal((await h.service.detail('codex-original')).definition.id, 'codex-original')
    assert.match((await h.service.exportPreset('codex-original')).yaml, /bundled original/)
  })

  it('reports activation failure and does not persist an enabled state', async () => {
    const h = await harness({
      disabled: ['codex-original'],
      bundled: new Map([['codex-original', preset('codex-original')]]),
      setRegistered: async () => ({ healthy: false, broken: 'missing module' }),
    })
    await assert.rejects(
      () => h.service.setEnabled({ id: 'codex-original', enabled: true }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === ManagerErrorCode.activationBroken,
    )
    assert.equal(await h.repository.isPresetDisabled('codex-original'), true)
  })
})

describe('storage metadata', () => {
  it('purge includes disabled IDs in its backup and removes the state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dshpm-purge-state-'))
    roots.push(root)
    const repository = new FilePresetRepository({ directory: root })
    await repository.ensure()
    await repository.save(preset('managed'), 'create')
    await repository.setPresetDisabled('managed', true)
    await repository.setPresetDisabled('standard-efficient', true)

    await repository.purge()

    assert.deepEqual([...(await repository.disabledPresetIds())], [])
    const backups = await readdir(join(root, 'backups'))
    const purge = backups.find((name) => name.startsWith('purge-'))
    assert.ok(purge)
    const backup = JSON.parse(await readFile(join(root, 'backups', purge), 'utf8'))
    assert.deepEqual(backup.disabledPresets, ['managed', 'standard-efficient'])
  })

  it('leaves definition bytes unchanged when only the switch changes', async () => {
    const h = await harness({ defaultId: 'standard' })
    await h.repository.save(preset('stable', 'stable bytes'), 'create')
    const path = join(h.dataDir, 'presets', 'stable.yml')
    const before = await readFile(path, 'utf8')
    await h.service.setEnabled({ id: 'stable', enabled: false })
    await h.service.setEnabled({ id: 'stable', enabled: true })
    assert.equal(await readFile(path, 'utf8'), before)
  })

  it('serializes concurrent toggles to the last requested state', async () => {
    const h = await harness({ defaultId: 'standard' })
    await h.repository.save(preset('rapid'), 'create')
    const results = await Promise.all([
      h.service.setEnabled({ id: 'rapid', enabled: false }),
      h.service.setEnabled({ id: 'rapid', enabled: true }),
      h.service.setEnabled({ id: 'rapid', enabled: false }),
    ])
    assert.equal(results.every((result) => result.applied), true)
    assert.equal(await h.repository.isPresetDisabled('rapid'), true)
    assert.equal(h.registry.ids().includes('rapid'), false)
  })
})
