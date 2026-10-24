/**
 * Wire-safe shared types for dsh-preset-manager.
 *
 * Everything here crosses the Client/Host Remote boundary, so it must stay
 * lossless JSON: no Date, Map, undefined-valued required fields, or class
 * instances. Server-side rich values are projected into these shapes.
 */

/** A `!!js` expression, preserved verbatim from the Cordis YAML dialect. */
export interface LoaderExpression {
  readonly __jsExpr: string
}

/**
 * One preset plugin row, mirroring the Cordis entry-list dialect.
 *
 * `config` is kept as unknown JSON so a copied preset round-trips without the
 * manager understanding any plugin's schema. Unknown fields are preserved.
 */
export interface PresetPluginRow {
  readonly id?: string
  readonly name: string
  readonly config?: unknown
  readonly disabled?: boolean | null | LoaderExpression
  readonly group?: boolean
  readonly inject?: unknown
  readonly intercept?: unknown
  readonly isolate?: unknown
  readonly [extra: string]: unknown
}

/** The canonical preset definition the manager owns and registers. */
export interface PresetDefinition {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly plugins: readonly PresetPluginRow[]
}

/** Which party declared a preset that currently exists in the registry. */
export type PresetOwnership = 'managed' | 'builtin' | 'third-party'

/** Registration lifecycle of one preset as the manager sees it. */
export type PresetRegistrationState =
  | 'registered'
  | 'not-registered'
  | 'registering'
  | 'failed'

/** Health of a preset's activation, independent of its registration state. */
export type PresetHealth = 'healthy' | 'broken' | 'unchecked'

/** Everything the management list shows for one preset. */
export interface PresetSummary {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly ownership: PresetOwnership
  readonly registration: PresetRegistrationState
  /** True when this preset is the DSH-selected default. */
  readonly isDefault: boolean
  readonly health: PresetHealth
  /** Activation diagnostic; present when health is not `healthy`. */
  readonly broken?: string
  /** Count of declared plugin rows, for an at-a-glance size signal. */
  readonly pluginCount: number
  /** True when this plugin may enable or disable the preset. */
  readonly canToggle?: boolean
  /** False when the preset is intentionally withheld from the host selector. */
  readonly enabled?: boolean
}

/** Full detail of one preset, including its complete plugin list. */
export interface PresetDetail {
  readonly summary: PresetSummary
  readonly definition: PresetDefinition
  /** Content hash of the effective definition; used for conflict detection. */
  readonly revision: string
  /** YAML rendering of the plugin list in the DSH entry-list dialect. */
  readonly yaml: string
  /** True when the manager may edit or delete this preset. */
  readonly editable: boolean
}

/** One retained historical revision of a managed preset. */
export interface HistoryEntry {
  readonly revision: string
  readonly savedAt: string
  /** What produced this revision: `create`, `save`, `import`, `restore`. */
  readonly reason: string
  readonly name?: string
  readonly description?: string
  readonly pluginCount: number
}

/** Result of validating a candidate definition before it is applied. */
export interface ValidationReport {
  readonly ok: boolean
  readonly errors: readonly ValidationIssue[]
  readonly warnings: readonly ValidationIssue[]
}

export interface ValidationIssue {
  /** Machine-stable code, for programmatic handling and tests. */
  readonly code: string
  /** Human-readable message, already localized to the requested locale. */
  readonly message: string
  /** Where the problem is, such as `plugins[2].name`. */
  readonly path?: string
  /** Extra detail lines, such as the offending value. */
  readonly detail?: string
}

/** A change between two preset definitions, for the pre-save confirmation. */
export interface PresetDiff {
  readonly changedMetadata: readonly PresetDiffField[]
  readonly addedPlugins: readonly PresetDiffRow[]
  readonly removedPlugins: readonly PresetDiffRow[]
  readonly changedPlugins: readonly PresetDiffRow[]
  readonly unchangedPlugins: number
}

export interface PresetDiffField {
  readonly field: string
  readonly before?: string
  readonly after?: string
}

export interface PresetDiffRow {
  readonly id: string
  readonly name: string
}

/** Lifecycle phase the manager reports so the UI can explain its state. */
export type ManagerPhase =
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopping'
  | 'stopped'

/** Whole-page snapshot: everything the settings page needs for its list. */
export interface ManagerSnapshot {
  readonly phase: ManagerPhase
  readonly presets: readonly PresetSummary[]
  /** Absolute path of the plugin-owned data directory. */
  readonly dataDirectory: string
  /** Non-fatal problems found while restoring at startup. */
  readonly diagnostics: readonly ValidationIssue[]
  readonly defaultPresetId?: string
  /** True when a write is currently in flight, so the UI can serialize. */
  readonly busy: boolean
}

/** Outcome of a mutating operation, reported after the effect settles. */
export interface MutationResult {
  readonly ok: boolean
  /** True only when the runtime registration matched the persisted file. */
  readonly applied: boolean
  readonly preset?: PresetSummary
  readonly errors: readonly ValidationIssue[]
  readonly warnings: readonly ValidationIssue[]
}

/** Versioned share envelope. Never contains local paths or runtime state. */
export interface ShareDocument {
  readonly kind: 'dsh-agent-preset-share'
  readonly formatVersion: number
  readonly preset: PresetDefinition
}

/** Result of inspecting share text before the user confirms an import. */
export interface ImportPreview {
  readonly document: ShareDocument
  readonly definition: PresetDefinition
  readonly validation: ValidationReport
  /** Risks the user must acknowledge: secrets, expressions, missing modules. */
  readonly risks: readonly ValidationIssue[]
  /** True when the id collides with a preset the manager does not own. */
  readonly idConflict: {
    readonly conflict: boolean
    readonly existingOwnership?: PresetOwnership
    readonly suggestedId?: string
  }
  readonly yaml: string
}

/** One exportable representation of a preset. */
export interface ExportResult {
  readonly yaml: string
  readonly risks: readonly ValidationIssue[]
}

/** Error shape carried across the Remote boundary. */
export interface ManagerFailure {
  readonly code: string
  readonly message: string
  readonly details?: readonly ValidationIssue[]
}
