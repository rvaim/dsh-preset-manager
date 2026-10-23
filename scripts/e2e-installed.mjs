/**
 * Live verification against the installed plugin.
 *
 * Loads the **installed** Host module — the same bytes DSH loads — and drives its
 * application service through the real code paths, against a fake registry that
 * reproduces the real registry's semantics. It proves the installed artifact
 * works, not just the source tree.
 *
 * The verification preset is removed afterwards, so running this leaves the
 * user's real preset store untouched.
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const home = process.env.HOME
const installed = join(home, '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-preset-manager', 'dist')
const load = (relative) => import(pathToFileURL(join(installed, relative)).href)

const mod = await load('host/index.js')
const { dumpPluginRows } = await load('domain/preset-model.js')

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
    return [...registry.values()].map((row) => ({
      id: row.id,
      ...(row.definition.name === undefined ? {} : { name: row.definition.name }),
    }))
  },
  async readDocument(id) {
    const row = registry.get(id)
    if (row === undefined) throw new Error(`Unknown agent preset: ${id}`)
    return { agentPreset: id, content: dumpPluginRows(row.definition.plugins) }
  },
}

registry.set('standard', {
  id: 'standard',
  definition: {
    id: 'standard',
    name: '标准',
    plugins: [
      {
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: { prefix: 'standard persona', complete: false },
      },
    ],
  },
})

process.env.DSH_HOME = join(home, '.dsh')
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

await mod.apply(context, {})
const service = context.presetManager

const results = []
const check = (name, ok, detail) => {
  results.push(ok)
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

const ID = 'live-check-preset'

const clone = await service.clone('standard', ID, '实时验证预设', undefined)
check('clone of standard succeeded', clone.ok === true)
check('registered in the runtime', registry.has(ID) === true)
check(
  'composition copied faithfully',
  JSON.stringify(registry.get(ID)?.definition.plugins) ===
    JSON.stringify(registry.get('standard')?.definition.plugins),
)

const snapshot = await service.snapshot()
check('appears in the snapshot', snapshot.presets.some((row) => row.id === ID))
check(
  'reports healthy',
  snapshot.presets.find((row) => row.id === ID)?.health === 'healthy',
)

await context._teardown()
check('withdrawn on shutdown', registry.has(ID) === false)
check('shipped preset still present', registry.has('standard') === true)

// Leave no trace of the verification preset.
const dataDir = join(home, '.dsh', 'dsh-preset-manager')
await rm(join(dataDir, 'presets', `${ID}.yml`), { force: true })
await rm(join(dataDir, 'history', ID), { recursive: true, force: true })

const passed = results.filter(Boolean).length
process.stdout.write(`\n${passed}/${results.length} checks passed\n`)
process.exit(passed === results.length ? 0 : 1)
