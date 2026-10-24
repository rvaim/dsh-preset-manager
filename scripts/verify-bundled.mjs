/** Check the actual npm tarball, including offline resource resolution from its unpacked layout. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const base = resolve(tmpdir())
const temporary = await mkdtemp(join(base, 'dshpm-pack-'))
try {
  const result = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }))[0]
  assert.equal(basename(result.filename), result.filename)
  const names = new Set(result.files.map((file) => file.path))
  const resources = [
    'standard-efficient/prefix.md',
    'codex-original/prompt.md', 'codex-original/provenance.json',
    'codex-original/LICENSE', 'codex-original/NOTICE', 'codex-original/SOURCE.md',
  ]
  const extracted = join(temporary, 'unpacked')
  await mkdir(extracted)
  execFileSync('tar', ['-xzf', join(temporary, result.filename), '-C', extracted])
  const packedRoot = join(extracted, 'package')
  for (const resource of resources) {
    const relative = `resources/${resource}`
    assert.ok(names.has(relative), `npm tarball is missing ${relative}`)
    assert.deepEqual(await readFile(join(packedRoot, relative)), await readFile(join(root, relative)))
  }
  const provenance = JSON.parse(await readFile(join(packedRoot, 'resources/codex-original/provenance.json'), 'utf8'))
  assert.match(provenance.source.commit, /^[a-f0-9]{40}$/)
  assert.equal(provenance.source.repository, 'openai/codex')
  for (const file of provenance.files) {
    const bytes = await readFile(join(packedRoot, 'resources/codex-original', file.local_path))
    assert.equal(bytes.length, file.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
  }
  const { loadBundledPrompts } = await import(pathToFileURL(join(packedRoot, 'dist/host/bundled/local-prompts.js')).href)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('packaged prompts must not use the network') }
  try {
    const prompts = await loadBundledPrompts()
    assert.equal(prompts['codex-original'], await readFile(join(root, 'resources/codex-original/prompt.md'), 'utf8'))
    assert.equal(prompts['standard-efficient'], await readFile(join(root, 'resources/standard-efficient/prefix.md'), 'utf8'))
    assert.equal(prompts['codex-original'].includes('{{'), false)
    assert.deepEqual([...prompts['standard-efficient'].matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1]), ['model'])
  } finally {
    globalThis.fetch = originalFetch
  }
  console.log('PASS  actual npm tarball contains both complete prompt resources, provenance, LICENSE and NOTICE')
  console.log('PASS  packed upstream files match their pinned byte lengths and SHA-256 digests')
  console.log('PASS  unpacked Host loads exact local resources offline without template collisions')
} finally {
  const target = resolve(temporary)
  assert.equal(dirname(target), base)
  assert.ok(basename(target).startsWith('dshpm-pack-'))
  await rm(target, { recursive: true, force: true })
}
