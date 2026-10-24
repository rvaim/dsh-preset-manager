/**
 * The Remote contract between the settings page and the Host service.
 *
 * One module, imported by both halves, so an endpoint cannot drift: the Host
 * registers exactly these descriptors and the Client mounts exactly these
 * methods. Everything is typed by the shared wire types.
 */
import type {
  ExportResult,
  HistoryEntry,
  ImportPreview,
  ManagerSnapshot,
  MutationResult,
  PresetDetail,
  PresetDiff,
  PresetDefinition,
  PresetSummary,
  ValidationReport,
} from './types.js'

/** The Typert service key the Host provides and the Client calls. */
export const PRESET_MANAGER_SERVICE = 'presetManager' as const

/** Remote namespace; equals the service key by convention. */
export const PRESET_MANAGER_NAMESPACE = 'presetManager' as const

/** Package name used as the typert contribution identity. */
export const PRESET_MANAGER_PACKAGE = '@rvaim/dsh-preset-manager'

/**
 * The typed Client-facing API. The Client receives an object with these
 * methods; each returns a `RemoteResult`-shaped value at the transport layer
 * and the bare value here.
 */
export interface PresetManagerRemote {
  snapshot(): Promise<ManagerSnapshot>
  detail(id: string): Promise<PresetDetail>
  history(id: string): Promise<readonly HistoryEntry[]>
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
    reason?: string
  }): Promise<MutationResult>

  remove(request: {
    id: string
    /** The user acknowledged the default-preset risk. */
    acknowledgedDefaultRisk?: boolean
  }): Promise<MutationResult>

  restore(request: {
    id: string
    revision: string
    expectedRevision?: string
  }): Promise<MutationResult>

  validate(request: { definition: PresetDefinition }): Promise<ValidationReport>

  diff(request: {
    before: PresetDefinition
    after: PresetDefinition
  }): Promise<PresetDiff>

  /** Render YAML for the advanced editor, preserving `!!js` nodes. */
  renderYaml(request: { definition: PresetDefinition }): Promise<string>

  /** Parse YAML from the advanced editor back into a definition. */
  parseYaml(request: {
    id: string
    yaml: string
    name?: string
    description?: string
  }): Promise<{ definition: PresetDefinition; validation: ValidationReport }>

  exportPreset(request: { id: string }): Promise<ExportResult>

  previewImport(request: {
    text: string
    /** How the text arrived, so the Host can apply the right parser. */
    source: 'share' | 'yaml-file'
    id?: string
  }): Promise<ImportPreview>

  importPreset(request: {
    text: string
    source: 'share' | 'yaml-file'
    /** Final id after conflict resolution. */
    id?: string
    name?: string
    acknowledgedRisks: boolean
  }): Promise<MutationResult>

  /** Delete all plugin-owned data; requires explicit confirmation text. */
  purge(request: { confirmation: string }): Promise<MutationResult>

  /** Read the built-in presets only, for the clone source picker. */
  cloneSources(): Promise<readonly PresetSummary[]>
}
