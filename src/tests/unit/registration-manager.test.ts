/**
 * Registration manager: reconciliation, gating, and shutdown ordering.
 *
 * The manager is the piece that decides whether a plugin disable leaves orphan
 * presets behind, so these tests focus on the transitions rather than the happy
 * path: a gate that closes before any await, a reconcile that withdraws what is
 * no longer wanted, and a shutdown that is safe to run twice.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import {
  DynamicPresetRegistryAdapter,
} from '../../host/adapters/dynamic-preset-registry.js'
import { RegistrationManager } from '../../host/lifecycle/registration-manager.js'
import { revisionOf } from '../../domain/preset-revision.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'

function preset(id: string, name?: string): PresetDefinition {
  return {
    id,
    ...(name === undefined ? {} : { name }),
    plugins: [{ id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'x' } }],
  }
}

function build(options: { missing?: readonly string[] } = {}): {
  registry: FakeAgentPresetRegistry
  manager: RegistrationManager
} {
  const registry = new FakeAgentPresetRegistry({
    ...(options.missing === undefined ? {} : { missingModules: options.missing }),
  })
  const adapter = new DynamicPresetRegistryAdapter({
    registry,
    managedIds: { has: () => true },
  })
  return { registry, manager: new RegistrationManager({ runtime: adapter }) }
}

describe('RegistrationManager', () => {
  it('records a healthy registration', async () => {
    const { manager, registry } = build()
    const definition = preset('a')
    const record = await manager.register(definition, revisionOf(definition))

    assert.equal(record.state, 'registered')
    assert.equal(record.health, 'healthy')
    assert.equal(manager.isRegistered('a'), true)
    assert.deepEqual(registry.ids(), ['a'])
  })

  it('records a broken activation as a failure, not a success', async () => {
    const { manager } = build({ missing: ['@deepseek-ai/dsh-persona'] })
    const definition = preset('a')
    const record = await manager.register(definition, revisionOf(definition))

    assert.equal(record.state, 'failed')
    assert.equal(record.health, 'broken')
    assert.match(record.diagnostic ?? '', /failed to import/)
  })

  it('withdraws a registration that is no longer desired', async () => {
    const { manager, registry } = build()
    await manager.register(preset('keep'), 'r1')
    await manager.register(preset('drop'), 'r2')
    assert.deepEqual(registry.ids().sort(), ['drop', 'keep'])

    // A reconcile with only `keep` desired must withdraw `drop`.
    await manager.reconcile([{ definition: preset('keep'), revision: 'r1' }])

    assert.deepEqual(registry.ids(), ['keep'])
    assert.equal(manager.isRegistered('drop'), false)
  })

  it('keeps reconciling after one preset fails', async () => {
    const { manager, registry } = build({ missing: ['@missing/plugin'] })
    const good = preset('good')
    const bad: PresetDefinition = {
      id: 'bad',
      plugins: [{ id: 'x', name: '@missing/plugin' }],
    }

    const records = await manager.reconcile([
      { definition: bad, revision: 'r-bad' },
      { definition: good, revision: 'r-good' },
    ])

    assert.equal(records.find((record) => record.id === 'bad')?.state, 'failed')
    assert.equal(records.find((record) => record.id === 'good')?.state, 'registered')
    // The good preset is live despite its neighbour failing.
    assert.equal(registry.ids().includes('good'), true)
  })

  it('refuses new work once the shutdown gate closes', async () => {
    const { manager, registry } = build()
    manager.beginShutdown()

    const record = await manager.register(preset('late'), 'r1')

    assert.equal(record.state, 'failed')
    assert.match(record.diagnostic ?? '', /shutting down/)
    assert.deepEqual(registry.ids(), [])
  })

  it('withdraws everything on shutdown and is safe to repeat', async () => {
    const { manager, registry } = build()
    await manager.register(preset('a'), 'r1')
    await manager.register(preset('b'), 'r2')

    await manager.shutdown()
    assert.deepEqual(registry.ids(), [])
    assert.deepEqual(manager.registeredIds(), [])

    // A second shutdown must not throw or resurrect anything.
    await manager.shutdown()
    assert.deepEqual(registry.ids(), [])
    assert.equal(registry.disposalCounts.get('a'), 1)
  })

  it('re-registers a preset under a new revision exactly once', async () => {
    const { manager, registry } = build()
    await manager.register(preset('a', 'first'), 'r1')
    await manager.register(preset('a', 'second'), 'r2')

    const rows = await registry.list()
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, 'second')
    // Two registrations happened, and the first was withdrawn.
    assert.equal(registry.attempts.filter((attempt) => attempt.id === 'a').length, 2)
    assert.equal(registry.disposalCounts.get('a'), 1)
  })

  it('does not leave a preset registered when registration throws', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry: {
        register: async () => {
          throw new Error('service unavailable')
        },
        list: async () => [],
      },
      managedIds: { has: () => true },
    })
    const manager = new RegistrationManager({ runtime: adapter })

    const record = await manager.register(preset('a'), 'r1')

    assert.equal(record.state, 'failed')
    assert.match(record.diagnostic ?? '', /service unavailable/)
    assert.equal(manager.isRegistered('a'), false)
  })
})
