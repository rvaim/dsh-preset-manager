import { cloneDefinition, isGroupRow, isLoaderExpression } from '../../domain/preset-model.js'
import { PERSONA_MODULE } from '../../domain/persona-editor.js'
import { BUNDLED_PRESETS, type BundledPrompts } from '../../shared/bundled-presets.js'
import type { PresetDefinition, PresetPluginRow } from '../../shared/types.js'

/** Derive from the running Standard declaration, preserving its entire composition. */
export function deriveBundledPresets(
  standard: PresetDefinition,
  prompts: BundledPrompts,
): PresetDefinition[] {
  if (standard.id !== 'standard') throw new Error('bundled presets require the Standard declaration')
  // Persona currently always interpolates its prefix. Do not escape, rewrite or
  // silently substitute any part of the pinned upstream text.
  if (prompts['codex-original'].includes('{{')) {
    throw new Error('Codex prompt contains a DSH template delimiter; refusing to interpolate the upstream original')
  }
  if ([...prompts['standard-efficient'].matchAll(/\{\{([^{}]*)\}\}/g)].some((match) => match[1] !== 'model')) {
    throw new Error('Standard Efficient contains an unexpected prompt variable')
  }

  return BUNDLED_PRESETS.map((preset) => {
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
