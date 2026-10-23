/**
 * Exercise the current build through real DSH Client/Host Gateways and Typert
 * registries. Only the carrier and application fixture are in-memory: descriptor
 * admission, namespace Services, dispatch, codecs and disposal use the pinned SDK.
 * No installed profile or user preset data is read or changed.
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import HostGateway from '@deepseek-ai/dsh-api-gateway'
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
// An explicit dist directory also lets this check a freshly unpacked npm tarball.
const dist = resolve(process.argv[2] ?? join(root, 'dist'))
const { createRemoteFace } = await import(pathToFileURL(join(dist, 'host/remote/preset-manager-remote.js')).href)
const { PRESET_MANAGER_CONTRIBUTION, PRESET_MANAGER_REMOTE } = await import(
  pathToFileURL(join(dist, 'host/remote/descriptors.js')).href
)
const apiBuild = await build({
  entryPoints: [join(root, 'src/client/api/remote-api.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})
const { createApi } = await import(`data:text/javascript;base64,${Buffer.from(apiBuild.outputFiles[0].text).toString('base64')}`)
const mountBuild = await build({
  entryPoints: [join(root, 'src/client/state/mount-remote.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const { mountRemoteNamespace } = await import(`data:text/javascript;base64,${Buffer.from(mountBuild.outputFiles[0].text).toString('base64')}`)

const host = new Context()
const client = new Context()
const peer = { principal: { kind: 'owner' }, interactions: 'none', signal: new AbortController().signal }
const interceptors = new Set()
const calls = []
let unavailableObserved
let snapshotCalls = 0
const mutation = { ok: true, applied: true, errors: [], warnings: [] }
const snapshot = { phase: 'ready', presets: [], dataDirectory: '/fixture', diagnostics: [], busy: false }
const face = createRemoteFace({
  snapshot: async () => snapshot,
  cloneSources: async () => [],
  detail: async (id) => ({ id }),
  history: async () => [],
  clone: async (request) => { calls.push(['clone', request]); return mutation },
  save: async () => mutation,
  remove: async (request) => { calls.push(['remove', request]); return mutation },
  restore: async () => mutation,
  validate: async () => ({ ok: true, errors: [], warnings: [] }),
  diff: async () => ({}),
  renderYaml: async () => '[]\n',
  parseYaml: async () => ({}),
  exportPreset: async () => ({}),
  shareText: async () => ({}),
  previewImport: async () => ({}),
  importPreset: async () => mutation,
  purge: async () => mutation,
})

let passed = 0
function check(name, verify) {
  verify()
  passed++
  console.log(`PASS  ${name}`)
}

try {
  await host.plugin(TypertRegistry)
  host.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  host.provide('connection', {
    rpc: {
      intercept(prefix, claims, dispatch) {
        const entry = { prefix, claims, dispatch }
        interceptors.add(entry)
        return () => { interceptors.delete(entry) }
      },
    },
  })
  await host.plugin(HostGateway)
  host.provide('presetManager', face)
  host.typert.register(PRESET_MANAGER_CONTRIBUTION)

  check('binding names the published object and namespace', () => {
    assert.equal(face.typertRemote.service, face)
    for (const descriptor of PRESET_MANAGER_REMOTE.descriptors) {
      assert.equal(descriptor.service, face.typertRemote.serviceKey)
      assert.equal(descriptor.namespace, face.typertRemote.namespace)
      assert.equal(typeof face[descriptor.implementation ?? descriptor.method], 'function')
    }
  })

  await client.plugin(TypertRegistry)
  client.provide('connection', {
    interactions: 'none',
    rpc: {
      // Supplying a logical stream carrier prevents opening a WebSocket.
      open: () => { throw new Error('unexpected stream in unary test') },
      async call(prefix, endpoint, payload, signal) {
        const entry = [...interceptors].find((candidate) => candidate.prefix === prefix && candidate.claims(endpoint))
        assert.ok(entry, `no Host interceptor for ${endpoint}`)
        // JSON round trips reproduce omitted undefined fields and transport envelopes.
        if (endpoint === 'presetManager/snapshot') snapshotCalls += 1
        const response = await entry.dispatch(endpoint, JSON.parse(JSON.stringify(payload)), signal, peer)
        if (!response.ok && response.error.code === 'gateway/service-unavailable') unavailableObserved?.()
        return JSON.parse(JSON.stringify(response))
      },
    },
  })
  await client.plugin(ClientGateway)

  // The original descriptor must fail with the user's exact error. A small
  // stand-in Service cannot exercise this namespace/prototype collision.
  const deletion = PRESET_MANAGER_REMOTE.descriptors.find((descriptor) =>
    (descriptor.implementation ?? descriptor.method) === 'remove',
  )
  assert.ok(deletion)
  const legacy = { ...deletion, id: `${deletion.id}:legacy`, method: 'remove' }
  await assert.rejects(
    client.remote.$mount({ package: '@test/legacy-preset-manager', descriptors: [legacy] }),
    /method "presetManager\/remove" conflicts with its namespace service/,
  )
  check('real Client rejects the legacy remove endpoint atomically', () => {
    assert.equal(client.get('remote.presetManager'), undefined)
    assert.equal(client.typert.remotes.get('presetManager/remove'), undefined)
  })

  const dispose = await client.remote.$mount(PRESET_MANAGER_REMOTE)
  const remote = client.remote.presetManager
  check('all current endpoints mount on the real Client namespace Service', () => {
    for (const descriptor of PRESET_MANAGER_REMOTE.descriptors) assert.equal(typeof remote[descriptor.method], 'function')
  })
  const api = createApi(remote)
  const received = await api.snapshot()
  check('snapshot completes a Client → Host → Client RPC', () => assert.deepEqual(received, snapshot))
  const removed = await api.remove({ id: 'fixture', acknowledgedDefaultRisk: true })
  check('UI deletion reaches the existing Host remove use case', () => {
    assert.deepEqual(removed, mutation)
    assert.deepEqual(calls.at(-1), ['remove', { id: 'fixture', acknowledgedDefaultRisk: true }])
  })
  await api.remove({ id: 'fixture' })
  check('omitted optional deletion acknowledgement stays omitted', () => {
    assert.deepEqual(calls.at(-1), ['remove', { id: 'fixture' }])
  })
  await api.clone({ sourceId: 'standard', newId: 'copy', name: '中文预设' })
  check('optional positional arguments survive the wire unchanged', () => {
    assert.deepEqual(calls.at(-1), ['clone', { sourceId: 'standard', newId: 'copy', name: '中文预设' }])
  })
  const yaml = await api.renderYaml('fixture')
  check('YAML string results survive the real RPC envelope', () => assert.equal(yaml, '[]\n'))
  const invalid = await remote.detail(42)
  check('invalid wire input is rejected by the real Host codec', () => {
    assert.equal(invalid.ok, false)
    assert.equal(invalid.error.code, 'gateway/input-invalid')
  })

  await dispose()
  check('disposal withdraws the namespace and its descriptors', () => {
    assert.equal(client.get('remote.presetManager'), undefined)
    assert.equal(client.typert.remotes.get('presetManager/snapshot'), undefined)
  })
  const disposeAgain = await client.remote.$mount(PRESET_MANAGER_REMOTE)
  check('the namespace remounts after disposal', () => assert.ok(client.remote.presetManager))
  await disposeAgain()

  host.set('presetManager', undefined)
  let firstUnavailable
  const hostNotReady = new Promise((resolve) => { firstUnavailable = resolve })
  unavailableObserved = firstUnavailable
  let terminal
  const settled = new Promise((resolve) => { terminal = resolve })
  const consumer = await client.plugin({
    name: 'preset-manager-injected-consumer',
    inject: ['remote'],
    apply(ctx) {
      let cancelled = false
      ctx.effect(() => () => { cancelled = true })
      mountRemoteNamespace(ctx, PRESET_MANAGER_REMOTE, (state) => {
        if (state.status !== 'mounting') terminal(state)
      }, () => cancelled)
    },
  })
  let firstTimer
  await Promise.race([hostNotReady, new Promise((_, reject) => { firstTimer = setTimeout(() => reject(new Error('expected initial service-unavailable response')), 3000) })]).finally(() => clearTimeout(firstTimer))
  host.set('presetManager', face)
  unavailableObserved = undefined
  let timeout
  const state = await Promise.race([
    settled,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('plugin namespace mount timed out')), 3000) }),
  ]).finally(() => clearTimeout(timeout))
  check('mount helper reaches ready inside a real dependency-restricted plugin', () => {
    assert.equal(state.status, 'ready', state.error)
  })
  check('Host readiness waits through actual service withdrawal and returns the first valid snapshot', () => {
    assert.equal(state.status, 'ready')
    assert.deepEqual(state.snapshot, snapshot)
  })
  await consumer.dispose()

  const realSnapshot = face.snapshot
  face.snapshot = undefined
  let faultTerminal
  let retryTerminal
  const faultSettled = new Promise((resolve) => { faultTerminal = resolve })
  const retrySettled = new Promise((resolve) => { retryTerminal = resolve })
  const beforeFault = snapshotCalls
  const faultConsumer = await client.plugin({ inject: ['remote'], apply(ctx) {
    let cancelled = false
    ctx.effect(() => () => { cancelled = true })
    mountRemoteNamespace(ctx, PRESET_MANAGER_REMOTE, (mount) => {
      if (mount.status === 'failed') faultTerminal(mount)
      if (mount.status === 'ready') retryTerminal(mount)
    }, () => cancelled)
  } })
  let faultTimer
  const failed = await Promise.race([faultSettled, new Promise((_, reject) => { faultTimer = setTimeout(() => reject(new Error('method errors must fail immediately')), 3000) })]).finally(() => clearTimeout(faultTimer))
  check('method faults are not treated as temporary Host readiness', () => {
    assert.match(failed.error, /gateway\/method-unavailable/)
    assert.equal(snapshotCalls - beforeFault, 1)
    assert.equal(typeof failed.retry, 'function')
  })
  face.snapshot = realSnapshot
  failed.retry()
  let retryTimer
  const recovered = await Promise.race([retrySettled, new Promise((_, reject) => { retryTimer = setTimeout(() => reject(new Error('explicit retry must recover')), 3000) })]).finally(() => clearTimeout(retryTimer))
  check('explicit retry performs a new valid readiness handshake', () => assert.equal(recovered.status, 'ready'))
  await faultConsumer.dispose()
  console.log(`\n${passed}/${passed} real Gateway checks passed (${dist})`)
} finally {
  await client.fiber.dispose()
  await host.fiber.dispose()
}
