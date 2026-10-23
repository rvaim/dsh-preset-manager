/**
 * The Remote surface of the preset manager.
 *
 * DSH's Client reaches a Host service through a Typert Remote descriptor set:
 * the Host registers the descriptors it invokes, and the Client mounts the same
 * descriptor set to obtain a typed proxy. Both halves therefore read this one
 * module, so an endpoint cannot exist on one side only.
 *
 * What belongs here is exactly parameters, admission and error projection. The
 * business logic stays in {@link PresetManagerService}: every method is a thin
 * pass-through that converts a thrown domain failure into the stable
 * `{ code, message, details }` shape the Client renders.
 */
import type {
  ExportResult,
  HistoryEntry,
  ImportPreview,
  ManagerSnapshot,
  MutationResult,
  PresetDefinition,
  PresetDetail,
  PresetDiff,
  PresetSummary,
  ValidationIssue,
  ValidationReport,
} from '../../shared/types.js'
import type { PresetManagerService } from '../application/preset-manager-service.js'
import type { ImportSource } from '../../sharing/preset-importer.js'
import { PRESET_MANAGER_NAMESPACE, PRESET_MANAGER_SERVICE } from './descriptors.js'

/**
 * The Host object the typert invocation dispatcher reflects over.
 *
 * Method names are the namespace members: the descriptor `presetManager/snapshot`
 * resolves to `this.snapshot`. Every method is awaited by the dispatcher, so an
 * async method and a sync one are interchangeable there.
 */
export interface PresetManagerRemoteFace {
  snapshot(): Promise<ManagerSnapshot>
  cloneSources(): Promise<readonly PresetSummary[]>
  detail(id: string): Promise<PresetDetail>
  history(id: string): Promise<HistoryEntry[]>

  clone(
    sourceId: string,
    newId: string | undefined,
    name: string | undefined,
    description: string | undefined,
  ): Promise<MutationResult>

  save(definition: PresetDefinition, expectedRevision: string | undefined): Promise<MutationResult>

  remove(id: string, acknowledgedDefaultRisk: boolean | undefined): Promise<MutationResult>

  restore(
    id: string,
    revision: string,
    expectedRevision: string | undefined,
  ): Promise<MutationResult>

  validate(definition: PresetDefinition): Promise<ValidationReport>
  diff(before: PresetDefinition, after: PresetDefinition): Promise<PresetDiff>
  renderYaml(id: string): Promise<string>
  parseYaml(
    id: string,
    yaml: string,
  ): Promise<{ definition: PresetDefinition; validation: ValidationReport }>
  exportPreset(id: string): Promise<ExportResult>
  shareText(id: string): Promise<{ yaml: string; risks: readonly ValidationIssue[] }>
  previewImport(text: string, source: string): Promise<ImportPreview>
  importPreset(
    text: string,
    source: string,
    id: string | undefined,
    name: string | undefined,
    acknowledgedRisks: boolean,
  ): Promise<MutationResult>
  purge(confirmation: string): Promise<MutationResult>
}

/**
 * Build the Host face over the application service.
 *
 * `typertRemote` marks the object as a Remote service handle so the gateway can
 * resolve it from the service registry by key, exactly as it does for DSH's own
 * services.
 */
export function createRemoteFace(service: PresetManagerService): PresetManagerRemoteFace & {
  readonly typertRemote: {
    readonly service: PresetManagerRemoteFace
    readonly serviceKey: string
    readonly namespace: string
  }
} {
  const face: PresetManagerRemoteFace = {
    snapshot: () => service.snapshot(),
    cloneSources: () => service.cloneSources(),
    detail: (id) => service.detail(id),
    history: (id) => service.history(id),

    clone: (sourceId, newId, name, description) =>
      service.clone({
        sourceId,
        newId,
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description }),
      }),

    save: (definition, expectedRevision) =>
      service.save({
        definition,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      }),

    remove: (id, acknowledgedDefaultRisk) =>
      service.remove({
        id,
        ...(acknowledgedDefaultRisk === undefined ? {} : { acknowledgedDefaultRisk }),
      }),

    restore: (id, revision, expectedRevision) =>
      service.restore({
        id,
        revision,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      }),

    validate: (definition) => service.validate(definition),
    diff: (before, after) => service.diff(before, after),
    renderYaml: (id) => service.renderYaml(id),
    parseYaml: (id, yaml) => service.parseYaml({ id, yaml }),
    exportPreset: (id) => service.exportPreset(id),
    shareText: (id) => service.shareText(id),

    previewImport: (text, source) =>
      service.previewImport({ text, source: asImportSource(source) }),

    importPreset: (text, source, id, name, acknowledgedRisks) =>
      service.importPreset({
        text,
        source: asImportSource(source),
        ...(id === undefined ? {} : { id }),
        ...(name === undefined ? {} : { name }),
        acknowledgedRisks,
      }),

    purge: (confirmation) => service.purge(confirmation),
  }

  /**
   * The provided object must be the same object its binding names.
   *
   * The gateway validates a Remote binding with `typertRemote.service ===
   * original`, where `original` is the object resolved from the service key.
   * Spreading the face into a second object and pointing `service` at the first
   * one fails that identity check, and every call then dies with
   * `gateway/binding-invalid` — which surfaces in the UI as "Host interface not
   * ready". Attaching the binding to the object that is actually provided keeps
   * the identity true by construction.
   */
  const provided = face as PresetManagerRemoteFace & {
    typertRemote: {
      readonly service: PresetManagerRemoteFace
      readonly serviceKey: string
      readonly namespace: string
    }
  }
  Object.defineProperty(provided, 'typertRemote', {
    value: Object.freeze({
      service: provided,
      serviceKey: PRESET_MANAGER_SERVICE,
      namespace: PRESET_MANAGER_NAMESPACE,
    }),
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return provided
}

/** Narrow an untrusted wire string to the import source union. */
function asImportSource(value: string): ImportSource {
  return value === 'yaml-file' ? 'yaml-file' : 'share'
}
