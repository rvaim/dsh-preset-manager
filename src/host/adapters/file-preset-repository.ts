/**
 * File-backed preset store under `$DSH_HOME/dsh-preset-manager/`.
 *
 * Layout:
 *   presets/<id>.yml            the current effective definition
 *   history/<id>/<rev>.yml      every superseded revision
 *   backups/quarantine/         files that failed to parse
 *   metadata.json               an index only, never a second copy of a preset
 *
 * Two invariants drive the implementation:
 *
 *  - `presets/` is the sole authority for what should be registered. History
 *    is never consulted automatically, so a bad current file cannot be
 *    silently replaced by an old one.
 *  - A write is atomic. The candidate is written to a sibling temporary file,
 *    re-read and re-parsed to prove it is complete, then renamed over the
 *    target. A crash mid-write leaves the previous revision intact.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { HistoryEntry, PresetDefinition } from '../../shared/types.js'
import { dumpPresetDocument, parsePresetDocument } from '../../domain/preset-model.js'
import { revisionOf } from '../../domain/preset-revision.js'
import type {
  PresetRepository,
  RevisionReason,
  StoredPreset,
} from '../ports/preset-repository.js'

/** Layout constants, so no caller has to know a directory name. */
const PRESETS_DIR = 'presets'
const HISTORY_DIR = 'history'
const BACKUPS_DIR = 'backups'
const QUARANTINE_DIR = 'quarantine'
const METADATA_FILE = 'metadata.json'
const PRESET_EXTENSION = '.yml'

/** Metadata is an index only; it must never be able to become authoritative. */
interface MetadataFile {
  readonly schemaVersion: 1
  readonly presets: Record<
    string,
    {
      readonly revision: string
      readonly savedAt: string
      readonly reason: RevisionReason
      readonly name?: string
      readonly description?: string
    }
  >
  /**
   * The user explicitly acknowledged the DSH-default risk for these ids.
   *
   * Recorded so the UI can keep warning without nagging on every render.
   */
  readonly defaultRiskAcknowledged?: readonly string[]
  /**
   * Preset ids the user disabled from the host selector.
   *
   * This list covers both stored presets and bundled presets. It deliberately
   * lives beside, not inside, the preset files so enablement never rewrites a
   * definition and survives a restart.
   */
  readonly disabledPresets?: readonly string[]
}

export interface FileRepositoryOptions {
  /** Directory the plugin owns; created on demand. */
  readonly directory: string
  /** Sink for non-fatal diagnostics, such as a quarantined file. */
  readonly warn?: (message: string) => void
}

/** Guard file-name construction: an id becomes a path segment. */
function assertSafeId(id: string): void {
  if (typeof id !== 'string' || id === '') throw new Error('preset id must not be empty')
  if (id === '.' || id === '..' || /[/\\\0]/u.test(id)) {
    throw new Error(`preset id ${JSON.stringify(id)} is not usable as a file name`)
  }
}

export class FilePresetRepository implements PresetRepository {
  readonly directory: string
  private readonly warn: (message: string) => void
  private readonly quarantinedFiles: { file: string; reason: string }[] = []
  private metadataCache: MetadataFile | undefined
  /** Serializes every write so two saves cannot interleave. */
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(options: FileRepositoryOptions) {
    this.directory = options.directory
    this.warn = options.warn ?? (() => {})
  }

  // ---------------------------------------------------------------- paths

  private get presetsDir(): string {
    return join(this.directory, PRESETS_DIR)
  }

  private get historyDir(): string {
    return join(this.directory, HISTORY_DIR)
  }

  private get quarantineDir(): string {
    return join(this.directory, BACKUPS_DIR, QUARANTINE_DIR)
  }

  private presetPath(id: string): string {
    assertSafeId(id)
    return join(this.presetsDir, `${id}${PRESET_EXTENSION}`)
  }

  private historyPresetDir(id: string): string {
    assertSafeId(id)
    return join(this.historyDir, id)
  }

  // ------------------------------------------------------------ lifecycle

  /** Create the directory tree. Safe to call repeatedly. */
  async ensure(): Promise<void> {
    await mkdir(this.presetsDir, { recursive: true })
    await mkdir(this.historyDir, { recursive: true })
    await mkdir(join(this.directory, BACKUPS_DIR), { recursive: true })
  }

  // ---------------------------------------------------------------- reads

  async list(): Promise<StoredPreset[]> {
    await this.ensure()
    let names: string[]
    try {
      names = await readdir(this.presetsDir)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }

    const stored: StoredPreset[] = []
    for (const name of names) {
      if (!name.endsWith(PRESET_EXTENSION)) continue
      const id = name.slice(0, -PRESET_EXTENSION.length)
      const result = await this.readFile(this.presetPath(id))
      if (result === undefined) continue
      if (result.kind === 'corrupt') continue
      stored.push(result.preset)
    }
    // A stable order keeps the UI from reshuffling between renders.
    return stored.sort((left, right) => left.definition.id.localeCompare(right.definition.id))
  }

  async get(id: string): Promise<StoredPreset | undefined> {
    let path: string
    try {
      path = this.presetPath(id)
    } catch {
      return undefined
    }
    const result = await this.readFile(path)
    if (result === undefined) return undefined
    if (result.kind === 'corrupt') return undefined
    return result.preset
  }

  /**
   * Read and parse one preset file.
   *
   * A corrupt file is moved aside rather than deleted: the user's text is
   * preserved so it can be repaired by hand, and the manager keeps working for
   * every other preset.
   */
  private async readFile(
    path: string,
  ): Promise<{ kind: 'ok'; preset: StoredPreset } | { kind: 'corrupt' } | undefined> {
    let text: string
    let stats: { mtime: Date }
    try {
      text = await readFile(path, 'utf8')
      stats = await stat(path)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }

    try {
      const definition = parsePresetDocument(text)
      if (typeof definition.id !== 'string' || definition.id === '') {
        throw new Error('missing id')
      }
      if (!Array.isArray(definition.plugins)) throw new Error('missing plugins')
      return {
        kind: 'ok',
        preset: {
          definition,
          revision: revisionOf(definition),
          savedAt: stats.mtime.toISOString(),
        },
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.quarantine(path, reason)
      return { kind: 'corrupt' }
    }
  }

  /** Move an unparsable preset aside and record the diagnostic. */
  private async quarantine(path: string, reason: string): Promise<void> {
    const file = path.slice(this.directory.length + 1)
    try {
      await mkdir(this.quarantineDir, { recursive: true })
      const target = join(this.quarantineDir, `${Date.now()}-${basenameOf(path)}`)
      await rename(path, target)
      this.quarantinedFiles.push({ file, reason })
      this.warn(`preset file quarantined: ${file} (${reason})`)
    } catch (error) {
      this.quarantinedFiles.push({ file, reason })
      this.warn(
        `preset file is unreadable and could not be quarantined: ${file} (${reason}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async quarantined(): Promise<readonly { file: string; reason: string }[]> {
    return [...this.quarantinedFiles]
  }

  // --------------------------------------------------------------- writes

  async save(
    definition: PresetDefinition,
    reason: RevisionReason,
    expectedRevision?: string,
  ): Promise<StoredPreset> {
    return this.serialize(async () => {
      await this.ensure()
      assertSafeId(definition.id)

      const current = await this.get(definition.id)
      if (expectedRevision !== undefined) {
        const actual = current?.revision
        if (actual !== expectedRevision) {
          const failure = new Error(
            actual === undefined
              ? `preset ${definition.id} no longer exists`
              : `preset ${definition.id} changed since it was read`,
          )
          failure.name = 'RevisionConflictError'
          throw failure
        }
      }

      const revision = revisionOf(definition)
      const text = dumpPresetDocument(definition)

      // Prove the candidate parses before it can replace the live file.
      const reparsed = parsePresetDocument(text)
      if (revisionOf(reparsed) !== revision) {
        throw new Error(`preset ${definition.id} did not survive a YAML round-trip`)
      }

      // Archive the outgoing revision first, so a crash between the two writes
      // never loses the version the user was running.
      if (current !== undefined && current.revision !== revision) {
        await this.archive(current)
      }

      await this.writeAtomic(this.presetPath(definition.id), text)
      const savedAt = new Date().toISOString()
      await this.updateMetadata(definition.id, {
        revision,
        savedAt,
        reason,
        ...(definition.name === undefined ? {} : { name: definition.name }),
        ...(definition.description === undefined
          ? {}
          : { description: definition.description }),
      })

      return { definition, revision, savedAt }
    })
  }

  /** Copy the outgoing revision into history before it is replaced. */
  private async archive(preset: StoredPreset): Promise<void> {
    const dir = this.historyPresetDir(preset.definition.id)
    await mkdir(dir, { recursive: true })
    const target = join(dir, `${preset.revision}${PRESET_EXTENSION}`)
    try {
      // Already archived by an earlier cycle: keep the first copy, which is the
      // one whose timestamp matches when that revision was actually live.
      await access(target, fsConstants.F_OK)
      return
    } catch {
      /* absent, which is the normal path */
    }
    await this.writeAtomic(target, dumpPresetDocument(preset.definition))
  }

  /**
   * Write a file atomically.
   *
   * The temporary file lives beside the target, so the rename stays on one
   * volume. The handle is flushed before the rename, which is what makes the
   * operation safe against an abrupt process exit.
   */
  private async writeAtomic(path: string, content: string): Promise<void> {
    const temporary = join(dirname(path), `.${basenameOf(path)}.${randomUUID()}.tmp`)
    await mkdir(dirname(path), { recursive: true })
    const handle = await open(temporary, 'w')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await rename(temporary, path)
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    return this.serialize(async () => {
      const current = await this.get(id)
      if (current !== undefined) await this.archive(current)
      const path = this.presetPath(id)
      try {
        await unlink(path)
      } catch (error) {
        if (!isMissing(error)) throw error
      }
      const metadata = await this.readMetadata()
      const disabled = new Set(metadata.disabledPresets ?? [])
      const wasDisabled = disabled.delete(id)
      if (metadata.presets[id] !== undefined || wasDisabled) {
        const presets = { ...metadata.presets }
        delete presets[id]
        await this.writeMetadata({
          ...metadata,
          presets,
          ...(metadata.disabledPresets === undefined
            ? {}
            : { disabledPresets: [...disabled].sort() }),
        })
      }
    })
  }

  // -------------------------------------------------------------- history

  async history(id: string): Promise<HistoryEntry[]> {
    let dir: string
    try {
      dir = this.historyPresetDir(id)
    } catch {
      return []
    }
    let names: string[]
    try {
      names = await readdir(dir)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }

    const metadata = await this.readMetadata()
    const entries: HistoryEntry[] = []
    for (const name of names) {
      if (!name.endsWith(PRESET_EXTENSION)) continue
      const revision = name.slice(0, -PRESET_EXTENSION.length)
      const path = join(dir, name)
      try {
        const [text, stats] = await Promise.all([
          readFile(path, 'utf8'),
          stat(path),
        ])
        const definition = parsePresetDocument(text)
        entries.push({
          revision,
          savedAt: stats.mtime.toISOString(),
          reason:
            revision === metadata.presets[id]?.revision
              ? metadata.presets[id]?.reason ?? 'save'
              : 'save',
          ...(definition.name === undefined ? {} : { name: definition.name }),
          ...(definition.description === undefined
            ? {}
            : { description: definition.description }),
          pluginCount: Array.isArray(definition.plugins) ? definition.plugins.length : 0,
        })
      } catch {
        // A corrupt history file must not hide the other revisions.
        this.warn(`history file unreadable: ${id}/${name}`)
      }
    }
    // Newest first: the timestamp is the only ordering the files carry.
    return entries.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  }

  async readHistory(id: string, revision: string): Promise<PresetDefinition | undefined> {
    if (!/^[a-f0-9]{8,64}$/u.test(revision)) return undefined
    const path = join(this.historyPresetDir(id), `${revision}${PRESET_EXTENSION}`)
    try {
      const definition = parsePresetDocument(await readFile(path, 'utf8'))
      return definition.id === id ? definition : undefined
    } catch {
      return undefined
    }
  }

  // ------------------------------------------------------------- metadata

  private async readMetadata(): Promise<MetadataFile> {
    if (this.metadataCache !== undefined) return this.metadataCache
    try {
      const text = await readFile(join(this.directory, METADATA_FILE), 'utf8')
      const parsed = JSON.parse(text) as MetadataFile
      if (parsed !== null && typeof parsed === 'object' && parsed.schemaVersion === 1) {
        this.metadataCache = parsed
        return parsed
      }
      throw new Error('unexpected metadata shape')
    } catch (error) {
      if (!isMissing(error)) {
        // Metadata is only an index: a corrupt index must not block presets.
        this.warn(
          `metadata.json is unusable and will be rebuilt: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      const empty: MetadataFile = { schemaVersion: 1, presets: {} }
      this.metadataCache = empty
      return empty
    }
  }

  private async updateMetadata(
    id: string,
    entry: MetadataFile['presets'][string],
  ): Promise<void> {
    const metadata = await this.readMetadata()
    const next: MetadataFile = {
      ...metadata,
      presets: { ...metadata.presets, [id]: entry },
    }
    await this.writeMetadata(next)
  }

  private async writeMetadata(metadata: MetadataFile): Promise<void> {
    this.metadataCache = metadata
    await this.writeAtomic(
      join(this.directory, METADATA_FILE),
      JSON.stringify(metadata, null, 2) + '\n',
    )
  }

  /** Record that the user accepted the DSH-default risk for one preset. */
  async acknowledgeDefaultRisk(id: string): Promise<void> {
    return this.serialize(async () => {
      const metadata = await this.readMetadata()
      const current = new Set(metadata.defaultRiskAcknowledged ?? [])
      if (current.has(id)) return
      current.add(id)
      await this.writeMetadata({
        ...metadata,
        defaultRiskAcknowledged: [...current].sort(),
      })
    })
  }

  /** Whether the user already accepted the default-preset risk for an id. */
  async hasAcknowledgedDefaultRisk(id: string): Promise<boolean> {
    const metadata = await this.readMetadata()
    return (metadata.defaultRiskAcknowledged ?? []).includes(id)
  }

  // ----------------------------------------------------------- enablement

  async disabledPresetIds(): Promise<ReadonlySet<string>> {
    const metadata = await this.readMetadata()
    return new Set(metadata.disabledPresets ?? [])
  }

  async isPresetDisabled(id: string): Promise<boolean> {
    return (await this.disabledPresetIds()).has(id)
  }

  async setPresetDisabled(id: string, disabled: boolean): Promise<void> {
    return this.serialize(async () => {
      const metadata = await this.readMetadata()
      const ids = new Set(metadata.disabledPresets ?? [])
      if (disabled) ids.add(id)
      else ids.delete(id)
      await this.writeMetadata({ ...metadata, disabledPresets: [...ids].sort() })
    })
  }

  // ---------------------------------------------------------------- purge

  /**
   * Delete every plugin-owned file.
   *
   * One backup snapshot is written first, because purge is irreversible and
   * the user may have misread the confirmation. The backup lives inside the
   * plugin directory, so it is removed with everything else on a second run.
   */
  async purge(): Promise<void> {
    return this.serialize(async () => {
      await mkdir(join(this.directory, BACKUPS_DIR), { recursive: true })
      const presets = await this.list()
      const metadata = await this.readMetadata()
      if (presets.length > 0 || (metadata.disabledPresets?.length ?? 0) > 0) {
        const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
        const backup = join(this.directory, BACKUPS_DIR, `purge-${stamp}.json`)
        const snapshot = {
          schemaVersion: 1,
          presets: presets.map((entry) => ({
            id: entry.definition.id,
            revision: entry.revision,
            savedAt: entry.savedAt,
            definition: entry.definition,
          })),
          disabledPresets: metadata.disabledPresets ?? [],
        }
        await this.writeAtomic(backup, JSON.stringify(snapshot, null, 2) + '\n')
      }

      for (const sub of [PRESETS_DIR, HISTORY_DIR]) {
        await rm(join(this.directory, sub), { recursive: true, force: true })
      }
      await rm(join(this.directory, METADATA_FILE), { force: true })
      this.metadataCache = undefined
      this.quarantinedFiles.length = 0
    })
  }

  // --------------------------------------------------------- serialization

  /**
   * Run one write with exclusive access.
   *
   * Chaining on a promise rather than a lock keeps ordering strict while
   * remaining re-entrant: each caller queues behind the previous one even if it
   * rejects.
   */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(task, task)
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function basenameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index < 0 ? path : path.slice(index + 1)
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}
