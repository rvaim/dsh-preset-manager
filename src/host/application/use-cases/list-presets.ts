/**
 * List the presets the user can act on, as one snapshot.
 *
 * The list is assembled from three sources and must stay honest about all of
 * them: the runtime roster (what is actually published), the plugin's own store
 * (what the user owns), and DSH's selected default. A stored preset that failed
 * to register is still listed — hiding it would make a broken file look deleted
 * and invite the user to re-create it.
 */
import type {
  ManagerSnapshot,
  PresetSummary,
  ValidationIssue,
} from '../../../shared/types.js'
import { countPlugins } from '../../../domain/preset-model.js'
import type { StoredPreset } from '../../ports/preset-repository.js'
import { isBundledPreset, type ApplicationDeps } from '../deps.js'

export interface ListOptions {
  readonly phase: ManagerSnapshot['phase']
  readonly diagnostics: readonly ValidationIssue[]
  readonly busy: boolean
}

export async function listPresets(
  deps: ApplicationDeps,
  options: ListOptions,
): Promise<ManagerSnapshot> {
  const [runtimeRows, stored, defaultId, disabled] = await Promise.all([
    deps.registrations.roster(),
    deps.repository.list(),
    deps.defaultPresetId().catch(() => undefined),
    deps.repository.disabledPresetIds(),
  ])

  const storedById = new Map<string, StoredPreset>(
    stored.map((entry) => [entry.definition.id, entry]),
  )
  const seen = new Set<string>()
  const summaries: PresetSummary[] = []

  for (const row of runtimeRows) {
    seen.add(row.id)
    const managed = storedById.get(row.id)
    const bundled = deps.bundled.ids.includes(row.id) && deps.bundled.holds(row.id)
    // A runtime row is only labelled `builtin` when a shipped bundle declares
    // it; anything else the manager does not own came from another plugin.
    const ownership: PresetSummary['ownership'] =
      managed !== undefined
        ? 'managed'
        : bundled
          ? 'builtin'
          : row.ownership === 'managed'
            ? 'third-party'
            : row.ownership

    summaries.push({
      ...row,
      ownership,
      ...(managed !== undefined || bundled ? { canToggle: true } : {}),
      ...(disabled.has(row.id) ? { enabled: false } : {}),
      registration: managed !== undefined ? 'registered' : row.registration,
      isDefault: row.id === defaultId,
      pluginCount:
        managed === undefined ? row.pluginCount : countPlugins(managed.definition.plugins),
    })
  }

  for (const entry of stored) {
    if (seen.has(entry.definition.id)) continue
    const record = deps.registrations.record(entry.definition.id)
    const isDisabled = disabled.has(entry.definition.id)
    summaries.push({
      id: entry.definition.id,
      ...(entry.definition.name === undefined ? {} : { name: entry.definition.name }),
      ...(entry.definition.description === undefined
        ? {}
        : { description: entry.definition.description }),
      ...(entry.definition.order === undefined ? {} : { order: entry.definition.order }),
      ownership: 'managed',
      canToggle: true,
      ...(isDisabled ? { enabled: false } : {}),
      registration: isDisabled ? 'not-registered' : record?.state === 'failed' ? 'failed' : 'not-registered',
      isDefault: entry.definition.id === defaultId,
      health: isDisabled ? 'unchecked' : record?.state === 'failed' ? 'broken' : 'unchecked',
      ...(isDisabled || record?.diagnostic === undefined ? {} : { broken: record.diagnostic }),
      pluginCount: countPlugins(entry.definition.plugins),
    })
  }

  // A disabled bundled preset is absent from the runtime roster by design. It
  // remains listable so it can be viewed, copied, exported, or re-enabled.
  for (const id of deps.bundled.ids) {
    if (seen.has(id) || !isBundledPreset(deps, id) || !disabled.has(id)) continue
    const definition = deps.bundled.definition(id)
    if (definition === undefined) continue
    seen.add(id)
    summaries.push({
      id,
      ...(definition.name === undefined ? {} : { name: definition.name }),
      ...(definition.description === undefined ? {} : { description: definition.description }),
      ...(definition.order === undefined ? {} : { order: definition.order }),
      ownership: 'builtin',
      canToggle: true,
      enabled: false,
      registration: 'not-registered',
      isDefault: id === defaultId,
      health: 'unchecked',
      pluginCount: countPlugins(definition.plugins),
    })
  }

  summaries.sort(compareSummaries)

  return {
    phase: options.phase,
    presets: summaries,
    dataDirectory: deps.repository.directory,
    diagnostics: options.diagnostics,
    ...(defaultId === undefined ? {} : { defaultPresetId: defaultId }),
    busy: options.busy,
  }
}

/** Order the list the way DSH orders its own selector: `order`, then id. */
function compareSummaries(left: PresetSummary, right: PresetSummary): number {
  const leftOrder = left.order ?? Number.POSITIVE_INFINITY
  const rightOrder = right.order ?? Number.POSITIVE_INFINITY
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return left.id.localeCompare(right.id)
}
