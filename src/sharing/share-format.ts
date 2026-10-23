/**
 * The versioned share format.
 *
 * A share document is a self-describing envelope so a future reader can
 * recognize and reject a format it does not understand, instead of
 * misinterpreting the payload. It intentionally excludes everything that is
 * local to one machine: the data directory, registration handles, history and
 * runtime state never leave the Host.
 */
import type { PresetDefinition, ShareDocument } from '../shared/types.js'
import {
  dumpPresetDocument,
  parsePluginRows,
  parsePresetDocument,
} from '../domain/preset-model.js'

/** Discriminator identifying one of these documents. */
export const SHARE_KIND = 'dsh-agent-preset-share'

/**
 * The only format version this build writes and accepts.
 *
 * Bump this only for a change a previous reader would misinterpret. Adding an
 * optional field that older readers ignore does not need a bump.
 */
export const SHARE_FORMAT_VERSION = 1

/** Build the envelope around a definition. */
export function buildShareDocument(definition: PresetDefinition): ShareDocument {
  return {
    kind: SHARE_KIND,
    formatVersion: SHARE_FORMAT_VERSION,
    preset: definition,
  }
}

/** Render a definition as share text, including the envelope. */
export function dumpShareText(definition: PresetDefinition): string {
  return dumpPresetDocument(buildShareDocument(definition) as unknown as PresetDefinition)
}

/** Why a share document was rejected, with a stable code. */
export type ShareParseFailure =
  | { reason: 'not-a-mapping' }
  | { reason: 'wrong-kind'; kind: unknown }
  | { reason: 'missing-version' }
  | { reason: 'unsupported-version'; version: unknown }
  | { reason: 'missing-preset' }
  | { reason: 'preset-not-a-mapping' }
  | { reason: 'yaml-syntax'; message: string }

export type ShareParseResult =
  | { ok: true; document: ShareDocument }
  | { ok: false; failure: ShareParseFailure }

/**
 * Interpret a parsed YAML value as a share document.
 *
 * Validation happens in a stable order — kind, then version, then payload —
 * so the most actionable diagnostic is the one the user sees. A version the
 * build cannot read is reported before the payload is examined, because the
 * payload's shape is unknown for that version.
 */
export function readShareValue(value: unknown): ShareParseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, failure: { reason: 'not-a-mapping' } }
  }
  const record = value as Record<string, unknown>
  if (record.kind !== SHARE_KIND) {
    return { ok: false, failure: { reason: 'wrong-kind', kind: record.kind } }
  }
  if (record.formatVersion === undefined) {
    return { ok: false, failure: { reason: 'missing-version' } }
  }
  if (record.formatVersion !== SHARE_FORMAT_VERSION) {
    return { ok: false, failure: { reason: 'unsupported-version', version: record.formatVersion } }
  }
  if (record.preset === undefined) {
    return { ok: false, failure: { reason: 'missing-preset' } }
  }
  if (typeof record.preset !== 'object' || record.preset === null || Array.isArray(record.preset)) {
    return { ok: false, failure: { reason: 'preset-not-a-mapping' } }
  }
  return {
    ok: true,
    document: {
      kind: SHARE_KIND,
      formatVersion: SHARE_FORMAT_VERSION,
      preset: record.preset as PresetDefinition,
    },
  }
}

/** Parse share text through the entry-list dialect, then interpret it. */
export function parseShareText(text: string): ShareParseResult {
  let parsed: unknown
  try {
    parsed = parsePresetDocument(text)
  } catch (error) {
    return {
      ok: false,
      failure: {
        reason: 'yaml-syntax',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
  return readShareValue(parsed)
}

/**
 * Parse a bare YAML document without the share envelope.
 *
 * Accepts two shapes a user may reasonably paste: the whole preset mapping, or
 * a bare list of plugin rows — which is exactly what DSH's own preset document
 * viewer shows.
 */
export function parseBarePreset(
  text: string,
): { ok: true; definition: PresetDefinition } | { ok: false; message: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, message: '内容为空' }
  try {
    if (trimmed.startsWith('-')) {
      const rows = parsePluginRows(trimmed)
      return { ok: true, definition: { id: '', plugins: rows } }
    }
    const parsed: unknown = parsePresetDocument(trimmed)
    if (Array.isArray(parsed)) {
      return { ok: true, definition: { id: '', plugins: parsed as PresetDefinition['plugins'] } }
    }
    return { ok: true, definition: parsed as PresetDefinition }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Parse a bare YAML list of plugin rows, for the advanced editor.
 *
 * Returns a structural error rather than throwing, because the advanced editor
 * reports problems inline while the user types.
 */
export function parseRowList(text: string): {
  ok: true
  rows: PresetDefinition['plugins']
} | {
  ok: false
  message: string
} {
  try {
    return { ok: true, rows: parsePluginRows(text.trim() === '' ? '[]' : text) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
