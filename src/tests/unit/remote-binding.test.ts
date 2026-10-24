/**
 * Remote binding identity.
 *
 * The gateway resolves a Remote call by taking the object published under the
 * descriptor's `service` key and validating it:
 *
 *   Reflect.get(original, 'typertRemote').service === original
 *
 * If a builder spreads the face into a second object and points `service` at the
 * first one, that identity fails and every call dies with
 * `gateway/binding-invalid`. In the UI that surfaces as "Host interface not
 * ready", which looks like a transport problem and is very hard to trace back to
 * an object identity. These tests pin the invariant so it cannot regress.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRemoteFace } from '../../host/remote/preset-manager-remote.js'
import type { PresetManagerService } from '../../host/application/preset-manager-service.js'

/**
 * A minimal stand-in for the application service.
 *
 * Every method returns a recognizable value so a test can prove the face is a
 * pass-through rather than a reimplementation.
 */
function fakeService(): PresetManagerService {
  const marker = { ok: true, applied: true, errors: [], warnings: [] }
  return {
    snapshot: async () => ({ phase: 'ready', presets: [], dataDirectory: '/tmp', diagnostics: [], busy: false }),
    cloneSources: async () => [],
    detail: async (id: string) => ({ id }),
    history: async () => [],
    setEnabled: async () => marker,
    clone: async () => marker,
    save: async () => marker,
    remove: async () => marker,
    restore: async () => marker,
    validate: async () => ({ ok: true, errors: [], warnings: [] }),
    diff: async () => ({
      changedMetadata: [],
      addedPlugins: [],
      removedPlugins: [],
      changedPlugins: [],
      unchangedPlugins: 0,
    }),
    renderYaml: async () => '[]\n',
    parseYaml: async () => ({
      definition: { id: 'x', plugins: [] },
      validation: { ok: true, errors: [], warnings: [] },
    }),
    exportPreset: async () => ({ yaml: '', risks: [] }),
    shareText: async () => ({ yaml: '', risks: [] }),
    previewImport: async () => ({ definition: { id: 'x', plugins: [] } }),
    importPreset: async () => marker,
    purge: async () => marker,
    quiesce: async () => {},
  } as unknown as PresetManagerService
}

describe('remote binding', () => {
  it('names itself as the bound service', () => {
    const face = createRemoteFace(fakeService())
    // This is the exact check the gateway performs before dispatching a call.
    assert.equal(face.typertRemote.service, face)
  })

  it('reports the namespace and service key the descriptors use', () => {
    const face = createRemoteFace(fakeService())
    assert.equal(face.typertRemote.serviceKey, 'presetManager')
    assert.equal(face.typertRemote.namespace, 'presetManager')
  })

  it('keeps the binding non-enumerable so it cannot leak into JSON', () => {
    const face = createRemoteFace(fakeService())
    // A binding object that survives a spread or a JSON round-trip would point
    // at a copy, breaking the identity above.
    assert.equal(Object.keys(face).includes('typertRemote'), false)
    assert.equal(JSON.stringify({ ...face }).includes('typertRemote'), false)
  })

  it('exposes every method the descriptors declare', async () => {
    const face = createRemoteFace(fakeService())
    const expected = [
      'snapshot',
      'cloneSources',
      'detail',
      'history',
      'setEnabled',
      'clone',
      'save',
      'remove',
      'restore',
      'validate',
      'diff',
      'renderYaml',
      'parseYaml',
      'exportPreset',
      'shareText',
      'previewImport',
      'importPreset',
      'purge',
    ]
    for (const name of expected) {
      assert.equal(
        typeof (face as unknown as Record<string, unknown>)[name],
        'function',
        `missing remote method ${name}`,
      )
    }
  })

  it('passes arguments through positionally, as the descriptors declare', async () => {
    const calls: unknown[][] = []
    const service = fakeService() as unknown as Record<string, (...args: unknown[]) => unknown>
    service['clone'] = (...args: unknown[]) => {
      calls.push(args)
      return Promise.resolve({ ok: true, applied: true, errors: [], warnings: [] })
    }
    const face = createRemoteFace(service as unknown as PresetManagerService)

    await face.clone('standard', 'mine', 'Mine', undefined)

    // The Remote face takes positional arguments; a named-object signature here
    // would send `[object Object]` as the source id.
    assert.deepEqual(calls[0], [{ sourceId: 'standard', newId: 'mine', name: 'Mine' }])
  })
})
