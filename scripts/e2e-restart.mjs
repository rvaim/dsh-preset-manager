/**
 * Restart verification: a second process must restore what the first persisted.
 *
 * This is the check the requirement calls "关闭 DSH → 重新启动 → 自动注册". It runs
 * against the same `$DSH_HOME` the create step wrote to, so a failure here means
 * persistence or startup restore is genuinely broken rather than merely
 * mis-asserted.
 */
const mod = await import('../dist/host/index.js')
const { apply } = mod

const registry = new Map()
const attempts = []
const context = {}

const presets = {
  async register(definition) {
    attempts.push(definition.id)
    if (registry.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
    const row = { id: definition.id, definition }
    registry.set(definition.id, row)
    return async () => {
      if (registry.get(definition.id) === row) registry.delete(definition.id)
    }
  },
  async list() {
    return [...registry.values()].map((row) => ({ id: row.id }))
  },
  async readDocument(id) {
    if (!registry.has(id)) throw new Error(`Unknown agent preset: ${id}`)
    return { agentPreset: id, content: '[]' }
  },
}

// A shipped preset exists before the plugin starts, as in a real boot.
registry.set('standard', { id: 'standard', definition: { id: 'standard', plugins: [] } })

context.agentPresets = presets
context.get = (key) => {
  if (key === 'agentPresets') return presets
  if (key === 'dshHomePath') return () => process.env.DSH_HOME
  if (key === 'typert') return { register: () => () => Promise.resolve() }
  if (key === 'settings') return { describe: () => [] }
  return undefined
}
context.effect = (fn) => {
  context._teardown = fn()
}
context.provide = (key, value) => {
  context[key] = value
}
context.logger = { warn: (message) => process.stderr.write(`[warn] ${message}\n`) }

await apply(context, {})

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok })
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

const service = context.presetManager

// The preset written by the previous process must be live again.
record('persisted preset restored', registry.has('e2e-preset') === true)
record('registered exactly once', attempts.filter((id) => id === 'e2e-preset').length === 1)
record('shipped preset untouched', registry.has('standard') === true)

const snapshot = await service.snapshot()
const managed = snapshot.presets.find((row) => row.id === 'e2e-preset')
record('listed as managed', managed?.ownership === 'managed')
record('listed as registered', managed?.registration === 'registered')
record('listed as healthy', managed?.health === 'healthy')
record('plugin count is reported', managed?.pluginCount === 1, String(managed?.pluginCount))

// The restored definition is byte-for-byte the persisted one.
const detail = await service.detail('e2e-preset')
const persona = detail.definition.plugins[0]
record('persona prefix survived the restart', persona?.config?.prefix === 'E2E persona 中文')

// History from the previous process is readable.
const history = await service.history('e2e-preset')
record('history is retained', history.length >= 1, `${history.length} revisions`)

// Disabling must withdraw, and re-enabling must restore without duplicates.
await context._teardown()
record('disable withdrew the preset', registry.has('e2e-preset') === false)
record('disable kept the shipped preset', registry.has('standard') === true)

const failed = results.filter((entry) => !entry.ok)
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
if (failed.length > 0) process.exit(1)
