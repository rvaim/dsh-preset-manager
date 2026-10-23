/**
 * Export a preset as shareable text.
 *
 * Read-only by construction: the definition is cloned before it is rendered, so
 * exporting cannot mutate the stored preset even by accident. Sensitive
 * findings are returned with the text so the UI can show them *before* the user
 * copies anything to the clipboard.
 */
import type { ExportResult, ValidationIssue } from '../../../shared/types.js'
import { exportPreset } from '../../../sharing/preset-exporter.js'
import type { ApplicationDeps } from '../deps.js'
import { readSource } from './clone-preset.js'

export interface ExportRequest {
  readonly id: string
}

export async function exportPresetUseCase(
  deps: ApplicationDeps,
  request: ExportRequest,
): Promise<ExportResult> {
  const definition = await readSource(deps, request.id)
  return exportPreset(definition)
}

/** The same text, plus the human-facing risk list the clipboard step shows. */
export async function sharePreset(
  deps: ApplicationDeps,
  request: ExportRequest,
): Promise<{ yaml: string; risks: readonly ValidationIssue[] }> {
  const exported = await exportPresetUseCase(deps, request)
  return { yaml: exported.yaml, risks: exported.risks }
}
