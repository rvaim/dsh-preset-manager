/**
 * Compile the test-bearing sources, then run them.
 *
 * The production build is left alone: tests import the same modules the plugin
 * ships, but they are compiled into `dist-test` so a published bundle never
 * contains them.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const out = join(root, 'dist-test')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

execFileSync(
  process.execPath,
  [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.test.json')],
  { stdio: 'inherit', cwd: root },
)

// Node's ESM loader needs a package.json boundary that declares module type.
writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n')

function collect(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...collect(path))
    else if (name.endsWith('.test.js')) found.push(path)
  }
  return found
}

const files = collect(out)
if (files.length === 0) {
  process.stderr.write('[test] no test files were compiled\n')
  process.exit(1)
}
process.stdout.write(`[test] running ${files.length} test file(s)\n`)
execFileSync(
  process.execPath,
  ['--test', '--test-reporter=spec', ...files],
  { stdio: 'inherit', cwd: root },
)
