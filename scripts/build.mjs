/**
 * Build: emit the Host half as ESM, and the Client half as one browser module.
 *
 * The two halves have genuinely different targets, so they use different tools:
 *
 *  - Host code runs in DSH's Node process and stays ESM with real imports, so it
 *    is compiled with `tsc` and keeps `node:` builtins and bare specifiers.
 *  - Client code runs inside the page's `window.__ModuleLoader__`, which wants a
 *    single CommonJS-style factory that receives `require` from the module table.
 *    `esbuild` produces that from the same TypeScript sources.
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

function step(message) {
  process.stdout.write(`[build] ${message}\n`)
}

rmSync(dist, { recursive: true, force: true })
rmSync(join(root, 'dist-client-tmp'), { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

// ---------------------------------------------------------------- Host (ESM)
step('compiling Host with tsc')
execFileSync(
  process.execPath,
  [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.json')],
  { stdio: 'inherit', cwd: root },
)

// The declarations above only exist to satisfy tsc; they are not runtime code,
// but tsc emits nothing for a .d.ts and we should not ship the shim itself.
rmSync(join(dist, 'host/cordis-shim.d.ts'), { force: true })

// -------------------------------------------------------------- Client bundle
step('bundling Client with esbuild')
const clientEntry = join(root, 'src/client/index.ts')
mkdirSync(join(dist), { recursive: true })

const clientBuild = await build({
  absWorkingDir: root,
  metafile: true,
  entryPoints: [clientEntry],
  outfile: join(dist, 'client.bundle.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  // React comes from the page's module table; bundling a second copy would break
  // hooks. Every other dependency stays bundled so the artifact is self-contained.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  logLevel: 'info',
  legalComments: 'none',
  charset: 'utf8',
})

// Wrap the bundle in the loader envelope DSH's client expects. Indentation is
// cosmetic; the loader only needs the id and the factory.
const bundled = readFileSync(join(dist, 'client.bundle.js'), 'utf8')
const id = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
const envelope = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    ${bundled
      .split('\n')
      .map((line) => (line === '' ? '' : `    ${line}`))
      .join('\n')}
    return module.exports;
  },
});
`
writeFileSync(join(dist, 'client.js'), envelope, 'utf8')

// Bundled packages do not remain separate npm dependencies in the browser.
// Preserve their actual license texts alongside the self-contained artifact.
const notices = new Map()
for (const input of Object.keys(clientBuild.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue
  let directory = dirname(resolve(root, input))
  while (directory !== root && directory !== dirname(directory)) {
    const metadata = join(directory, 'package.json')
    if (existsSync(metadata)) {
      const dependency = JSON.parse(readFileSync(metadata, 'utf8'))
      const key = `${dependency.name}@${dependency.version}`
      if (!notices.has(key)) {
        const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'COPYING']
          .map((name) => join(directory, name)).find((path) => existsSync(path))
        if (!license) throw new Error(`Bundled dependency has no license text: ${key}`)
        notices.set(key, readFileSync(license, 'utf8').trim())
      }
      break
    }
    directory = dirname(directory)
  }
}
writeFileSync(join(dist, 'THIRD_PARTY_NOTICES.txt'), [...notices.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([name, license]) => `${name}\n${'='.repeat(name.length)}\n\n${license}\n`).join('\n'), 'utf8')
rmSync(join(dist, 'client.bundle.js'), { force: true })

step(`done -> ${dist}`)
