/**
 * Remove every build output.
 *
 * Kept separate from `build.mjs` so a clean checkout and a rebuild-in-place
 * behave the same: `build.mjs` already clears its own outputs, and this exists
 * for the case where someone wants the tree to contain no artifacts at all.
 */
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

for (const relative of ['dist', 'dist-test', 'dist-client-tmp']) {
  rmSync(join(root, relative), { recursive: true, force: true })
  process.stdout.write(`[clean] removed ${relative}\n`)
}
