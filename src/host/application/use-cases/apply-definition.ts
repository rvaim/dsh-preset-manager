/**
 * The apply path shared by every mutation that produces a definition.
 *
 * Order is the whole point of this module, and it is deliberate:
 *
 *   1. validate structurally (cheap, catches a malformed edit),
 *   2. register in the runtime and read back the real activation health,
 *   3. only then persist the definition as the current revision.
 *
 * Registering before persisting is what keeps `presets/` an honest record of
 * what actually works. If the file were written first, a failed edit would be
 * resurrected on the next launch, and the user would have to discover the
 * failure by watching a session refuse to start. If instead the registration
 * fails, the file is left untouched and the previous revision keeps working.
 *
 * The reverse failure — the file write fails after a successful registration —
 * is compensated by putting the runtime back in line with whatever the file
 * still says, so the two never drift.
 */
import type {
  PresetDefinition,
  PresetSummary,
  MutationResult,
} from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import { cloneDefinition, countPlugins } from '../../../domain/preset-model.js'
import { revisionOf } from '../../../domain/preset-revision.js'
import { validatePreset } from '../../../domain/preset-validator.js'
import type { RevisionReason, StoredPreset } from '../../ports/preset-repository.js'
import { ownershipMap, type ApplicationDeps } from '../deps.js'

export async function applyDefinition(
  deps: ApplicationDeps,
  definition: PresetDefinition,
  options: { reason: RevisionReason; expectedRevision?: string },
): Promise<MutationResult> {
  const candidate = cloneDefinition(definition)
  const owned = await deps.repository.get(candidate.id)
  // The conflict check must exempt the preset being replaced: a preset the
  // manager already owns is not a collision with itself. `ownId` is derived
  // from the store rather than taken from the caller, so a caller cannot bypass
  // the check by asserting ownership it does not have.
  const report = validatePreset(candidate, {
    knownIds: await ownershipMap(deps),
    ...(owned === undefined ? {} : { ownId: candidate.id }),
  })
  if (!report.ok) {
    throw new ManagerError(
      ManagerErrorCode.presetInvalid,
      '预设配置校验未通过',
      report.errors.map(toIssue),
    )
  }

  const revision = revisionOf(candidate)
  const record = await deps.registrations.register(candidate, revision)
  if (record.state !== 'registered') {
    throw new ManagerError(
      ManagerErrorCode.activationBroken,
      `预设 "${candidate.id}" 注册后无法正常激活，已保留原有配置`,
      [
        {
          code: 'preset.activation',
          message: record.diagnostic ?? '未提供诊断信息',
        },
      ],
    )
  }

  let stored: StoredPreset
  try {
    stored = await deps.repository.save(candidate, options.reason, options.expectedRevision)
  } catch (error) {
    await compensateFileFailure(deps, candidate.id)
    throw error
  }

  return {
    ok: true,
    applied: true,
    preset: await summaryOf(deps, stored),
    errors: [],
    warnings: report.warnings,
  }
}

/**
 * Put the runtime back in line with the file after a persist failure.
 *
 * Without this, a registered preset would exist in memory but not on disk, and
 * a restart would silently drop it — the exact drift this design avoids.
 */
async function compensateFileFailure(deps: ApplicationDeps, id: string): Promise<void> {
  const onDisk = await deps.repository.get(id).catch(() => undefined)
  try {
    if (onDisk === undefined) {
      await deps.registrations.unregister(id)
      return
    }
    await deps.registrations.register(onDisk.definition, onDisk.revision)
  } catch (error) {
    deps.warn(
      `preset ${id}: could not restore the runtime after a failed write: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

/** Project a stored preset through the list projection, for the response. */
async function summaryOf(deps: ApplicationDeps, stored: StoredPreset): Promise<PresetSummary> {
  const rows = await deps.registrations.roster().catch(() => [])
  const found = rows.find((row) => row.id === stored.definition.id)
  if (found !== undefined) {
    return { ...found, pluginCount: countPlugins(stored.definition.plugins) }
  }
  return {
    id: stored.definition.id,
    ...(stored.definition.name === undefined ? {} : { name: stored.definition.name }),
    ...(stored.definition.description === undefined
      ? {}
      : { description: stored.definition.description }),
    ...(stored.definition.order === undefined ? {} : { order: stored.definition.order }),
    ownership: 'managed',
    registration: 'registered',
    isDefault: false,
    health: 'healthy',
    pluginCount: countPlugins(stored.definition.plugins),
  }
}

function toIssue(issue: {
  code: string
  message: string
  path?: string
  detail?: string
}): { code: string; message: string; path?: string; detail?: string } {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.path === undefined ? {} : { path: issue.path }),
    ...(issue.detail === undefined ? {} : { detail: issue.detail }),
  }
}
