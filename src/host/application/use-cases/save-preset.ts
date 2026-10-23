/**
 * Save an edited definition.
 *
 * Concurrency is handled with the revision the caller was looking at. When the
 * stored revision has moved on, the save is refused rather than applied: two
 * browser tabs editing one preset must not silently overwrite each other, and
 * a stale tab must learn that its view is out of date.
 */
import type { MutationResult, PresetDefinition } from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import { cloneDefinition } from '../../../domain/preset-model.js'
import type { RevisionReason } from '../../ports/preset-repository.js'
import type { ApplicationDeps } from '../deps.js'
import { applyDefinition } from './apply-definition.js'

export interface SaveRequest {
  readonly definition: PresetDefinition
  /** The revision the caller read; omission means "create or overwrite". */
  readonly expectedRevision?: string
  readonly reason?: Extract<RevisionReason, 'save' | 'import' | 'restore'>
}

export async function savePreset(
  deps: ApplicationDeps,
  request: SaveRequest,
): Promise<MutationResult> {
  const definition = cloneDefinition(request.definition)
  const stored = await deps.repository.get(definition.id)

  if (stored === undefined && request.expectedRevision !== undefined) {
    // An expected revision for a preset that is not stored means the caller is
    // editing something that no longer exists; creating it would be a surprise.
    throw new ManagerError(
      ManagerErrorCode.revisionConflict,
      `预设 "${definition.id}" 已不存在，请重新载入后再保存`,
    )
  }
  if (
    stored !== undefined &&
    request.expectedRevision !== undefined &&
    stored.revision !== request.expectedRevision
  ) {
    throw new ManagerError(
      ManagerErrorCode.revisionConflict,
      `预设 "${definition.id}" 已被其他页面修改，请重新载入后再保存`,
      [{ code: 'preset.revision', message: `当前版本：${stored.revision}` }],
    )
  }

  return applyDefinition(deps, definition, {
    reason: request.reason ?? 'save',
    ...(request.expectedRevision === undefined
      ? {}
      : { expectedRevision: request.expectedRevision }),
  })
}
