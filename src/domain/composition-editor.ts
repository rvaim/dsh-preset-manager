/**
 * Path-based editing of complete Cordis compositions.
 *
 * A path indexes `plugins`, then the `config` list of each structural group.
 * Names and ids need not be unique. Read helpers expose readonly source rows;
 * write helpers clone the entire definition and any supplied row before editing.
 * Loader expressions and unknown JSON fields stay inert and are preserved.
 */
import type { PresetDefinition, PresetPluginRow } from '../shared/types.js'
import { cloneDefinition, isGroupRow } from './preset-model.js'

/** Zero-based row indices from the root plugin list through nested groups. */
export type CompositionRowPath = readonly number[]

export interface CompositionRow {
  readonly path: number[]
  readonly row: PresetPluginRow
  /** Root rows have depth zero. */
  readonly depth: number
}

export interface CompositionMoveResult {
  readonly definition: PresetDefinition
  /** The moved row's new path; its parent never changes. */
  readonly path: number[]
}

/** List groups and plugins in document order, descending only into groups. */
export function listCompositionRows(definition: PresetDefinition): CompositionRow[] {
  const found: CompositionRow[] = []
  const visit = (rows: readonly PresetPluginRow[], parentPath: CompositionRowPath): void => {
    rows.forEach((row, index) => {
      const path = [...parentPath, index]
      assertRow(row, path)
      found.push({ path, row, depth: path.length - 1 })
      if (isGroupRow(row)) visit(groupRows(row, path), path)
    })
  }
  visit(definition.plugins, [])
  return found
}

/** Read exactly one row. Empty, malformed, or unresolved paths throw an Error. */
export function getCompositionRow(
  definition: PresetDefinition,
  path: CompositionRowPath,
): PresetPluginRow {
  return locateRow(definition, path).row
}

/** Replace the whole selected row, including its config and metadata. */
export function replaceCompositionRow(
  definition: PresetDefinition,
  path: CompositionRowPath,
  row: PresetPluginRow,
): PresetDefinition {
  const copy = cloneDefinition(definition)
  const location = locateRow(copy, path)
  // Every mutable array below belongs to the fresh clone, never the source.
  const rows = location.rows as PresetPluginRow[]
  rows[location.index] = cloneRow(row)
  return copy
}

/**
 * Append to the root when parentPath is undefined, or to a specific group.
 * An empty path is invalid; a supplied parent must have a group config list.
 */
export function appendCompositionRow(
  definition: PresetDefinition,
  parentPath: CompositionRowPath | undefined,
  row: PresetPluginRow,
): PresetDefinition {
  const copy = cloneDefinition(definition)
  const rows = (
    parentPath === undefined
      ? copy.plugins
      : groupRows(getCompositionRow(copy, parentPath), parentPath)
  ) as PresetPluginRow[]
  rows.push(cloneRow(row))
  return copy
}

/** Remove one complete row; removing a group also removes all its descendants. */
export function removeCompositionRow(
  definition: PresetDefinition,
  path: CompositionRowPath,
): PresetDefinition {
  const copy = cloneDefinition(definition)
  const location = locateRow(copy, path)
  const rows = location.rows as PresetPluginRow[]
  rows.splice(location.index, 1)
  return copy
}

/** Move one position among siblings. Crossing either list boundary throws. */
export function moveCompositionRow(
  definition: PresetDefinition,
  path: CompositionRowPath,
  delta: -1 | 1,
): CompositionMoveResult {
  if (delta !== -1 && delta !== 1) {
    throw new Error('Invalid composition move: delta must be -1 or 1')
  }
  const copy = cloneDefinition(definition)
  const location = locateRow(copy, path)
  const destination = location.index + delta
  if (destination < 0 || destination >= location.rows.length) {
    throw invalidPath(path, 'cannot move beyond the sibling list boundary')
  }
  const rows = location.rows as PresetPluginRow[]
  rows.splice(location.index, 1)
  rows.splice(destination, 0, location.row)
  return {
    definition: copy,
    path: [...path.slice(0, -1), destination],
  }
}

interface RowLocation {
  readonly rows: readonly PresetPluginRow[]
  readonly index: number
  readonly row: PresetPluginRow
}

function locateRow(definition: PresetDefinition, path: CompositionRowPath): RowLocation {
  assertPath(path)
  let rows = definition.plugins
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth]!
    const row = rows[index]
    if (row === undefined) {
      throw invalidPath(path, `index ${index} at depth ${depth} does not exist`)
    }
    assertRow(row, path.slice(0, depth + 1))
    if (depth === path.length - 1) return { rows, index, row }
    rows = groupRows(row, path.slice(0, depth + 1))
  }
  // assertPath rejects an empty path, so the loop always returns or throws.
  throw invalidPath(path, 'no row selected')
}

function groupRows(row: PresetPluginRow, path: CompositionRowPath): readonly PresetPluginRow[] {
  if (!isGroupRow(row)) throw invalidPath(path, 'row is not a structural group')
  if (!Array.isArray(row.config)) {
    throw invalidPath(path, 'group config must be a list of rows')
  }
  return row.config as PresetPluginRow[]
}

function cloneRow(row: PresetPluginRow): PresetPluginRow {
  return cloneDefinition({ id: 'composition-row', plugins: [row] }).plugins[0]!
}

function assertPath(path: CompositionRowPath): void {
  if (!Array.isArray(path) || path.length === 0) {
    throw invalidPath(path, 'expected a non-empty array of row indices')
  }
  for (const index of path) {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw invalidPath(path, 'row indices must be non-negative safe integers')
    }
  }
}

function assertRow(row: PresetPluginRow, path: CompositionRowPath): void {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw invalidPath(path, 'target is not a composition row')
  }
}

function invalidPath(path: CompositionRowPath, reason: string): Error {
  return new Error(`Invalid composition path ${JSON.stringify(path)}: ${reason}`)
}
