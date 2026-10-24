/**
 * The application service: one façade over the use cases.
 *
 * Its responsibilities are narrow on purpose. It owns the manager phase, the
 * busy accounting, the serialization of mutations, and the read projections the
 * UI needs. The decisions themselves live in the use cases, and the file and
 * runtime mechanics live behind the ports.
 *
 * The phase gate is what makes shutdown honest: `markStopped()` flips before any
 * teardown awaits, so a client call that arrives during teardown fails with a
 * precise `manager/stopping` code instead of starting work that will be
 * abandoned half way.
 */
import type {
  ExportResult,
  HistoryEntry,
  ImportPreview,
  ManagerPhase,
  ManagerSnapshot,
  MutationResult,
  PresetDefinition,
  PresetDetail,
  PresetDiff,
  PresetSummary,
  ValidationIssue,
  ValidationReport,
} from '../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../shared/errors.js'
import { countPlugins, parsePresetDocument, dumpPresetDocument } from '../../domain/preset-model.js'
import { revisionOf } from '../../domain/preset-revision.js'
import { diffPresets } from '../../domain/preset-diff.js'
import { validatePreset } from '../../domain/preset-validator.js'
import { exportPreset } from '../../sharing/preset-exporter.js'
import type { ImportSource } from '../../sharing/preset-importer.js'
import type { ApplicationDeps } from './deps.js'
import { checkModules } from './deps.js'
import { listPresets } from './use-cases/list-presets.js'
import { clonePresetUseCase, readSource } from './use-cases/clone-preset.js'
import { savePreset } from './use-cases/save-preset.js'
import { deletePreset } from './use-cases/delete-preset.js'
import { restorePreset } from './use-cases/restore-preset.js'
import { exportPresetUseCase, sharePreset } from './use-cases/export-preset.js'
import { importPresetUseCase, previewImportUseCase } from './use-cases/import-preset.js'
import { setEnabled } from './use-cases/set-enabled.js'

export class PresetManagerService {
  private readonly deps: ApplicationDeps
  private phase: ManagerPhase = 'starting'
  private diagnostics: ValidationIssue[] = []
  /** Serializes every mutation so two edits cannot interleave. */
  private chain: Promise<unknown> = Promise.resolve()
  private pending = 0
  private startup: Promise<unknown> = Promise.resolve()

  constructor(deps: ApplicationDeps) {
    this.deps = deps
  }

  // ------------------------------------------------------------ lifecycle

  /** Wait for bundled declarations without holding the Host's apply open. */
  waitForStartup(startup: Promise<unknown>): void {
    this.startup = startup
  }

  /** Publish the restore diagnostics and settle into a phase. */
  markReady(diagnostics: readonly ValidationIssue[]): void {
    this.diagnostics = [...diagnostics]
    this.phase = diagnostics.some(
      (issue) =>
        issue.code === 'startup.registration-failed' ||
        issue.code === 'bundled.registration-failed' ||
        issue.code === 'bundled.id-conflict' ||
        issue.code === 'bundled.enablement-unreadable' ||
        issue.code === 'storage.unreadable' ||
        issue.code === 'startup.enablement-unreadable' ||
        issue.code === 'storage.quarantined',
    )
      ? 'degraded'
      : 'ready'
  }

  /** Refuse all later calls. Synchronous, so teardown cannot race a call. */
  markStopped(): void {
    this.phase = 'stopped'
  }

  addDiagnostics(issues: readonly ValidationIssue[]): void {
    if (issues.length > 0) this.diagnostics = [...this.diagnostics, ...issues]
  }

  get currentPhase(): ManagerPhase {
    return this.phase
  }

  get busy(): boolean {
    return this.pending > 0
  }

  // ------------------------------------------------------------- read side

  async snapshot(): Promise<ManagerSnapshot> {
    await this.startup
    this.assertUsable()
    return listPresets(this.deps, {
      phase: this.phase,
      diagnostics: this.diagnostics,
      busy: this.pending > 0,
    })
  }

  /** Presets the clone dialog offers as sources. */
  async cloneSources(): Promise<readonly PresetSummary[]> {
    return (await this.snapshot()).presets
  }

  async history(id: string): Promise<HistoryEntry[]> {
    this.assertUsable()
    return this.deps.repository.history(id)
  }

  async detail(id: string): Promise<PresetDetail> {
    this.assertUsable()
    const managed = await this.deps.repository.get(id)
    if (managed !== undefined) {
      return this.detailOf(managed.definition, managed.revision, true)
    }
    const foreign = await this.deps.source.read(id)
    if (foreign === undefined) {
      throw new ManagerError(ManagerErrorCode.presetNotFound, `找不到预设：${id}`)
    }
    return this.detailOf(foreign.definition, revisionOf(foreign.definition), false)
  }

  private async detailOf(
    definition: PresetDefinition,
    revision: string,
    editable: boolean,
  ): Promise<PresetDetail> {
    const { presets } = await this.snapshot()
    const summary = presets.find((row) => row.id === definition.id)
    return {
      summary:
        summary ??
        ({
          id: definition.id,
          ...(definition.name === undefined ? {} : { name: definition.name }),
          ...(definition.description === undefined
            ? {}
            : { description: definition.description }),
          ownership: editable ? 'managed' : 'builtin',
          registration: 'registered',
          isDefault: false,
          health: 'unchecked',
          pluginCount: countPlugins(definition.plugins),
        } satisfies PresetSummary),
      definition,
      revision,
      yaml: dumpPresetDocument(definition),
      editable,
    }
  }

  // ---------------------------------------------------------- validation

  async validate(definition: PresetDefinition): Promise<ValidationReport> {
    this.assertUsable()
    const report = validatePreset(definition)
    if (!report.ok) return report
    const modules = checkModules(definition, this.deps.resolveModule)
    return {
      ok: report.ok && modules.length === 0,
      errors: [...report.errors, ...modules],
      warnings: report.warnings,
    }
  }

  async diff(before: PresetDefinition, after: PresetDefinition): Promise<PresetDiff> {
    this.assertUsable()
    return diffPresets(before, after)
  }

  // ------------------------------------------------------------ mutations

  clone(request: {
    sourceId: string
    newId?: string
    name?: string
    description?: string
  }): Promise<MutationResult> {
    return this.mutate(() => clonePresetUseCase(this.deps, request))
  }

  save(request: {
    definition: PresetDefinition
    expectedRevision?: string
  }): Promise<MutationResult> {
    return this.mutate(() => savePreset(this.deps, request))
  }

  remove(request: {
    id: string
    acknowledgedDefaultRisk?: boolean
  }): Promise<MutationResult> {
    return this.mutate(() => deletePreset(this.deps, request))
  }

  restore(request: {
    id: string
    revision: string
    expectedRevision?: string
  }): Promise<MutationResult> {
    return this.mutate(() => restorePreset(this.deps, request))
  }

  setEnabled(request: {
    id: string
    enabled: boolean
  }): Promise<MutationResult> {
    this.assertUsable()
    return this.mutate(() => setEnabled(this.deps, request))
  }

  importPreset(request: {
    text: string
    source: ImportSource
    id?: string
    name?: string
    acknowledgedRisks: boolean
  }): Promise<MutationResult> {
    return this.mutate(() => importPresetUseCase(this.deps, request))
  }

  // ------------------------------------------------------------- import

  async previewImport(request: {
    text: string
    source: ImportSource
    id?: string
  }): Promise<ImportPreview> {
    this.assertUsable()
    return previewImportUseCase(this.deps, request)
  }

  // ------------------------------------------------------------- export

  async exportPreset(id: string): Promise<ExportResult> {
    this.assertUsable()
    return exportPresetUseCase(this.deps, { id })
  }

  async shareText(id: string): Promise<{ yaml: string; risks: readonly ValidationIssue[] }> {
    this.assertUsable()
    return sharePreset(this.deps, { id })
  }
  /** Render YAML for the advanced editor from any readable preset. */
  async renderYaml(id: string): Promise<string> {
    this.assertUsable()
    const definition = await readSource(this.deps, id)
    return dumpPresetDocument(definition)
  }

  /**
   * Parse YAML from the advanced editor back into a definition.
   *
   * The editor round-trips through the same dialect the store writes, so `!!js`
   * nodes come back as inert expressions rather than being evaluated. A parse
   * failure surfaces as a precise diagnostic instead of an empty draft, because
   * discarding the user's text on a syntax error would be the worst possible
   * response to a typo.
   */
  async parseYaml(request: {
    id: string
    yaml: string
    name?: string
    description?: string
  }): Promise<{ definition: PresetDefinition; validation: ValidationReport }> {
    this.assertUsable()
    let definition: PresetDefinition
    try {
      definition = parsePresetDocument(request.yaml)
    } catch (error) {
      throw new ManagerError(ManagerErrorCode.invalidInput, '无法解析完整预设 YAML', [{
        code: 'yaml.syntax', message: error instanceof Error ? error.message : String(error),
      }])
    }
    if (definition.id !== request.id) {
      return { definition, validation: { ok: false, errors: [{
        code: 'preset.id.immutable', path: 'id', message: '保存不能修改预设 ID；请使用派生创建新的预设。',
      }], warnings: [] } }
    }
    return { definition, validation: await this.validate(definition) }
  }

  // -------------------------------------------------------------- purge

  /**
   * Delete every plugin-owned file.
   *
   * Guarded by an exact confirmation phrase, because this is the one operation
   * the manager cannot undo. Presets are withdrawn from the runtime first: a
   * file deleted while the registry still published the preset would leave a
   * preset the user can use but no longer manage.
   */
  async purge(confirmation: string): Promise<MutationResult> {
    return this.mutate(async () => {
      if (confirmation !== PURGE_CONFIRMATION) {
        throw new ManagerError(
          ManagerErrorCode.invalidInput,
          `请准确输入 ${PURGE_CONFIRMATION} 以确认删除全部插件数据`,
        )
      }
      const stored = await this.deps.repository.list()
      for (const entry of stored) {
        await this.deps.registrations.unregister(entry.definition.id)
      }
      // Bundled registrations must be withdrawn before the metadata carrying
      // their disabled state is deleted. Otherwise purge would leave them live
      // until the next plugin restart.
      for (const id of this.deps.bundled.ids) {
        if (this.deps.bundled.conflicted(id)) continue
        await this.deps.bundled.setRegistered(id, false)
      }
      await this.deps.repository.purge()
      const warnings: ValidationIssue[] = [
        {
          code: 'data.purged',
          message: '插件数据已清除；清理前的快照保存在备份目录中',
        },
      ]
      // Purge also clears enablement state, whose default for bundled presets is
      // enabled. Restore that default now so disk and runtime agree.
      for (const id of this.deps.bundled.ids) {
        if (this.deps.bundled.conflicted(id) || this.deps.bundled.holds(id)) continue
        const outcome = await this.deps.bundled.setRegistered(id, true)
        if (!outcome.healthy) {
          warnings.push({
            code: outcome.conflict ? 'bundled.id-conflict' : 'bundled.registration-failed',
            message: `自带预设「${id}」未能在清理后恢复启用；下次启动会再次尝试`,
            ...(outcome.broken === undefined ? {} : { detail: outcome.broken }),
          })
        }
      }
      return {
        ok: true,
        applied: true,
        errors: [],
        warnings,
      }
    })
  }

  // -------------------------------------------------------------- teardown

  /** Await every queued mutation; used before shutdown. */
  async quiesce(): Promise<void> {
    await this.chain.then(
      () => undefined,
      () => undefined,
    )
  }

  private assertUsable(): void {
    if (this.phase === 'stopped') {
      throw new ManagerError(ManagerErrorCode.stopping, '预设管理器已停止，无法继续操作')
    }
    if (this.deps.registrations.isShuttingDown) {
      throw new ManagerError(ManagerErrorCode.stopping, '预设管理器正在停止，请稍后重试')
    }
  }

  private async mutate(task: () => Promise<MutationResult>): Promise<MutationResult> {
    this.assertUsable()
    this.pending += 1
    const run = this.chain.then(task, task)
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    try {
      return await run
    } finally {
      this.pending -= 1
    }
  }
}

/** The exact phrase the purge operation requires. */
export const PURGE_CONFIRMATION = 'DELETE ALL PRESET DATA'
