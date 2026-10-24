/**
 * Import preview/confirmation state machine.
 *
 * These tests drive only the public store API with controllable Host calls.
 * The properties under test are approval identity, request ordering, and the
 * separation between preview activity and the page-wide busy flag.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetManagerApi } from '../../client/api/remote-api.js'
import { PresetManagerStore } from '../../client/state/store.js'
import type {
  ImportPreview,
  ManagerSnapshot,
  MutationResult,
  PresetDefinition,
  ValidationIssue,
} from '../../shared/types.js'

type ImportSource = 'share' | 'yaml-file'

interface PreviewRequest {
  readonly text: string
  readonly source: ImportSource
  readonly id?: string
}

interface ConfirmRequest extends PreviewRequest {
  readonly name?: string
  readonly acknowledgedRisks: boolean
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

function definition(id: string): PresetDefinition {
  return {
    id,
    name: `Preset ${id}`,
    plugins: [
      {
        name: '@deepseek-ai/dsh-persona',
        config: { prefix: 'preview prefix' },
      },
    ],
  }
}

function preview(id: string, conflict = false): ImportPreview {
  const preset = definition(id)
  const errors: ValidationIssue[] = conflict
    ? [{ code: 'preset.conflict', message: `ID ${id} is taken`, path: 'id' }]
    : []
  const idConflict: ImportPreview['idConflict'] = conflict
    ? { conflict: true, existingOwnership: 'managed', suggestedId: `${id}-copy` }
    : { conflict: false }
  return {
    document: {
      kind: 'dsh-agent-preset-share',
      formatVersion: 1,
      preset,
    },
    definition: preset,
    validation: {
      ok: !conflict,
      errors,
      warnings: [],
    },
    risks: [],
    idConflict,
    yaml: 'plugins: []\n',
  }
}

class FakeHostApi {
  readonly snapshotValue: ManagerSnapshot = {
    phase: 'ready',
    presets: [],
    dataDirectory: '/tmp/dshpm-import-state-test',
    diagnostics: [],
    busy: false,
  }

  readonly previewCalls: PreviewRequest[] = []
  readonly importCalls: ConfirmRequest[] = []
  snapshotCalls = 0
  private readonly previewResponses: Deferred<ImportPreview>[] = []

  queuePreview(): Deferred<ImportPreview> {
    const response = deferred<ImportPreview>()
    this.previewResponses.push(response)
    return response
  }

  snapshot = async (): Promise<ManagerSnapshot> => {
    this.snapshotCalls += 1
    return this.snapshotValue
  }

  previewImport = (request: PreviewRequest): Promise<ImportPreview> => {
    this.previewCalls.push({
      text: request.text,
      source: request.source,
      ...(request.id === undefined ? {} : { id: request.id }),
    })
    const response = this.previewResponses.shift()
    return response === undefined
      ? Promise.reject(new Error('Unexpected previewImport call'))
      : response.promise
  }

  importPreset = async (request: ConfirmRequest): Promise<MutationResult> => {
    this.importCalls.push({ ...request })
    return { ok: true, applied: true, errors: [], warnings: [] }
  }
}

async function loadedHarness(): Promise<{
  readonly fake: FakeHostApi
  readonly store: PresetManagerStore
  readonly snapshot: ManagerSnapshot
}> {
  const fake = new FakeHostApi()
  const api = fake as unknown as PresetManagerApi
  const store = new PresetManagerStore(() => api)
  await store.load()
  assert.equal(store.getState().snapshot, fake.snapshotValue)
  assert.equal(store.getState().previewingImport, false)
  return { fake, store, snapshot: fake.snapshotValue }
}

function assertIdleImportState(
  store: PresetManagerStore,
  snapshot: ManagerSnapshot,
): void {
  assert.equal(store.getState().previewingImport, false)
  assert.equal(store.getState().busy, false)
  assert.equal(store.getState().snapshot, snapshot)
}

describe('import preview state', () => {
  it('clearPreview clears an approval and a failure notice', async () => {
    const { fake, store, snapshot } = await loadedHarness()

    const approvedResponse = fake.queuePreview()
    const previewing = store.previewImport('first source', 'share')
    approvedResponse.resolve(preview('first'))
    assert.equal(await previewing, true)
    assert.equal(store.getState().preview?.definition.id, 'first')

    store.clearPreview()
    assert.equal(store.getState().preview, undefined)
    assert.equal(store.getState().notice, undefined)
    assertIdleImportState(store, snapshot)

    const failedResponse = fake.queuePreview()
    const failed = store.previewImport('bad source', 'share')
    failedResponse.reject(new Error('invalid source'))
    assert.equal(await failed, false)
    assert.ok(store.getState().notice)

    store.clearPreview()
    assert.equal(store.getState().preview, undefined)
    assert.equal(store.getState().notice, undefined)
    assertIdleImportState(store, snapshot)
    assert.equal(fake.snapshotCalls, 1)
  })

  it('clearPreview cancels both late success and late failure writebacks', async () => {
    const { fake, store, snapshot } = await loadedHarness()

    const lateSuccess = fake.queuePreview()
    const successPending = store.previewImport('late success', 'share')
    assert.equal(store.getState().previewingImport, true)
    assert.equal(store.getState().busy, false)

    store.clearPreview()
    assert.equal(store.getState().previewingImport, false)
    lateSuccess.resolve(preview('late'))
    await successPending
    assert.equal(store.getState().preview, undefined)
    assert.equal(store.getState().notice, undefined)

    const lateFailure = fake.queuePreview()
    const failurePending = store.previewImport('late failure', 'share')
    store.clearPreview()
    lateFailure.reject(new Error('late preview failure'))
    await failurePending
    assert.equal(store.getState().preview, undefined)
    assert.equal(store.getState().notice, undefined)
    assertIdleImportState(store, snapshot)
    assert.equal(fake.snapshotCalls, 1)
  })

  it('keeps only the latest request when preview responses arrive out of order', async () => {
    const { fake, store, snapshot } = await loadedHarness()
    const first = fake.queuePreview()
    const second = fake.queuePreview()
    const third = fake.queuePreview()
    const latest = fake.queuePreview()

    const firstPending = store.previewImport('source', 'share', 'taken-1')
    const secondPending = store.previewImport('source', 'share', 'taken-2')
    const thirdPending = store.previewImport('source', 'share', 'taken-3')
    const latestPending = store.previewImport('source', 'share', 'free')
    assert.equal(store.getState().previewingImport, true)
    assert.equal(store.getState().busy, false)

    // A stale success that arrives while the latest request is still running
    // must not become an approval.
    second.resolve(preview('stale-early'))
    await secondPending
    assert.equal(store.getState().preview, undefined)
    assert.equal(store.getState().previewingImport, true)

    latest.resolve(preview('free'))
    await latestPending
    assert.equal(store.getState().preview?.definition.id, 'free')
    assert.equal(store.getState().preview?.idConflict.conflict, false)

    // Neither an older success nor an older failure may replace the newest
    // approval after it has settled.
    third.reject(new Error('stale failure'))
    await thirdPending
    first.resolve(preview('taken-1', true))
    await firstPending

    assert.equal(store.getState().preview?.definition.id, 'free')
    assert.equal(store.getState().notice, undefined)
    assertIdleImportState(store, snapshot)
    assert.equal(fake.importCalls.length, 0)
    assert.equal(fake.snapshotCalls, 1)
  })

  it('rejects stale text and ID approvals until the changed source is previewed again', async () => {
    const { fake, store, snapshot } = await loadedHarness()
    const originalText = 'source: original'
    const changedText = 'source: changed'

    const approvedResponse = fake.queuePreview()
    const previewing = store.previewImport(originalText, 'share', 'approved')
    approvedResponse.resolve(preview('approved'))
    assert.equal(await previewing, true)

    const changedContent = await store.confirmImport({
      text: changedText,
      source: 'share',
      id: 'approved',
      acknowledgedRisks: true,
    })
    assert.equal(changedContent, false)

    const changedId = await store.confirmImport({
      text: originalText,
      source: 'share',
      id: 'other',
      acknowledgedRisks: true,
    })
    assert.equal(changedId, false)
    assert.equal(fake.importCalls.length, 0)
    assertIdleImportState(store, snapshot)

    // The import panel clears the old approval when its source changes.
    store.clearPreview()
    const cleared = await store.confirmImport({
      text: originalText,
      source: 'share',
      id: 'approved',
      acknowledgedRisks: true,
    })
    assert.equal(cleared, false)
    assert.equal(fake.importCalls.length, 0)
    assert.equal(fake.snapshotCalls, 1)

    const freshResponse = fake.queuePreview()
    const freshPreview = store.previewImport(changedText, 'share', 'approved')
    freshResponse.resolve(preview('approved'))
    assert.equal(await freshPreview, true)

    const accepted = await store.confirmImport({
      text: changedText,
      source: 'share',
      id: 'approved',
      acknowledgedRisks: true,
    })
    assert.equal(accepted, true)
    assert.equal(fake.importCalls.length, 1)
    assert.equal(fake.importCalls[0]?.text, changedText)
    assert.equal(fake.importCalls[0]?.id, 'approved')
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().snapshot, snapshot)
  })

  it('rejects confirmation before approval, while previewing, and after a failed preview', async () => {
    const { fake, store, snapshot } = await loadedHarness()
    const options = {
      text: 'unapproved source',
      source: 'share' as const,
      id: 'new-preset',
      acknowledgedRisks: true,
    }

    assert.equal(await store.confirmImport(options), false)
    assert.equal(fake.importCalls.length, 0)

    const pendingResponse = fake.queuePreview()
    const pendingPreview = store.previewImport(options.text, options.source, options.id)
    assert.equal(store.getState().previewingImport, true)
    assert.equal(store.getState().busy, false)

    assert.equal(await store.confirmImport(options), false)
    assert.equal(store.getState().previewingImport, true)
    assert.equal(store.getState().busy, false)

    pendingResponse.reject(new Error('preview failed'))
    assert.equal(await pendingPreview, false)
    assert.ok(store.getState().notice)
    assert.equal(store.getState().preview, undefined)

    assert.equal(await store.confirmImport(options), false)
    assert.equal(fake.importCalls.length, 0)
    assertIdleImportState(store, snapshot)
    assert.equal(fake.snapshotCalls, 1)
  })

  it('forwards an ID override so a conflicted preview can become valid', async () => {
    const { fake, store, snapshot } = await loadedHarness()

    const conflictResponse = fake.queuePreview()
    const conflictPending = store.previewImport('source', 'share', 'taken')
    conflictResponse.resolve(preview('taken', true))
    await conflictPending
    assert.equal(store.getState().preview?.idConflict.conflict, true)
    assert.equal(store.getState().preview?.validation.ok, false)

    const conflicted = await store.confirmImport({
      text: 'source',
      source: 'share',
      id: 'taken',
      acknowledgedRisks: true,
    })
    assert.equal(conflicted, false)
    assert.equal(fake.importCalls.length, 0)

    const validResponse = fake.queuePreview()
    const validPending = store.previewImport('source', 'share', 'free')
    validResponse.resolve(preview('free'))
    assert.equal(await validPending, true)

    assert.deepEqual(
      fake.previewCalls.map((request) => request.id),
      ['taken', 'free'],
    )
    assert.equal(store.getState().preview?.definition.id, 'free')
    assert.equal(store.getState().preview?.idConflict.conflict, false)
    assert.equal(store.getState().preview?.validation.ok, true)

    const accepted = await store.confirmImport({
      text: 'source',
      source: 'share',
      id: 'free',
      acknowledgedRisks: true,
    })
    assert.equal(accepted, true)
    assert.equal(fake.importCalls[0]?.id, 'free')
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().snapshot, snapshot)
  })

  it('accepts the preview definition ID when the original preview had no override', async () => {
    const { fake, store, snapshot } = await loadedHarness()
    const text = 'source: document-id'

    const response = fake.queuePreview()
    const pending = store.previewImport(text, 'share')
    response.resolve(preview('document-id'))
    assert.equal(await pending, true)
    assert.equal(fake.previewCalls[0]?.id, undefined)

    const accepted = await store.confirmImport({
      text,
      source: 'share',
      id: store.getState().preview?.definition.id,
      acknowledgedRisks: true,
    })
    assert.equal(accepted, true)
    assert.equal(fake.importCalls.length, 1)
    assert.equal(fake.importCalls[0]?.id, 'document-id')
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().snapshot, snapshot)
  })

  it('allows a failed preview to be retried and approved', async () => {
    const { fake, store, snapshot } = await loadedHarness()

    const failedResponse = fake.queuePreview()
    const failedPending = store.previewImport('retry source', 'share', 'retry-id')
    assert.equal(store.getState().previewingImport, true)
    assert.equal(store.getState().busy, false)
    failedResponse.reject(new Error('YAML is invalid'))
    assert.equal(await failedPending, false)
    assert.ok(store.getState().notice)
    assert.equal(store.getState().preview, undefined)
    assertIdleImportState(store, snapshot)
    assert.equal(fake.snapshotCalls, 1)

    store.clearPreview()
    assert.equal(store.getState().notice, undefined)

    const retryResponse = fake.queuePreview()
    const retryPending = store.previewImport('retry source', 'share', 'retry-id')
    retryResponse.resolve(preview('retry-id'))
    assert.equal(await retryPending, true)
    assert.equal(store.getState().preview?.definition.id, 'retry-id')
    assert.equal(store.getState().notice, undefined)
    assertIdleImportState(store, snapshot)

    const accepted = await store.confirmImport({
      text: 'retry source',
      source: 'share',
      id: 'retry-id',
      acknowledgedRisks: true,
    })
    assert.equal(accepted, true)
    assert.equal(fake.importCalls[0]?.id, 'retry-id')
    assert.equal(store.getState().busy, false)
    assert.equal(store.getState().snapshot, snapshot)
  })
})
