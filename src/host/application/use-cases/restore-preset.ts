/**
 * Restore a retained historical revision as the current one.
 *
 * The restored definition goes through the same apply path as any edit, so it
 * is validated and registered before it becomes current. The revision that was
 * current is archived by the repository, which means restoring a revision is
 * itself undoable.
 */
import type { MutationResult } from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import type { ApplicationDeps } from '../deps.js'
import { applyDefinition } from './apply-definition.js'

export interface RestoreRequest {
  readonly id: string
  readonly revision: string
  readonly expectedRevision?: string
}

export async function restorePreset(
  deps: ApplicationDeps,
  request: RestoreRequest,
): Promise<MutationResult> {
  const definition = await deps.repository.readHistory(request.id, request.revision)
  if (definition === undefined) {
    throw new ManagerError(
      ManagerErrorCode.presetNotFound,
      `找不到预设 "${request.id}" 的历史版本 ${request.revision}`,
    )
  }
  return applyDefinition(deps, definition, {
    reason: 'restore',
    ...(request.expectedRevision === undefined
      ? {}
      : { expectedRevision: request.expectedRevision }),
  })
}
