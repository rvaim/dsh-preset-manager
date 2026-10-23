/**
 * Dynamic registration lifecycle.
 *
 * These tests target the behaviours that decide whether the plugin is safe: the
 * adapter must never report a broken activation as healthy, must compensate a
 * failed replacement, and must withdraw every registration on disposal — even
 * when a registration was still in flight when disposal started.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import {
  DynamicPresetRegistryAdapter,
  type ManagedIdRegistry,
} from '../../host/adapters/dynamic-preset-registry.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'

function preset(id: string, extra: Partial<PresetDefinition> = {}): PresetDefinition {
  return {
    id,
    name: id,
    plugins: [
      {
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: { prefix: `persona for ${id}`, complete: false },
      },
    ],
    ...extra,
  }
}

function managedIds(ids: string[] = []): ManagedIdRegistry {
  const set = new Set(ids)
  return { has: (id: string) => set.has(id) }
}

describe('DynamicPresetRegistryAdapter', () => {
  it('registers a definition and reports it healthy', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    const outcome = await adapter.register(preset('a'))

    assert.equal(outcome.healthy, true)
    assert.equal(outcome.broken, undefined)
    assert.deepEqual(registry.ids(), ['a'])
    assert.equal(adapter.holds('a'), true)
  })

  it('reports an activation failure as unhealthy instead of throwing', async () => {
    const registry = new FakeAgentPresetRegistry({ missingModules: ['@missing/plugin'] })
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    const outcome = await adapter.register({
      id: 'a',
      plugins: [{ id: 'x', name: '@missing/plugin' }],
    })

    // The registry published the preset, so `register` resolved — but the
    // adapter must not call that success.
    assert.equal(outcome.healthy, false)
    assert.match(outcome.broken ?? '', /@missing\/plugin/)
    assert.equal(registry.ids().includes('a'), true)
  })

  it('refuses a duplicate id rather than overwriting another declaration', async () => {
    const registry = new FakeAgentPresetRegistry()
    registry.seed(preset('standard'))
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    await assert.rejects(() => adapter.register(preset('standard')), /Duplicate agent preset/)
    // The seeded declaration is untouched.
    assert.deepEqual(registry.ids(), ['standard'])
  })

  it('replaces a registration through unregister-then-register', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    await adapter.register(preset('a', { name: 'first' }))
    const outcome = await adapter.replace(preset('a', { name: 'second' }))

    assert.equal(outcome.healthy, true)
    const rows = await registry.list()
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, 'second')
    // The first registration's disposer ran exactly once.
    assert.equal(registry.disposalCounts.get('a'), 1)
  })

  it('restores the previous revision when the new one activates broken', async () => {
    const registry = new FakeAgentPresetRegistry({ missingModules: ['@missing/plugin'] })
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    await adapter.register(preset('a', { name: 'working' }))

    const outcome = await adapter.replace({
      id: 'a',
      name: 'broken',
      plugins: [{ id: 'x', name: '@missing/plugin' }],
    })

    // The caller learns the new revision is unusable…
    assert.equal(outcome.healthy, false)
    // …and the version that worked is live again.
    const rows = await registry.list()
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, 'working')
    assert.equal(rows[0]?.broken, undefined)
  })

  it('reports a failure and leaves the preset unregistered when nothing can be restored', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    // A register that throws outright, which the real registry does for a
    // duplicate id or an unavailable service.
    const failing = new DynamicPresetRegistryAdapter({
      registry: {
        register: async () => {
          throw new Error('registry unavailable')
        },
        list: async () => [],
      },
      managedIds: managedIds(['b']),
    })

    await assert.rejects(() => failing.register(preset('b')), /registry unavailable/)
    assert.equal(failing.holds('b'), false)
    assert.equal(adapter.holds('a'), false)
  })

  it('withdraws every registration on dispose', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a', 'b', 'c']),
    })

    await adapter.register(preset('a'))
    await adapter.register(preset('b'))
    await adapter.register(preset('c'))
    assert.deepEqual([...adapter.heldIds()].sort(), ['a', 'b', 'c'])

    await adapter.dispose()

    assert.deepEqual(adapter.heldIds(), [])
    assert.deepEqual(registry.ids(), [])
    for (const id of ['a', 'b', 'c']) assert.equal(registry.disposalCounts.get(id), 1)
  })

  it('is idempotent across repeated dispose calls', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })
    await adapter.register(preset('a'))

    await adapter.dispose()
    await adapter.dispose()

    // A second dispose must not re-run a disposer, which would be a double
    // withdrawal of one registration.
    assert.equal(registry.disposalCounts.get('a'), 1)
  })

  it('refuses new work once disposal has started', async () => {
    const registry = new FakeAgentPresetRegistry()
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })
    await adapter.dispose()

    await assert.rejects(() => adapter.register(preset('a')), /shutting down/)
    assert.deepEqual(registry.ids(), [])
  })

  it('leaves no orphan when disposal races an in-flight registration', async () => {
    // A registry whose register() resolves only after the test releases it, so
    // disposal can start while the registration is still pending.
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const rows = new Map<string, () => Promise<void>>()

    const slow = new DynamicPresetRegistryAdapter({
      registry: {
        register: async (definition: PresetDefinition) => {
          await gate
          const dispose = async () => {
            rows.delete(definition.id)
          }
          rows.set(definition.id, dispose)
          return dispose
        },
        list: async () =>
          [...rows.keys()].map((id) => ({ id })),
      },
      managedIds: managedIds(['a']),
    })

    const pending = slow.register(preset('a'))
    // Start disposal while the registration is blocked, then let it finish.
    const disposing = slow.dispose()
    release?.()

    // The registration must fail rather than silently succeed after teardown…
    await assert.rejects(() => pending, /shut down during registration/)
    await disposing
    // …and no registration may survive it.
    assert.equal(rows.size, 0)
    assert.deepEqual(slow.heldIds(), [])
  })

  it('does not report health when the roster cannot be read', async () => {
    let fail = false
    const registry = new FakeAgentPresetRegistry({ failList: () => fail })
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['a']),
    })

    fail = true
    const outcome = await adapter.register(preset('a'))

    // The preset may well be fine, but the adapter cannot prove it and must say so.
    assert.equal(outcome.healthy, false)
    assert.match(outcome.broken ?? '', /roster unreadable/)
  })

  it('labels ownership from evidence, not from the id', async () => {
    const registry = new FakeAgentPresetRegistry()
    registry.seed(preset('standard'))
    registry.seed(preset('other-plugin-preset'))
    const adapter = new DynamicPresetRegistryAdapter({
      registry,
      managedIds: managedIds(['mine']),
      isShippedPreset: (id) => id === 'standard',
    })
    await adapter.register(preset('mine'))

    const roster = await adapter.roster()
    const byId = new Map(roster.map((row) => [row.id, row]))

    assert.equal(byId.get('mine')?.ownership, 'managed')
    assert.equal(byId.get('standard')?.ownership, 'builtin')
    assert.equal(byId.get('other-plugin-preset')?.ownership, 'third-party')
  })
})
