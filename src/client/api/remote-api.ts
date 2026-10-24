/**
 * Client-side access to the Host service.
 *
 * The page never touches the file system or the DSH registry directly: every
 * operation is one Remote call, and every failure arrives as the stable
 * `{ code, message, details }` shape the gateway encodes. This module owns that
 * translation so no component has to know about the transport.
 */
import type {
  ExportResult,
  HistoryEntry,
  ImportPreview,
  ManagerFailure,
  ManagerSnapshot,
  MutationResult,
  PresetDefinition,
  PresetDetail,
  PresetDiff,
  PresetSummary,
  ValidationReport,
} from '../../shared/types.js'
import type { PresetManagerRemote } from '../../shared/contracts.js'

/** The `unknown` shape a Remote method resolves to at the transport layer. */
type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: Omit<ManagerFailure, 'details'> & { readonly details?: unknown } }

/**
 * The namespace service the gateway installs.
 *
 * Each method returns a `RemoteResult`, so the caller decides whether to throw.
 * Keeping that decision here — in one `unwrap` — is what gives every component
 * the same error behaviour.
 */
export interface PresetManagerRemoteService {
  snapshot(): Promise<RemoteResult<ManagerSnapshot>>
  cloneSources(): Promise<RemoteResult<readonly PresetSummary[]>>
  detail(id: string): Promise<RemoteResult<PresetDetail>>
  history(id: string): Promise<RemoteResult<HistoryEntry[]>>
  setEnabled(id: string, enabled: boolean): Promise<RemoteResult<MutationResult>>
  clone(
    sourceId: string,
    newId?: string,
    name?: string,
    description?: string,
  ): Promise<RemoteResult<MutationResult>>
  save(
    definition: PresetDefinition,
    expectedRevision?: string,
  ): Promise<RemoteResult<MutationResult>>
  deletePreset(
    id: string,
    acknowledgedDefaultRisk?: boolean,
  ): Promise<RemoteResult<MutationResult>>
  restore(
    id: string,
    revision: string,
    expectedRevision?: string,
  ): Promise<RemoteResult<MutationResult>>
  validate(definition: PresetDefinition): Promise<RemoteResult<ValidationReport>>
  diff(
    before: PresetDefinition,
    after: PresetDefinition,
  ): Promise<RemoteResult<PresetDiff>>
  renderYaml(id: string): Promise<RemoteResult<string>>
  exportPreset(id: string): Promise<RemoteResult<ExportResult>>
  parseYaml(
    id: string,
    yaml: string,
  ): Promise<RemoteResult<{ definition: PresetDefinition; validation: ValidationReport }>>
  shareText(
    id: string,
  ): Promise<RemoteResult<{ yaml: string; risks: readonly { code: string; message: string }[] }>>
  previewImport(text: string, source: string, id?: string): Promise<RemoteResult<ImportPreview>>
  importPreset(
    text: string,
    source: string,
    id?: string,
    name?: string,
    acknowledgedRisks?: boolean,
  ): Promise<RemoteResult<MutationResult>>
  purge(confirmation: string): Promise<RemoteResult<MutationResult>>
}

/** A failure surfaced to the UI, carrying the Host's code for localization. */
export class RemoteInvocationError extends Error {
  readonly code: string
  readonly details: readonly { code: string; message: string; path?: string; detail?: string }[]

  constructor(failure: Omit<ManagerFailure, 'details'> & { readonly details?: unknown }) {
    super(failure.message)
    this.name = 'RemoteInvocationError'
    this.code = failure.code
    // Gateway failures carry a details object (endpoint, field, etc.), while
    // domain diagnostics may be an issue list. Never pass an object to .map().
    this.details = Array.isArray(failure.details)
      ? failure.details.filter((issue): issue is typeof this.details[number] =>
          typeof issue === 'object' && issue !== null &&
          typeof issue.code === 'string' && typeof issue.message === 'string',
        )
      : []
  }
}

/** Unwrap one result, turning a failure branch into a thrown error. */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new RemoteInvocationError(result.error)
}

/**
 * The typed API the page consumes.
 *
 * Every method throws {@link RemoteInvocationError} on failure, so a component
 * catches one shape and reads `code` to choose its message.
 */
export interface PresetManagerApi {
  snapshot(): Promise<ManagerSnapshot>
  cloneSources(): Promise<readonly PresetSummary[]>
  detail(id: string): Promise<PresetDetail>
  history(id: string): Promise<HistoryEntry[]>
  setEnabled(request: { id: string; enabled: boolean }): Promise<MutationResult>
  clone(request: {
    sourceId: string
    newId?: string
    name?: string
    description?: string
  }): Promise<MutationResult>
  save(request: {
    definition: PresetDefinition
    expectedRevision?: string
  }): Promise<MutationResult>
  remove(request: { id: string; acknowledgedDefaultRisk?: boolean }): Promise<MutationResult>
  restore(request: {
    id: string
    revision: string
    expectedRevision?: string
  }): Promise<MutationResult>
  validate(definition: PresetDefinition): Promise<ValidationReport>
  diff(before: PresetDefinition, after: PresetDefinition): Promise<PresetDiff>
  renderYaml(id: string): Promise<string>
  exportPreset(id: string): Promise<ExportResult>
  parseYaml(
    id: string,
    yaml: string,
  ): Promise<{ definition: PresetDefinition; validation: ValidationReport }>
  shareText(id: string): Promise<{ yaml: string; risks: readonly { code: string; message: string }[] }>
  previewImport(request: { text: string; source: 'share' | 'yaml-file'; id?: string }): Promise<ImportPreview>
  importPreset(request: {
    text: string
    source: 'share' | 'yaml-file'
    id?: string
    name?: string
    acknowledgedRisks: boolean
  }): Promise<MutationResult>
  purge(confirmation: string): Promise<MutationResult>
}

/** Adapt the gateway's namespace service to the page's throwing API. */
export function createApi(remote: PresetManagerRemoteService): PresetManagerApi {
  return {
    snapshot: () => remote.snapshot().then(unwrap),
    cloneSources: () => remote.cloneSources().then(unwrap),
    detail: (id) => remote.detail(id).then(unwrap),
    history: (id) => remote.history(id).then(unwrap),
    setEnabled: (request) => remote.setEnabled(request.id, request.enabled).then(unwrap),

    clone: (request) =>
      remote
        .clone(request.sourceId, request.newId, request.name, request.description)
        .then(unwrap),
    save: (request) => remote.save(request.definition, request.expectedRevision).then(unwrap),
    remove: (request) =>
      remote.deletePreset(request.id, request.acknowledgedDefaultRisk).then(unwrap),
    restore: (request) =>
      remote.restore(request.id, request.revision, request.expectedRevision).then(unwrap),

    validate: (definition) => remote.validate(definition).then(unwrap),
    diff: (before, after) => remote.diff(before, after).then(unwrap),
    renderYaml: (id) => remote.renderYaml(id).then(unwrap),
    exportPreset: (id) => remote.exportPreset(id).then(unwrap),
    parseYaml: (id, yaml) => remote.parseYaml(id, yaml).then(unwrap),
    shareText: (id) => remote.shareText(id).then(unwrap),

    previewImport: (request) =>
      remote.previewImport(request.text, request.source, request.id).then(unwrap),
    importPreset: (request) =>
      remote
        .importPreset(
          request.text,
          request.source,
          request.id,
          request.name,
          request.acknowledgedRisks,
        )
        .then(unwrap),

    purge: (confirmation) => remote.purge(confirmation).then(unwrap),
  }
}

/** Re-exported so the contract stays visible from the page's perspective. */
export type { PresetManagerRemote }
