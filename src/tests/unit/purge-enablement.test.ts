/**
 * Purge is broader than deleting preset files: it clears persisted enablement
 * too. Bundled presets must therefore return to their default active state in
 * the same operation, while a foreign owner is never touched.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { FilePresetRepository } from '../../host/adapters/file-preset-repository.js'
import { DynamicPresetRegistryAdapter } from '../../host/adapters/dynamic-preset-registry.js'
import { DshPresetSource } from '../../host/adapters/dsh-preset-source.js'
import { RegistrationManager } from '../../host/lifecycle/registration-manager.js'
import { PresetManagerService } from '../../host/application/preset-manager-service.js'
import type { ApplicationDeps } from '../../host/application/deps.js'
import type { BundledPresetRuntime } from '../../host/ports/bundled-presets.js'
import type { PresetDefinition } from '../../shared/types.js'
import { PURGE_CONFIRMATION } from '../../host/application/preset-manager-service.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function preset(id: string): PresetDefinition {
  return { id, plugins: [{ name: '@deepseek-ai/dsh-persona' }] }
}

function runtime(
  definitions: ReadonlyMap<string, PresetDefinition>,
  options: {
    readonly conflicted?: (id: string) => boolean
    readonly held?: (id: string) => boolean
  } = {},
): BundledPresetRuntime & { readonly calls: { id: string; enabled: boolean }[] } {
  const calls: { id: string; enabled: boolean }[] = []
  return {
    ids: [...definitions.keys()],
    conflicted: options.conflicted ?? (() => false),
    holds: options.held ?? (() => false),
    definition: (id) => definitions.get(id),
    setRegistered: async (id, enabled) => {
      calls.push({ id, enabled })
      return { healthy: true }
    },
    calls,
  } as BundledPresetRuntime & { readonly calls: { id: string; enabled: boolean }[] }
}

async function serviceFor(
  dataDir: string,
  bundled: BundledPresetRuntime,
): Promise<{
  service: PresetManagerService
  registrations: RegistrationManager
  repository: FilePresetRepository
}> {
  const repository = new FilePresetRepository({ directory: dataDir })
  await repository.ensure()
  const registry = new FakeAgentPresetRegistry()
  const adapter = new DynamicPresetRegistryAdapter({
    registry,
    managedIds: { has: () => false },
  })
  const registrations = new RegistrationManager({ runtime: adapter })
  const source = new DshPresetSource({
    reader: registry,
    managedIds: { has: () => false },
    isShippedPreset: () => false,
    bundled,
    defaultId: async () => undefined,
  })
  const deps: ApplicationDeps = {
    repository,
    source,
    bundled,
    registrations,
    resolveModule: () => true,
    defaultPresetId: async () => undefined,
    warn: () => {},
    now: Date.now,
  }
  const service = new PresetManagerService(deps)
  service.markReady([])
  return { service, registrations, repository }
}

describe('purge enablement semantics', () => {
  it('re-enables controlled bundled presets after clearing their disabled state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dshpm-purge-enable-'))
    roots.push(root)
    const repository = new FilePresetRepository({ directory: root })
    await repository.ensure()
    await repository.setPresetDisabled('standard-efficient', true)
    const bundled = runtime(
      new Map([['standard-efficient', preset('standard-efficient')]]),
      { held: () => false },
    )
    const { service, repository: serviceRepository } = await serviceFor(root, bundled)

    const result = await service.purge(PURGE_CONFIRMATION)

    assert.equal(result.ok, true)
    assert.deepEqual(bundled.calls, [
      { id: 'standard-efficient', enabled: false },
      { id: 'standard-efficient', enabled: true },
    ])
    assert.equal(await serviceRepository.isPresetDisabled('standard-efficient'), false)
  })

  it('does not touch a bundled id owned by someone else', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dshpm-purge-enable-'))
    roots.push(root)
    const repository = new FilePresetRepository({ directory: root })
    await repository.ensure()
    const bundled = runtime(
      new Map([['standard-efficient', preset('standard-efficient')]]),
      { conflicted: () => true },
    )
    const { service } = await serviceFor(root, bundled)

    await service.purge(PURGE_CONFIRMATION)

    assert.deepEqual(bundled.calls, [])
  })
})
