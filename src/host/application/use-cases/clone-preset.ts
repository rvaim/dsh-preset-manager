/**
 * Copy any readable preset into a new managed preset.
 *
 * The source may be built-in, from another plugin, or already managed. In every
 * case it is read, never modified: a copy is a new definition, and the only
 * differences from its source are the identity fields the caller supplied.
 */
import type { MutationResult, PresetDefinition } from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import { clonePreset } from '../../../domain/clone-preset.js'
import type { ApplicationDeps } from '../deps.js'
import { applyDefinition } from './apply-definition.js'

export interface CloneRequest {
  readonly sourceId: string
  readonly newId: string
  readonly name?: string
  readonly description?: string
}

export async function clonePresetUseCase(
  deps: ApplicationDeps,
  request: CloneRequest,
): Promise<MutationResult> {
  const source = await readSource(deps, request.sourceId)
  const copy = clonePreset(source, {
    newId: request.newId,
    ...(request.name === undefined ? {} : { name: request.name }),
    ...(request.description === undefined ? {} : { description: request.description }),
  })
  return applyDefinition(deps, copy, { reason: 'create' })
}

/**
 * Read a definition from the plugin's store, or from the runtime.
 *
 * A managed preset is read from the store because that is the definition the
 * user authored; a foreign preset is read from the runtime because the store
 * has no copy and `readDocument` is the only public way to see it.
 */
export async function readSource(
  deps: ApplicationDeps,
  id: string,
): Promise<PresetDefinition> {
  const managed = await deps.repository.get(id)
  if (managed !== undefined) return managed.definition
  const foreign = await deps.source.read(id)
  if (foreign === undefined) {
    throw new ManagerError(ManagerErrorCode.presetNotFound, `找不到预设：${id}`)
  }
  return foreign.definition
}
