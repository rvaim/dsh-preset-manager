/** Check the actual npm tarball, including offline resource resolution from its unpacked layout. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
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
    'redteam-mode/preset.yml', 'redteam-mode/provenance.json',
    'redteam-mode/user-original.md', 'redteam-mode/adaptive-execution.md',
    'codex-original/prompt.md', 'codex-original/provenance.json',
    'codex-original/LICENSE', 'codex-original/NOTICE', 'codex-original/SOURCE.md',
  ]
  const extracted = join(temporary, 'unpacked')
  await mkdir(extracted)
  execFileSync('tar', ['-xzf', join(temporary, result.filename), '-C', extracted])
  const packedRoot = join(extracted, 'package')
  // Reproduce the installed production dependencies without a network install.
  // Link only dependencies declared by the packed manifest, outside the tarball.
  const manifest = JSON.parse(await readFile(join(packedRoot, 'package.json'), 'utf8'))
  const require = createRequire(join(root, 'package.json'))
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const destination = join(extracted, 'node_modules', dependency)
    await mkdir(dirname(destination), { recursive: true })
    await symlink(dirname(require.resolve(`${dependency}/package.json`)), destination, 'dir')
  }
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
  const { loadBundledResources } = await import(pathToFileURL(join(packedRoot, 'dist/host/bundled/local-prompts.js')).href)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('packaged prompts must not use the network') }
  try {
    const { prompts, definitions } = await loadBundledResources()
    const redteam = definitions.find((definition) => definition.id === 'redteam-mode')
    assert.ok(redteam)
    assert.equal(redteam.order, 10)
    assert.equal(redteam.plugins.length, 22)
    assert.equal(redteam.plugins[0].config.prefix, prompts['redteam-mode'])
    const redteamProvenance = JSON.parse(await readFile(join(packedRoot, 'resources/redteam-mode/provenance.json'), 'utf8'))
    assert.equal(createHash('sha256').update(prompts['redteam-mode']).digest('hex'), redteamProvenance.personaPrefix.sha256)
    // The packed artifact must prove the user's own text survived untouched:
    // the shipped Persona is the original with one added section inserted.
    const userOriginal = await readFile(join(packedRoot, 'resources', redteamProvenance.userOriginal.file), 'utf8')
    const addition = await readFile(join(packedRoot, 'resources', redteamProvenance.personaAddition.file), 'utf8')
    assert.equal(createHash('sha256').update(userOriginal).digest('hex'), redteamProvenance.userOriginal.sha256)
    assert.equal(createHash('sha256').update(addition).digest('hex'), redteamProvenance.personaAddition.sha256)
    assert.equal(prompts['redteam-mode'], userOriginal.replace('## 身份\n', `${addition}## 身份\n`))
    assert.equal(prompts['redteam-mode'].replace(addition, ''), userOriginal)
    assert.equal(prompts['codex-original'], await readFile(join(root, 'resources/codex-original/prompt.md'), 'utf8'))
    assert.equal(prompts['standard-efficient'], await readFile(join(root, 'resources/standard-efficient/prefix.md'), 'utf8'))
    assert.equal(prompts['codex-original'].includes('{{'), false)
    assert.deepEqual([...prompts['standard-efficient'].matchAll(/\{\{([^{}]*)\}\}/g)].map((match) => match[1]), ['model'])
  } finally {
    globalThis.fetch = originalFetch
  }
  console.log('PASS  actual npm tarball contains complete prompt resources, the full red-team YAML, provenance, LICENSE and NOTICE')
  console.log('PASS  packed upstream files match their pinned byte lengths and SHA-256 digests')
  console.log('PASS  unpacked Host loads exact local resources offline without template collisions')
} finally {
  const target = resolve(temporary)
  assert.equal(dirname(target), base)
  assert.ok(basename(target).startsWith('dshpm-pack-'))
  await rm(target, { recursive: true, force: true })
}
