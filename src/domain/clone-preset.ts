/**
 * Copying an existing preset into a new managed one.
 *
 * A copy must be semantically identical to its source: every plugin row,
 * every nested group, every `isolate` realm, every `disabled` condition, and
 * every `!!js` expression survives untouched. The only permitted differences
 * are the identity fields the caller supplies.
 *
 * The source is never modified. Because definitions are cloned through JSON,
 * a copy cannot alias the source's objects.
 */
import type { PresetDefinition } from '../shared/types.js'
import { cloneDefinition, countPlugins } from './preset-model.js'

export interface CloneOptions {
  /** Identity for the copy. Must not collide with an existing preset. */
  newId: string
  /** Display name; defaults to `"<source name> 副本"`. */
  name?: string
  /** Description; defaults to the source description. */
  description?: string
  /** Sort order; defaults to the source order plus one, to sit beside it. */
  order?: number
}

/**
 * Build a copy of `source`.
 *
 * `order` is deliberately shifted rather than copied when the caller omits it:
 * two presets sharing an order sort by id, which would place a copy
 * unpredictably in the selector.
 */
export function clonePreset(
  source: PresetDefinition,
  options: CloneOptions,
): PresetDefinition {
  const copy = cloneDefinition(source)
  const sourceName = typeof source.name === 'string' && source.name !== '' ? source.name : source.id
  const order =
    options.order ??
    (typeof source.order === 'number' && Number.isFinite(source.order)
      ? source.order + 1
      : undefined)

  return {
    ...copy,
    id: options.newId,
    name: options.name ?? `${sourceName} 副本`,
    description: options.description ?? source.description,
    ...(order === undefined ? {} : { order }),
  }
}

/** Whether a copy preserved the source composition exactly. */
export function copyPreservesComposition(
  source: PresetDefinition,
  copy: PresetDefinition,
): boolean {
  return (
    JSON.stringify(source.plugins) === JSON.stringify(copy.plugins) &&
    countPlugins(source.plugins) === countPlugins(copy.plugins)
  )
}
