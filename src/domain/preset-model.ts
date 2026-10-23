/**
 * The preset model: identity, revision hashing, and the Cordis YAML dialect.
 *
 * DSH declares presets in the Loader's entry-list YAML dialect, where a `!!js`
 * scalar is an expression evaluated at mount time. The manager must preserve
 * that dialect exactly — a preset copied from Standard keeps its `!!js`
 * platform conditions — so this module owns the one parser and dumper used
 * everywhere, and models expressions as inert `{ __jsExpr }` nodes.
 *
 * Parsing never evaluates an expression. Evaluation belongs to the Loader
 * inside the DSH runtime, at mount time, after the user confirmed.
 */
import yaml from 'js-yaml'
import type { LoaderExpression, PresetDefinition, PresetPluginRow } from '../shared/types.js'

/** Marker property of an unevaluated expression node. */
const JS_EXPR_KEY = '__jsExpr'

/** Recognize an inert expression node produced by the dialect parser. */
export function isLoaderExpression(value: unknown): value is LoaderExpression {
  return (
    typeof value === 'object' &&
    value !== null &&
    JS_EXPR_KEY in value &&
    typeof (value as Record<string, unknown>)[JS_EXPR_KEY] === 'string'
  )
}

/**
 * The `!!js` YAML type.
 *
 * `construct` deliberately returns an inert node rather than evaluating: a
 * share file is untrusted input, and evaluating it at parse time would run
 * arbitrary code before the user ever saw a preview.
 */
const jsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data: unknown) => typeof data === 'string',
  construct: (data: string) => ({ [JS_EXPR_KEY]: data }),
  predicate: isLoaderExpression,
  // js-yaml types `represent` as accepting `object`; the predicate above already
  // narrowed the runtime value, so the cast only restores what it lost.
  represent: (data: object) => (data as LoaderExpression)[JS_EXPR_KEY],
})

/** The entry-list schema: JSON scalars plus `!!js` expressions. */
export const entryListSchema = yaml.JSON_SCHEMA.extend(jsExprType)

/** Options that make dumps stable and readable for humans and diffs. */
const DUMP_OPTIONS: yaml.DumpOptions = {
  schema: entryListSchema,
  noRefs: true,
  lineWidth: -1,
  noCompatMode: true,
}

/** Parse an entry list (the plugin rows of a preset). */
export function parsePluginRows(text: string): PresetPluginRow[] {
  const parsed = yaml.load(text, { schema: entryListSchema })
  if (!Array.isArray(parsed)) {
    throw new TypeError('the composition must be a top-level list of plugin rows')
  }
  return parsed as PresetPluginRow[]
}

/** Parse one complete preset document (`id`, `name`, ... `plugins`). */
export function parsePresetDocument(text: string): PresetDefinition {
  const parsed = yaml.load(text, { schema: entryListSchema })
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('a preset document must be a mapping')
  }
  return parsed as PresetDefinition
}

/** Render plugin rows in the dialect, preserving `!!js` nodes verbatim. */
export function dumpPluginRows(rows: readonly PresetPluginRow[]): string {
  return yaml.dump(rows, DUMP_OPTIONS)
}

/** Render a complete preset document. */
export function dumpPresetDocument(definition: PresetDefinition): string {
  return yaml.dump(definition, DUMP_OPTIONS)
}

/**
 * Canonical JSON for hashing and equality.
 *
 * Keys are sorted so that two semantically identical definitions always hash
 * the same, regardless of the property order they were authored in. Arrays
 * keep their order, because a preset's plugin order is meaningful.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value === null || typeof value !== 'object') return value
  if (isLoaderExpression(value)) return { [JS_EXPR_KEY]: value.__jsExpr }
  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) sorted[key] = sortDeep(source[key])
  return sorted
}

/** Deep clone through the canonical form, so callers cannot mutate a source. */
export function cloneDefinition(definition: PresetDefinition): PresetDefinition {
  return JSON.parse(JSON.stringify(definition)) as PresetDefinition
}

/** A plugin row's stable label for diagnostics and diffs. */
export function rowLabel(row: PresetPluginRow, index: number): string {
  if (typeof row.id === 'string' && row.id !== '') return row.id
  return `${row.name}#${index + 1}`
}

/** Whether a row is a structural group rather than a plugin. */
export function isGroupRow(row: PresetPluginRow): boolean {
  return row.group === true
}

/** Count plugin rows that actually mount something, groups excluded. */
export function countPlugins(rows: readonly PresetPluginRow[]): number {
  let total = 0
  for (const row of rows) {
    if (isGroupRow(row)) {
      const nested = Array.isArray(row.config) ? (row.config as PresetPluginRow[]) : []
      total += countPlugins(nested)
      continue
    }
    total += 1
  }
  return total
}

/** Flatten group rows into the plugins they contribute, groups excluded. */
export function flattenPlugins(
  rows: readonly PresetPluginRow[],
  outerDisabled = false,
): { row: PresetPluginRow; index: number; disabled: boolean }[] {
  const found: { row: PresetPluginRow; index: number; disabled: boolean }[] = []
  rows.forEach((row, index) => {
    const disabled = outerDisabled || row.disabled === true
    if (isGroupRow(row)) {
      const nested = Array.isArray(row.config) ? (row.config as PresetPluginRow[]) : []
      found.push(...flattenPlugins(nested, disabled))
      return
    }
    found.push({ row, index, disabled })
  })
  return found
}

/**
 * Every `!!js` expression in a definition, in document order.
 *
 * Used by the sensitivity check to warn that an imported preset carries
 * executable expressions the user should review before mounting.
 */
export function collectExpressions(definition: PresetDefinition): {
  path: string
  expression: string
}[] {
  const found: { path: string; expression: string }[] = []
  const visit = (value: unknown, path: string): void => {
    if (isLoaderExpression(value)) {
      found.push({ path, expression: value.__jsExpr })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (value === null || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      visit(nested, path === '' ? key : `${path}.${key}`)
    }
  }
  visit(definition.plugins, 'plugins')
  return found
}
