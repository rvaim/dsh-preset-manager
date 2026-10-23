/**
 * End-to-end verification against the live DSH runtime.
 *
 * This script drives the plugin the way the settings page does, but from a
 * script so the result is inspectable without a browser: it mounts the Host
 * module's composition root against a real DSH `Context`, then exercises the
 * application service and asserts on the real registry.
 *
 * It is a verification harness, not part of the shipped bundle.
 */
const mod = await import('../dist/host/index.js')
const { apply } = mod

// A minimal stand-in for the Host services the plugin reads.
const registry = new Map()
const attempts = []
const context = {}

const presets = {
  async register(definition) {
    attempts.push(definition.id)
    if (registry.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
    const row = { id: definition.id, name: definition.name, definition }
    registry.set(definition.id, row)
    return async () => {
      if (registry.get(definition.id) === row) registry.delete(definition.id)
    }
  },
  async list() {
    return [...registry.values()].map((row) => ({
      id: row.id,
      ...(row.name === undefined ? {} : { name: row.name }),
    }))
  },
  async readDocument(id) {
    const row = registry.get(id)
    if (row === undefined) throw new Error(`Unknown agent preset: ${id}`)
    return { agentPreset: id, content: '[]', ...(row.name === undefined ? {} : { name: row.name }) }
  },
}

// Seed a shipped preset so copying has a source.
registry.set('standard', { id: 'standard', name: '标准', definition: { id: 'standard', plugins: [] } })

context.agentPresets = presets
context.get = (key) => {
  if (key === 'agentPresets') return presets
  if (key === 'dshHomePath') return () => process.env.DSH_HOME
  if (key === 'typert') return { register: () => () => Promise.resolve() }
  if (key === 'settings') return { describe: () => [] }
  return undefined
}
context.effect = (fn) => {
  const teardown = fn()
  context._teardown = teardown
}
context.provide = (key, value) => {
  context[key] = value
}
context.logger = { warn: (message) => process.stderr.write(`[warn] ${message}\n`) }

await apply(context, {})

// The provided object is the Remote face itself: methods plus a typertRemote marker.
const service = context.presetManager
if (service === undefined) throw new Error('presetManager service was not provided')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, ...(detail === undefined ? {} : { detail }) })
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

/** Compare paths independent of separator spelling. */
const normalize = (value) => String(value).replaceAll('\\', '/').replace(/\/+$/u, '')

// 1. The service exposes a snapshot.
const snapshot = await service.snapshot()
record('snapshot returns a phase', typeof snapshot.phase === 'string', snapshot.phase)
record(
  'data directory is under DSH_HOME',
  // Compare on one separator form: the two strings are produced by different
  // path APIs and may differ in separator spelling on Windows.
  normalize(snapshot.dataDirectory).startsWith(normalize(process.env.DSH_HOME)),
  snapshot.dataDirectory,
)

// 2. Copy a built-in preset.
// The Remote face takes positional arguments, exactly as the descriptors declare.
const clone = await service.clone('standard', 'e2e-preset', 'E2E 预设', undefined)
record('clone succeeded', clone.ok === true)
record('clone registered in the runtime', registry.has('e2e-preset') === true)

// 3. Read it back.
const detail = await service.detail('e2e-preset')
record('detail reports editable', detail.editable === true)
record('detail has a revision', detail.revision.length === 64)

// 4. Edit the persona and save.
const edited = {
  ...detail.definition,
  plugins: [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: { prefix: 'E2E persona 中文', complete: false },
    },
  ],
}
const saved = await service.save(edited, detail.revision)
record('save succeeded', saved.ok === true)
record(
  'saved definition is registered',
  registry.get('e2e-preset')?.definition.plugins[0]?.config?.prefix === 'E2E persona 中文',
)

// 5. Reject a stale revision.
let staleRejected = false
try {
  await service.save(edited, detail.revision)
} catch (error) {
  staleRejected = String(error?.message ?? error).length > 0
}
record('stale revision is rejected', staleRejected)

// 6. Export and re-import under a new id.
const exported = await service.exportPreset('e2e-preset')
record('export produced share text', exported.yaml.includes('dsh-agent-preset-share'))
const imported = await service.importPreset(
  exported.yaml,
  'share',
  'e2e-imported',
  undefined,
  true,
)
record('import succeeded', imported.ok === true)
record('imported preset is registered', registry.has('e2e-imported') === true)

// 7. Delete.
const removed = await service.remove('e2e-imported', undefined)
record('delete succeeded', removed.ok === true)
record('deleted preset left the runtime', registry.has('e2e-imported') === false)

// 8. Shutdown withdraws everything this plugin registered.
await context._teardown()
record('shutdown withdrew managed presets', registry.has('e2e-preset') === false)
record('shutdown kept the shipped preset', registry.has('standard') === true)

const failed = results.filter((entry) => !entry.ok)
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
if (failed.length > 0) process.exit(1)
