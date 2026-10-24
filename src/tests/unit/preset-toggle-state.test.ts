/**
 * Preset enablement state through the public store API.
 *
 * Every fixture enters through a ready mount, exactly like the Client does
 * after Remote admission. The tests pin service calls and externally visible
 * state rather than reaching into the store's private snapshot or busy fields.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  PresetManagerRemoteService,
} from '../../client/api/remote-api.js'
import type { MountState } from '../../client/state/mount-remote.js'
import { PresetManagerStore } from '../../client/state/store.js'
import type {
  ManagerSnapshot,
  MutationResult,
  PresetSummary,
  ValidationIssue,
} from '../../shared/types.js'

type ToggleSummary = PresetSummary & {
  readonly canToggle?: boolean
  readonly enabled?: boolean
}

type RemoteResponse<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
        readonly details?: unknown
      }
    }

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function preset(id: string, enabled: boolean): ToggleSummary {
  return {
    id,
    ownership: 'managed',
    registration: 'registered',
    isDefault: false,
    health: 'healthy',
    pluginCount: 1,
    canToggle: true,
    enabled,
  }
}

function snapshot(presets: readonly ToggleSummary[]): ManagerSnapshot {
  return {
    phase: 'ready',
    presets,
    dataDirectory: '/tmp/dshpm-toggle-test',
    diagnostics: [],
    busy: false,
  }
}

function enabledOf(value: ManagerSnapshot, id: string): boolean | undefined {
  return (value.presets.find((row) => row.id === id) as ToggleSummary | undefined)?.enabled
}

function issue(code: string, message: string): ValidationIssue {
  return { code, message }
}

function applied(): MutationResult {
  return { ok: true, applied: true, errors: [], warnings: [] }
}

class FakeRemote {
  readonly enabledCalls: { id: string; enabled: boolean }[] = []
  snapshotCalls = 0
  private readonly enabledResponses: Deferred<RemoteResponse<MutationResult>>[] = []
  private readonly snapshotResponses: Deferred<RemoteResponse<ManagerSnapshot>>[] = []

  queueEnabled(): Deferred<RemoteResponse<MutationResult>> {
    const response = deferred<RemoteResponse<MutationResult>>()
    this.enabledResponses.push(response)
    return response
  }

  queueSnapshot(): Deferred<RemoteResponse<ManagerSnapshot>> {
    const response = deferred<RemoteResponse<ManagerSnapshot>>()
    this.snapshotResponses.push(response)
    return response
  }

  snapshot = (): Promise<RemoteResponse<ManagerSnapshot>> => {
    this.snapshotCalls += 1
    const response = this.snapshotResponses.shift()
    return response === undefined
      ? Promise.reject(new Error('Unexpected snapshot call'))
      : response.promise
  }

  setEnabled = (id: string, enabled: boolean): Promise<RemoteResponse<MutationResult>> => {
    this.enabledCalls.push({ id, enabled })
    const response = this.enabledResponses.shift()
    return response === undefined
      ? Promise.reject(new Error('Unexpected setEnabled call'))
      : response.promise
  }
}

/**
 * This cast is confined to the transport fixture. Every exercised method has
 * the exact RemoteResult signature; the other namespace methods are unused.
 */
function service(remote: FakeRemote): PresetManagerRemoteService {
  return remote as unknown as PresetManagerRemoteService
}

function attach(remote: FakeRemote, value: ManagerSnapshot): PresetManagerStore {
  const store = new PresetManagerStore()
  const mount: MountState = { status: 'ready', service: service(remote), snapshot: value }
  store.attachMount(mount)
  assert.equal(store.getState().mount.status, 'ready')
  assert.equal(store.getState().snapshot, value)
  assert.equal(store.getState().busy, false)
  return store
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('preset enablement store state', () => {
  it('calls setEnabled, refreshes, and publishes the Host-owned enabled value', async () => {
    const before = snapshot([preset('mode', false)])
    const after = snapshot([preset('mode', true)])
    const remote = new FakeRemote()
    const store = attach(remote, before)
    remote.queueEnabled().resolve({ ok: true, value: applied() })
    remote.queueSnapshot().resolve({ ok: true, value: after })

    assert.equal(await store.setEnabled('mode', true), true)

    assert.deepEqual(remote.enabledCalls, [{ id: 'mode', enabled: true }])
    assert.equal(remote.snapshotCalls, 1)
    assert.equal(store.getState().snapshot, after)
    assert.equal(enabledOf(store.getState().snapshot!, 'mode'), true)
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().togglingId, undefined)
    assert.equal(store.getState().notice, undefined)
  })

  it('rejects a concurrent toggle without changing the in-flight owner', async () => {
    const before = snapshot([preset('first', false), preset('second', true)])
    const after = snapshot([preset('first', true), preset('second', true)])
    const remote = new FakeRemote()
    const store = attach(remote, before)
    const response = remote.queueEnabled()

    const first = store.setEnabled('first', true)
    assert.equal(store.getState().busy, true)
    assert.equal(store.getState().togglingId, 'first')
    assert.equal(await store.setEnabled('second', false), false)
    assert.deepEqual(remote.enabledCalls, [{ id: 'first', enabled: true }])
    assert.equal(store.getState().busy, true)
    assert.equal(store.getState().togglingId, 'first')

    remote.queueSnapshot().resolve({ ok: true, value: after })
    response.resolve({ ok: true, value: applied() })
    assert.equal(await first, true)
    assert.equal(store.getState().snapshot, after)
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().togglingId, undefined)
  })

  it('keeps the snapshot and attributes a rejected mutation notice to its row', async () => {
    const before = snapshot([preset('managed-mode', true)])
    const remote = new FakeRemote()
    const store = attach(remote, before)
    remote.queueEnabled().resolve({
      ok: true,
      value: {
        ok: true,
        applied: false,
        errors: [issue('preset.disable-refused', 'This preset cannot be disabled')],
        warnings: [],
      },
    })

    assert.equal(await store.setEnabled('managed-mode', false), false)

    const state = store.getState()
    assert.equal(state.snapshot, before)
    assert.equal(remote.snapshotCalls, 0)
    assert.equal(state.busy, false)
    assert.equal(state.togglingId, undefined)
    assert.deepEqual(state.notice?.localAction, { kind: 'toggle', id: 'managed-mode' })
    assert.equal(state.notice?.level, 'error')
    assert.match(state.notice?.message ?? '', /cannot be disabled/)
  })

  it('turns a transport failure into the same row-local error state', async () => {
    const before = snapshot([preset('remote-mode', true)])
    const remote = new FakeRemote()
    const store = attach(remote, before)
    remote.queueEnabled().resolve({
      ok: false,
      error: { code: 'gateway/offline', message: 'Host became unavailable' },
    })

    assert.equal(await store.setEnabled('remote-mode', false), false)

    const state = store.getState()
    assert.equal(state.snapshot, before)
    assert.equal(remote.snapshotCalls, 0)
    assert.equal(state.busy, false)
    assert.equal(state.togglingId, undefined)
    assert.deepEqual(state.notice?.localAction, { kind: 'toggle', id: 'remote-mode' })
    assert.equal(state.notice?.level, 'error')
    assert.equal(state.notice?.message, 'Host became unavailable')
  })

  it('ignores a prior binding response after a new ready mount replaces it', async () => {
    const oldSnapshot = snapshot([preset('mode', false)])
    const newSnapshot = snapshot([preset('mode', true)])
    const oldRemote = new FakeRemote()
    const newRemote = new FakeRemote()
    const store = attach(oldRemote, oldSnapshot)
    const oldResponse = oldRemote.queueEnabled()

    const pending = store.setEnabled('mode', true)
    assert.equal(store.getState().busy, true)
    store.attachMount({ status: 'ready', service: service(newRemote), snapshot: newSnapshot })
    assert.equal(store.getState().snapshot, newSnapshot)
    assert.equal(store.getState().busy, false)

    oldResponse.resolve({ ok: true, value: applied() })
    assert.equal(await pending, false)
    assert.equal(store.getState().snapshot, newSnapshot)
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().togglingId, undefined)
    assert.equal(store.getState().notice, undefined)
    assert.equal(oldRemote.snapshotCalls, 0)
    assert.equal(newRemote.snapshotCalls, 0)
  })

  it('does not let a prior binding refresh overwrite the replacement snapshot', async () => {
    const initial = snapshot([preset('mode', false)])
    const late = snapshot([preset('mode', false)])
    const replacement = snapshot([preset('mode', true)])
    const oldRemote = new FakeRemote()
    const newRemote = new FakeRemote()
    const store = attach(oldRemote, initial)
    const enabledResponse = oldRemote.queueEnabled()
    const oldSnapshotResponse = oldRemote.queueSnapshot()

    const pending = store.setEnabled('mode', true)
    enabledResponse.resolve({ ok: true, value: applied() })
    await settleMicrotasks()
    assert.equal(oldRemote.snapshotCalls, 1)
    assert.equal(store.getState().busy, true)
    assert.equal(store.getState().togglingId, 'mode')

    store.attachMount({ status: 'ready', service: service(newRemote), snapshot: replacement })
    oldSnapshotResponse.resolve({ ok: true, value: late })
    assert.equal(await pending, false)
    assert.equal(store.getState().snapshot, replacement)
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().togglingId, undefined)
    assert.equal(store.getState().notice, undefined)
    assert.equal(newRemote.snapshotCalls, 0)
  })

  it('keeps success and a row-local warning when the Host refresh fails', async () => {
    const before = snapshot([preset('mode', false)])
    const remote = new FakeRemote()
    const store = attach(remote, before)
    remote.queueEnabled().resolve({ ok: true, value: applied() })
    remote.queueSnapshot().resolve({
      ok: false,
      error: { code: 'gateway/offline', message: 'Snapshot unavailable' },
    })

    assert.equal(await store.setEnabled('mode', true), true)

    const state = store.getState()
    assert.equal(remote.snapshotCalls, 1)
    assert.equal(state.snapshot, before)
    assert.equal(state.busy, false)
    assert.equal(state.togglingId, undefined)
    assert.deepEqual(state.notice?.localAction, { kind: 'toggle', id: 'mode' })
    assert.equal(state.notice?.level, 'warning')
    assert.match(state.notice?.message ?? '', /列表刷新失败/)
  })
})
