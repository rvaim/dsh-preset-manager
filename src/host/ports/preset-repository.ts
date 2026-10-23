/**
 * Port: the plugin-owned preset store.
 *
 * The repository owns files and nothing else. It never talks to the DSH
 * registry, so a persisted preset is not implicitly an active one — that
 * separation is what lets a save succeed on disk while registration fails
 * loudly, instead of one operation pretending to be the other.
 *
 * Every write is atomic: a candidate file is completed and validated before it
 * replaces the previous one, so an interrupted write cannot leave a half
 * preset.
 */
import type { HistoryEntry, PresetDefinition } from '../../shared/types.js'

/** A stored preset together with the revision its content hashes to. */
export interface StoredPreset {
  readonly definition: PresetDefinition
  readonly revision: string
  /** File modification time, used for the list's ordering fallback. */
  readonly savedAt: string
}

/** Why a revision was written; recorded in history. */
export type RevisionReason = 'create' | 'save' | 'import' | 'restore'

export interface PresetRepository {
  /** Current stored presets. A corrupt file is quarantined, not silently dropped. */
  list(): Promise<StoredPreset[]>
  get(id: string): Promise<StoredPreset | undefined>

  /**
   * Store a preset as the current revision.
   *
   * @param definition - the definition to persist.
   * @param reason - why this revision exists; carried into history.
   * @param expectedRevision - when given, the write is refused unless the
   *   currently stored revision matches, so a concurrent edit is never
   *   silently overwritten.
   */
  save(
    definition: PresetDefinition,
    reason: RevisionReason,
    expectedRevision?: string,
  ): Promise<StoredPreset>

  /**
   * Archive and remove a preset.
   *
   * Removal is recoverable: the final revision is moved to history first.
   */
  delete(id: string): Promise<void>

  /** Retained revisions of one preset, newest first. */
  history(id: string): Promise<HistoryEntry[]>

  /** Read one historical revision's definition. */
  readHistory(id: string, revision: string): Promise<PresetDefinition | undefined>

  /** Corrupt files found while reading, for the startup diagnostics. */
  quarantined(): Promise<readonly { file: string; reason: string }[]>

  /** Absolute path of the plugin-owned data directory. */
  readonly directory: string

  /** Delete every plugin-owned file, after writing one last backup. */
  purge(): Promise<void>
}
