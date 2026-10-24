import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { BUNDLED_PRESETS, type BundledPrompts } from '../../shared/bundled-presets.js'

/** Local npm resources only: neither activation nor prompt rendering uses the network. */
export async function loadBundledPrompts(
  root = new URL('../../../resources/', import.meta.url),
): Promise<BundledPrompts> {
  const provenance = JSON.parse(await readFile(new URL('codex-original/provenance.json', root), 'utf8')) as {
    source: { commit: string }
    files: { local_path: string; sha256: string; bytes: number }[]
  }
  const expected = provenance.files.find((file) => file.local_path === 'prompt.md')
  if (!/^[a-f0-9]{40}$/.test(provenance.source.commit) || expected === undefined || !/^[a-f0-9]{64}$/.test(expected.sha256)) {
    throw new Error('Codex prompt provenance is incomplete')
  }
  const entries = await Promise.all(BUNDLED_PRESETS.map(async (preset) => {
    const bytes = await readFile(new URL(preset.promptFile, root))
    const text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`${preset.id} prompt is not valid UTF-8`)
    if (preset.id === 'codex-original' && (
      bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256
    )) throw new Error('Codex prompt does not match its pinned SHA-256')
    return [preset.id, text] as const
  }))
  return Object.fromEntries(entries) as unknown as BundledPrompts
}
