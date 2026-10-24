/**
 * Startup restore: bring the runtime in line with the plugin's own `presets/`.
 *
 * The restore path is deliberately simple, because it is the path that runs
 * unattended on every launch:
 *
 *  1. read the repository (the sole authority for what should be active),
 *  2. validate each definition structurally,
 *  3. skip — never register — anything invalid, recording a diagnostic,
 *  4. hand the valid set to the registration manager.
 *
 * It never consults history and never "repairs" a file it cannot parse. A
 * preset whose definition is invalid is reported and left alone, which keeps a
 * bad edit visible instead of silently reverting to an older version the user
 * did not choose.
 */
import type { PresetDefinition, ValidationIssue } from '../../shared/types.js'
import { validatePreset } from '../../domain/preset-validator.js'
import type { PresetRepository, StoredPreset } from '../ports/preset-repository.js'
import type { RegistrationManager, RegistrationRecord } from './registration-manager.js'

export interface RestoreOutcome {
  /** Presets read from disk and accepted structurally. */
  readonly restored: readonly StoredPreset[]
  /** Per-preset registration results. */
  readonly registrations: readonly RegistrationRecord[]
  /** Problems that did not stop the restore. */
  readonly diagnostics: readonly ValidationIssue[]
}

export interface StartupRestoreOptions {
  readonly repository: PresetRepository
  readonly registrations: RegistrationManager
  /** Ids already claimed by other parties, for a conflict check. */
  readonly foreignIds?: () => Promise<ReadonlyMap<string, string>>
}

/**
 * Read, validate and register every stored preset.
 *
 * A registration failure is not fatal: DSH must finish starting even when one
 * custom preset cannot mount, so the failure is recorded and the remaining
 * presets are registered.
 */
export async function restoreStoredPresets(
  options: StartupRestoreOptions,
): Promise<RestoreOutcome> {
  const { repository, registrations } = options
  const diagnostics: ValidationIssue[] = []

  for (const entry of await repository.quarantined()) {
    diagnostics.push({
      code: 'storage.quarantined',
      message: '预设文件无法解析，已隔离保留，未参与注册',
      path: entry.file,
      detail: entry.reason,
    })
  }

  let stored: StoredPreset[]
  try {
    stored = await repository.list()
  } catch (error) {
    diagnostics.push({
      code: 'storage.unreadable',
      message: '无法读取预设目录，本次启动没有恢复任何自定义预设',
      detail: error instanceof Error ? error.message : String(error),
    })
    return { restored: [], registrations: [], diagnostics }
  }

  const foreign = options.foreignIds === undefined
    ? new Map<string, string>()
    : await options.foreignIds().catch(() => new Map<string, string>())
  let disabled: ReadonlySet<string>
  try {
    disabled = await repository.disabledPresetIds()
  } catch (error) {
    diagnostics.push({
      code: 'startup.enablement-unreadable',
      message: '无法读取预设启停状态，本次启动没有恢复任何自定义预设',
      detail: error instanceof Error ? error.message : String(error),
    })
    return { restored: [], registrations: [], diagnostics }
  }

  const accepted: { definition: PresetDefinition; revision: string }[] = []
  for (const entry of stored) {
    const report = validatePreset(entry.definition, { knownIds: foreign })
    if (!report.ok) {
      diagnostics.push(...report.errors)
      continue
    }
    diagnostics.push(...report.warnings)
    if (!disabled.has(entry.definition.id)) accepted.push({ definition: entry.definition, revision: entry.revision })
  }

  // Disabled records are not desired registrations, but they still need a
  // record so the UI can explain why a previously broken preset is off.
  const registrationsResult = await registrations.reconcile(accepted)

  for (const record of registrationsResult) {
    if (record.state === 'failed') {
      diagnostics.push({
        code: 'startup.registration-failed',
        message: `预设 "${record.id}" 未能注册，其他预设不受影响`,
        detail: record.diagnostic,
      })
    }
  }

  const restoredIds = new Set(registrationsResult.filter((r) => r.state === 'registered').map((r) => r.id))
  return {
    restored: accepted
      .filter((entry) => restoredIds.has(entry.definition.id))
      .map((entry) => ({
        definition: entry.definition,
        revision: entry.revision,
        savedAt: new Date().toISOString(),
      })),
    registrations: registrationsResult,
    diagnostics,
  }
}
