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
import { validatePresetId } from '../../../domain/preset-validator.js'
import type { ApplicationDeps } from '../deps.js'
import { applyDefinition } from './apply-definition.js'

export interface CloneRequest {
  readonly sourceId: string
  readonly newId?: string
  readonly name?: string
  readonly description?: string
}

export async function clonePresetUseCase(
  deps: ApplicationDeps,
  request: CloneRequest,
): Promise<MutationResult> {
  const source = await readSource(deps, request.sourceId)
  // This runs inside PresetManagerService's serialized mutation. Every caller
  // sees the latest allocation, even when several pages share an old snapshot.
  const [known, stored] = await Promise.all([deps.source.knownIds(), deps.repository.list()])
  const ids = new Set([...known.keys(), ...stored.map((entry) => entry.definition.id)])
  let newId = request.newId
  let name = request.name
  if (newId === undefined) {
    let base = source.id.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'preset'
    if (validatePresetId(`${base.slice(0, 59)}-copy`).length > 0) base = 'preset'
    const names = new Set(stored.map((entry) => entry.definition.name))
    const baseName = name ?? `${source.name || source.id} 副本`
    let serial = 1
    do {
      const suffix = serial === 1 ? '-copy' : `-copy-${serial}`
      newId = `${base.slice(0, 64 - suffix.length)}${suffix}`
      name = `${baseName}${serial === 1 ? '' : ` ${serial}`}`
      serial += 1
    } while (ids.has(newId) || names.has(name))
  } else if (ids.has(newId)) {
    throw new ManagerError(ManagerErrorCode.presetConflict, `预设 ID「${newId}」已存在，复制不会覆盖现有预设。`)
  }
  const copy = clonePreset(source, {
    newId,
    ...(name === undefined ? {} : { name }),
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
