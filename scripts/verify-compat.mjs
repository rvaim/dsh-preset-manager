/**
 * Build-time guard: check this plugin's manifest through DSH's own compatibility gate.
 *
 * DSH admits a bundle only when `evaluatePluginCompatibility()` returns undefined.
 * An exact `engines.dsh` pin matches one runtime version and nothing else, so a
 * runtime upgrade silently drops the whole bundle (no plugin row, no settings page).
 * Running the real gate here turns a forgotten manifest sync into a build failure
 * instead of a runtime disappearance.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const runtimeVersion = getDshRuntimeVersion()

// 1) The runtime's own gate decides. `undefined` means the bundle is admitted.
const issue = evaluatePluginCompatibility(pkg, {}, runtimeVersion)
assert.equal(
  issue,
  undefined,
  `manifest would be skipped by DSH ${runtimeVersion}: ${JSON.stringify(issue?.requirements)}`,
)

// 2) Never let the exact pin come back: it is the root cause of this failure.
assert.match(
  pkg.engines?.dsh ?? '',
  /^(\^|~|>=)/,
  'engines.dsh must be a semver range, not an exact version',
)

// 3) Keep the verification SDK on the same version line as the runtime, or
//    `npm run verify` would exercise the old SDK and report a false pass.
const gateway = require('@deepseek-ai/dsh-api-gateway/package.json')
assert.equal(
  gateway.version,
  runtimeVersion,
  '@deepseek-ai/dsh-api-gateway must match the runtime version line',
)
for (const [name, range] of Object.entries(pkg.devDependencies ?? {})) {
  if (name.startsWith('@deepseek-ai/dsh-')) {
    assert.equal(range, runtimeVersion, `${name} must match the runtime version line`)
  }
}
assert.ok(
  semver.satisfies(
    pkg.devDependencies?.['@deepseek-ai/cordis'],
    gateway.peerDependencies['@deepseek-ai/cordis'],
  ),
  '@deepseek-ai/cordis must satisfy the gateway peer range',
)

console.log(
  `PASS  compatibility gate: DSH ${runtimeVersion}, engines.dsh ${pkg.engines.dsh}`,
)
