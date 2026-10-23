/**
 * Verify the Host face satisfies the gateway's binding contract.
 *
 * The gateway resolves a Remote call by validating, against the object published
 * under the descriptor's service key:
 *
 *   Reflect.get(original, 'typertRemote').service === original
 *   Reflect.get(original, 'typertRemote').serviceKey === descriptor.service
 *   Reflect.get(original, 'typertRemote').namespace === descriptor.namespace
 *
 * This script reproduces that check against the **installed** build and against
 * the descriptor set, so a binding regression is caught without a browser.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const home = process.env.HOME
const installed = join(
  home,
  '.dsh',
  'profiles',
  'desktop',
  'node_modules',
  '@rvaim',
  'dsh-preset-manager',
  'dist',
)

const remote = await import(pathToFileURL(join(installed, 'host/remote/preset-manager-remote.js')).href)
const descriptors = await import(
  pathToFileURL(join(installed, 'host/remote/descriptors.js')).href
)

const results = []
const check = (name, ok, detail) => {
  results.push(ok)
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}\n`)
}

// A service whose methods are inert; only the binding shape matters here.
const service = new Proxy(
  {},
  {
    get: () => async () => ({ ok: true, applied: true, errors: [], warnings: [] }),
  },
)

const face = remote.createRemoteFace(service)
const binding = Reflect.get(face, 'typertRemote')

check('face carries a typertRemote binding', binding !== undefined)
check('binding.service is the face itself', binding?.service === face)
check('binding.serviceKey matches the descriptors', binding?.serviceKey === 'presetManager')
check('binding.namespace matches the descriptors', binding?.namespace === 'presetManager')

// Every descriptor must resolve against this one service object.
const mismatched = descriptors.PRESET_MANAGER_DESCRIPTORS.filter(
  (descriptor) =>
    descriptor.service !== binding?.serviceKey || descriptor.namespace !== binding?.namespace,
)
check(
  'every descriptor names the bound service and namespace',
  mismatched.length === 0,
  mismatched.map((d) => d.id).join(', ') || undefined,
)

// The gateway also reflects the method off the bound object.
const missing = descriptors.PRESET_MANAGER_DESCRIPTORS.filter(
  (descriptor) => typeof Reflect.get(face, descriptor.method) !== 'function',
)
check(
  'every descriptor method exists on the face',
  missing.length === 0,
  missing.map((d) => d.method).join(', ') || undefined,
)

// A second face must not share the first one's identity.
const other = remote.createRemoteFace(service)
check('each face binds to itself, not to a shared singleton', Reflect.get(other, 'typertRemote').service === other)

const passed = results.filter(Boolean).length
process.stdout.write(`\n${passed}/${results.length} checks passed\n`)
process.exit(passed === results.length ? 0 : 1)
