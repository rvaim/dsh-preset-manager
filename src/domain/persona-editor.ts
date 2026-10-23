/**
 * Persona editing as a projection over the preset's plugin rows.
 *
 * The Persona editor edits four fields of one plugin's config. Modelling it
 * as a projection — read the fields out, write them back onto a copy — is
 * what guarantees the editor can never disturb any other plugin's
 * configuration: untouched rows are carried through by structural sharing of
 * the original clone, and only the persona row is rewritten.
 */
import type { PresetDefinition, PresetPluginRow } from '../shared/types.js'
import { cloneDefinition } from './preset-model.js'

/** The module name DSH's persona plugin publishes under. */
export const PERSONA_MODULE = '@deepseek-ai/dsh-persona'

/** The editable persona surface. */
export interface PersonaFields {
  prefix: string
  suffix: string
  /** True when the persona replaces the built-in prompt rather than adding to it. */
  complete: boolean
}

/** Which plugin row of a preset is the persona, by index, or undefined. */
export function personaRowIndex(rows: readonly PresetPluginRow[]): number | undefined {
  const index = rows.findIndex((row) => row.name === PERSONA_MODULE)
  return index < 0 ? undefined : index
}

/**
 * Read the persona fields out of a definition.
 *
 * A preset with no persona row yields empty defaults rather than an error:
 * such a preset is unusual but legal, and the editor can then add one.
 */
export function readPersona(definition: PresetDefinition): {
  fields: PersonaFields
  present: boolean
  rowIndex?: number
} {
  const rowIndex = personaRowIndex(definition.plugins)
  if (rowIndex === undefined) {
    return { fields: { prefix: '', suffix: '', complete: false }, present: false }
  }
  const config = asRecord(definition.plugins[rowIndex]?.config)
  return {
    fields: {
      prefix: typeof config.prefix === 'string' ? config.prefix : '',
      suffix: typeof config.suffix === 'string' ? config.suffix : '',
      complete: config.complete === true,
    },
    present: true,
    rowIndex,
  }
}

/**
 * Return a copy of `definition` with the persona fields replaced.
 *
 * Everything else is preserved byte-for-byte: `complete` is written only when
 * the caller sets it, other persona config keys (such as a model override)
 * survive, and every other plugin row is untouched. When no persona row
 * exists one is appended, which is the only way this function adds a row.
 */
export function writePersona(
  definition: PresetDefinition,
  fields: Partial<PersonaFields>,
): PresetDefinition {
  const copy = cloneDefinition(definition)
  const rows = [...copy.plugins]
  const rowIndex = personaRowIndex(rows)

  if (rowIndex === undefined) {
    if (fields.prefix === undefined && fields.suffix === undefined && fields.complete === undefined) {
      return copy
    }
    const created: PresetPluginRow & { config: Record<string, unknown> } = {
      id: 'persona',
      name: PERSONA_MODULE,
      config: {
        ...(fields.prefix === undefined ? {} : { prefix: fields.prefix }),
        ...(fields.suffix === undefined ? {} : { suffix: fields.suffix }),
        complete: fields.complete === true,
      },
    }
    return { ...copy, plugins: [...rows, created] }
  }

  const existing = rows[rowIndex]
  if (existing === undefined) return copy
  const config = { ...asRecord(existing.config) }
  if (fields.prefix !== undefined) config.prefix = fields.prefix
  if (fields.suffix !== undefined) config.suffix = fields.suffix
  if (fields.complete !== undefined) config.complete = fields.complete

  rows[rowIndex] = { ...existing, config }
  return { ...copy, plugins: rows }
}

/** Whether the persona is the additive form DSH treats as the default. */
export function isAdditivePersona(fields: PersonaFields): boolean {
  return fields.complete === false
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}
