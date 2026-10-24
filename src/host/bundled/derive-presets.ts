import { cloneDefinition, isGroupRow, isLoaderExpression } from '../../domain/preset-model.js'
import { PERSONA_MODULE } from '../../domain/persona-editor.js'
import { BUNDLED_PRESETS, type BundledPrompts } from '../../shared/bundled-presets.js'
import type { PresetDefinition, PresetPluginRow } from '../../shared/types.js'

/** One `{{...}}` token of the DSH Persona prefix template. */
const TEMPLATE_TOKEN = /\{\{([^{}]*)\}\}/g

/** Derive from the running Standard declaration, preserving its entire composition. */
export function deriveBundledPresets(
  standard: PresetDefinition,
  prompts: BundledPrompts,
): PresetDefinition[] {
  if (standard.id !== 'standard') throw new Error('bundled presets require the Standard declaration')
  // Persona currently always interpolates its prefix. Each declaration names the
  // tokens its own text may carry; nothing is escaped, rewritten or silently
  // substituted, and an unnamed token is refused instead of rendering as text.
  const derivedPresets = BUNDLED_PRESETS.filter((preset) => !('definitionFile' in preset))
  for (const preset of derivedPresets) {
    const allowed = new Set<string>(preset.templateVariables)
    const unexpected = [...prompts[preset.id].matchAll(TEMPLATE_TOKEN)]
      .some((match) => match[1] === undefined || !allowed.has(match[1]))
    if (!unexpected) continue
    if (allowed.size === 0) {
      throw new Error(`${preset.englishName} prompt contains a DSH template delimiter; refusing to interpolate the upstream original`)
    }
    throw new Error(`${preset.englishName} contains an unexpected prompt variable`)
  }

  return derivedPresets.map((preset) => {
    const copy = cloneDefinition(standard)
    const personas: PresetPluginRow[] = []
    const visit = (rows: readonly PresetPluginRow[]): void => {
      for (const row of rows) {
        if (isGroupRow(row)) {
          if (!Array.isArray(row.config)) throw new Error('Standard has a non-literal plugin group')
          visit(row.config as PresetPluginRow[])
        } else if (row.name === PERSONA_MODULE) personas.push(row)
      }
    }
    visit(copy.plugins)
    if (personas.length !== 1) {
      throw new Error(`Standard must declare exactly one Persona, found ${personas.length}`)
    }
    const persona = personas[0]!
    if (typeof persona.config !== 'object' || persona.config === null || Array.isArray(persona.config) || isLoaderExpression(persona.config)) {
      throw new Error('Standard Persona config must be a literal object')
    }
    // The sole composition change: preserve suffix, complete, runtime context,
    // ordering, groups, expressions, isolation and all unknown configuration.
    ;(persona.config as Record<string, unknown>).prefix = prompts[preset.id]
    return { ...copy, id: preset.id, name: preset.name, description: preset.description }
  })
}
