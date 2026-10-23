/**
 * Semantic differences between two preset definitions.
 *
 * Used before a save, so the user confirms what will actually change rather
 * than approving an opaque overwrite. Rows are matched by their `id` when
 * present and by module name plus occurrence otherwise, because a plugin row
 * may legitimately omit an id.
 */
import type {
  PresetDefinition,
  PresetDiff,
  PresetDiffField,
  PresetDiffRow,
  PresetPluginRow,
} from '../shared/types.js'
import { canonicalize, countPlugins, flattenPlugins } from './preset-model.js'

function label(row: PresetPluginRow, index: number): string {
  return typeof row.id === 'string' && row.id !== ''
    ? row.id
    : `${row.name}#${index + 1}`
}

/**
 * A key that identifies "the same plugin row" across two definitions.
 *
 * Ids are the author's stable handle and win outright. Without one, the module
 * name plus its occurrence index among same-named rows is the best available
 * identity: it keeps a reordered list from appearing as every-row-changed.
 */
function identityKeys(rows: readonly PresetPluginRow[]): string[] {
  const occurrences = new Map<string, number>()
  return flattenPlugins(rows).map(({ row }) => {
    if (typeof row.id === 'string' && row.id !== '') return `id:${row.id}`
    const seen = occurrences.get(row.name) ?? 0
    occurrences.set(row.name, seen + 1)
    return `name:${row.name}#${seen}`
  })
}

/** Compare metadata fields that a selector or settings page displays. */
function diffMetadata(
  before: PresetDefinition,
  after: PresetDefinition,
): PresetDiffField[] {
  const fields: PresetDiffField[] = []
  const compare = (field: keyof PresetDefinition): void => {
    const left = before[field]
    const right = after[field]
    if (left === right) return
    const render = (value: unknown): string | undefined =>
      value === undefined ? undefined : typeof value === 'string' ? value : String(value)
    fields.push({
      field,
      ...(render(left) === undefined ? {} : { before: render(left) }),
      ...(render(right) === undefined ? {} : { after: render(right) }),
    })
  }
  compare('name')
  compare('description')
  compare('order')
  return fields
}

/** Build the diff shown before a save is committed. */
export function diffPresets(
  before: PresetDefinition,
  after: PresetDefinition,
): PresetDiff {
  const beforeRows = flattenPlugins(before.plugins)
  const afterRows = flattenPlugins(after.plugins)
  const beforeKeys = identityKeys(before.plugins)
  const afterKeys = identityKeys(after.plugins)

  const beforeMap = new Map<string, PresetPluginRow>()
  beforeRows.forEach(({ row }, index) => {
    const key = beforeKeys[index]
    if (key !== undefined) beforeMap.set(key, row)
  })
  const afterMap = new Map<string, PresetPluginRow>()
  afterRows.forEach(({ row }, index) => {
    const key = afterKeys[index]
    if (key !== undefined) afterMap.set(key, row)
  })

  const added: PresetDiffRow[] = []
  const removed: PresetDiffRow[] = []
  const changed: PresetDiffRow[] = []
  let unchanged = 0

  afterRows.forEach(({ row }, index) => {
    const key = afterKeys[index]
    const previous = key === undefined ? undefined : beforeMap.get(key)
    const reference = label(row, index)
    if (previous === undefined) {
      added.push({ id: reference, name: row.name })
      return
    }
    if (canonicalize(previous) === canonicalize(row)) {
      unchanged += 1
      return
    }
    changed.push({ id: reference, name: row.name })
  })

  beforeRows.forEach(({ row }, index) => {
    const key = beforeKeys[index]
    if (key !== undefined && afterMap.has(key)) return
    removed.push({ id: label(row, index), name: row.name })
  })

  return {
    changedMetadata: diffMetadata(before, after),
    addedPlugins: added,
    removedPlugins: removed,
    changedPlugins: changed,
    unchangedPlugins: unchanged,
  }
}

/** Whether a diff contains anything at all. */
export function isEmptyDiff(diff: PresetDiff): boolean {
  return (
    diff.changedMetadata.length === 0 &&
    diff.addedPlugins.length === 0 &&
    diff.removedPlugins.length === 0 &&
    diff.changedPlugins.length === 0
  )
}

/** A one-line human summary, used in confirmations and history entries. */
export function describeDiff(diff: PresetDiff, pluginTotal: number): string {
  const parts: string[] = []
  if (diff.changedMetadata.length > 0) {
    parts.push(`元数据 ${diff.changedMetadata.map((f) => f.field).join('/')} 变更`)
  }
  if (diff.addedPlugins.length > 0) parts.push(`新增 ${diff.addedPlugins.length} 项`)
  if (diff.removedPlugins.length > 0) parts.push(`移除 ${diff.removedPlugins.length} 项`)
  if (diff.changedPlugins.length > 0) parts.push(`修改 ${diff.changedPlugins.length} 项`)
  if (parts.length === 0) return `无变更（共 ${pluginTotal || countPlugins([])} 项插件）`
  return parts.join('，') + `（共 ${pluginTotal} 项插件）`
}
