/**
 * Exporting a preset as shareable text.
 *
 * Export is read-only with respect to the user's data: it never rewrites the
 * stored preset, and it never strips or rewrites content. Sensitive findings
 * are returned as warnings so the UI can show them before the user copies.
 */
import type { PresetDefinition, ExportResult, ValidationIssue } from '../shared/types.js'
import { cloneDefinition, dumpPluginRows } from '../domain/preset-model.js'
import { dumpShareText } from './share-format.js'
import { sensitiveWarnings } from './sensitive-data-checker.js'

/**
 * Render a preset as versioned share YAML.
 *
 * @param definition - the preset to export; not modified.
 * @returns the share text plus any warnings worth showing before copying.
 */
export function exportPreset(definition: PresetDefinition): ExportResult {
  const snapshot = cloneDefinition(definition)
  const warnings = sensitiveWarnings(snapshot)
  return {
    yaml: dumpShareText(snapshot),
    risks: warnings,
  }
}

/**
 * Render only the plugin list as YAML — the shape DSH's own preset document
 * viewer shows, which is the most useful form for pasting one composition into
 * another preset.
 */
export function exportComposition(definition: PresetDefinition): ExportResult {
  const warnings: ValidationIssue[] = sensitiveWarnings(definition)
  return { yaml: dumpPluginRows(definition.plugins), risks: warnings }
}
