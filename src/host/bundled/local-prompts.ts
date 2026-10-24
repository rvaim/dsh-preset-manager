import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BUNDLED_PRESETS, type BundledPrompts } from '../../shared/bundled-presets.js'
import type { PresetDefinition } from '../../shared/types.js'
import { validatePreset } from '../../domain/preset-validator.js'
import { parseShareText } from '../../sharing/share-format.js'

/** One loaded resource: prompt text, plus a complete document when the catalog ships one. */
type LoadedResource = { id: string; prompt: string; definition?: PresetDefinition }

/** Local npm resources only: neither activation nor prompt rendering uses the network. */
export async function loadBundledResources(
  root = new URL('../../../resources/', import.meta.url),
): Promise<{ prompts: BundledPrompts; definitions: PresetDefinition[] }> {
  const provenance = JSON.parse(await readFile(new URL('codex-original/provenance.json', root), 'utf8')) as {
    source: { commit: string }
    files: { local_path: string; sha256: string; bytes: number }[]
  }
  const expected = provenance.files.find((file) => file.local_path === 'prompt.md')
  if (!/^[a-f0-9]{40}$/.test(provenance.source.commit) || expected === undefined || !/^[a-f0-9]{64}$/.test(expected.sha256)) {
    throw new Error('Codex prompt provenance is incomplete')
  }
  const entries: LoadedResource[] = await Promise.all(BUNDLED_PRESETS.map(async (preset) => {
    const file = 'definitionFile' in preset ? preset.definitionFile : preset.promptFile
    const bytes = await readFile(new URL(file, root))
    const text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`${preset.id} resource is not valid UTF-8`)
    if ('definitionFile' in preset) {
      const provenance = JSON.parse(await readFile(new URL(preset.provenanceFile, root), 'utf8')) as {
        document: { bytes: number; sha256: string }
        personaPrefix: { bytes: number; sha256: string }
        userOriginal?: { file: string; bytes: number; sha256: string }
        personaAddition: { file: string; bytes: number; sha256: string }
      }
      if (bytes.length !== provenance.document.bytes || createHash('sha256').update(bytes).digest('hex') !== provenance.document.sha256) {
        throw new Error(`${preset.id} bundled document does not match its recorded SHA-256`)
      }
      const parsed = parseShareText(text)
      if (!parsed.ok) throw new Error(`${preset.id} bundled share document is invalid: ${parsed.failure.reason}`)
      const definition = parsed.document.preset
      const report = validatePreset(definition)
      if (!report.ok) throw new Error(`${preset.id} bundled preset is invalid: ${report.errors.map((issue) => issue.message).join('; ')}`)
      if (definition.id !== preset.id || definition.name !== preset.name || definition.description !== preset.description) {
        throw new Error(`${preset.id} bundled document identity differs from its catalog`)
      }
      const persona = definition.plugins.find((row) => row.id === 'persona' && row.name === '@deepseek-ai/dsh-persona')
      const prefix = (persona?.config as { prefix?: unknown } | undefined)?.prefix
      if (typeof prefix !== 'string') throw new Error(`${preset.id} bundled document is missing its literal Persona prefix`)
      if (Buffer.byteLength(prefix, 'utf8') !== provenance.personaPrefix.bytes || createHash('sha256').update(prefix).digest('hex') !== provenance.personaPrefix.sha256) {
        throw new Error(`${preset.id} Persona prefix does not match its recorded SHA-256`)
      }
      if (prefix.includes('{{')) throw new Error(`${preset.id} bundled document contains an undeclared Persona template delimiter`)
      // The user-authored text and the added section are separate resources, so
      // "the original is still intact" is a checkable invariant rather than a
      // claim: removing the added section must reproduce the original exactly.
      // An edit anywhere in the user's text breaks the round trip and is refused.
      if (provenance.userOriginal !== undefined) {
        const read = async (spec: { file: string; bytes: number; sha256: string }, what: string): Promise<string> => {
          const raw = await readFile(new URL(spec.file, root))
          if (raw.length !== spec.bytes || createHash('sha256').update(raw).digest('hex') !== spec.sha256) {
            throw new Error(`${preset.id} ${what} does not match its recorded SHA-256`)
          }
          const value = raw.toString('utf8')
          if (!Buffer.from(value, 'utf8').equals(raw)) throw new Error(`${preset.id} ${what} is not valid UTF-8`)
          if (value.includes('{{')) throw new Error(`${preset.id} ${what} contains a template delimiter`)
          return value
        }
        const original = await read(provenance.userOriginal, 'user-supplied Persona')
        const addition = await read(provenance.personaAddition, 'added Persona section')
        const restored = prefix.replace(addition, '')
        if (restored === prefix) throw new Error(`${preset.id} shipped Persona no longer contains the added section`)
        if (restored !== original) {
          throw new Error(`${preset.id} user-supplied Persona text was modified after the addition`)
        }
      }
      return { id: preset.id, prompt: prefix, definition }
    }
    if (preset.id === 'codex-original' && (
      bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )) throw new Error('Codex prompt does not match its pinned SHA-256')
    return { id: preset.id, prompt: text }
  }))
  return {
    prompts: Object.fromEntries(entries.map((entry) => [entry.id, entry.prompt])) as unknown as BundledPrompts,
    definitions: entries
      .map((entry) => entry.definition)
      .filter((definition): definition is PresetDefinition => definition !== undefined),
  }
}

export async function loadBundledPrompts(root?: URL): Promise<BundledPrompts> {
  return (await loadBundledResources(root)).prompts
}
