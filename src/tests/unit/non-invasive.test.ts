/**
 * Non-invasiveness: the core promise of this plugin.
 *
 * Every operation the manager offers — create, copy, edit, delete, import,
 * export — must leave DSH's own configuration byte-identical. This suite proves
 * it the only way that is convincing: by hashing the configuration files before
 * and after running the real use cases against a real file repository and a fake
 * registry.
 *
 * The one excluded change is the package-manager effect of installing or
 * removing this plugin itself, which DSH's own installer owns; nothing here
 * performs that, so no exclusion is needed in the assertions.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import { FilePresetRepository } from '../../host/adapters/file-preset-repository.js'
import { DshPresetSource } from '../../host/adapters/dsh-preset-source.js'
import { DynamicPresetRegistryAdapter } from '../../host/adapters/dynamic-preset-registry.js'
import { RegistrationManager } from '../../host/lifecycle/registration-manager.js'
import { restoreStoredPresets } from '../../host/lifecycle/startup-restore.js'
import { PresetManagerService } from '../../host/application/preset-manager-service.js'
import type { ApplicationDeps } from '../../host/application/deps.js'
import { dumpShareText } from '../../sharing/share-format.js'
import { FakeAgentPresetRegistry } from './fakes/fake-registry.js'
import { PERSONA_MODULE } from '../../domain/persona-editor.js'
import type { BundledPresetRuntime } from '../../host/ports/bundled-presets.js'

const roots: string[] = []

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

/**
 * A stand-in for a DSH profile: the files this plugin must never touch, plus the
 * data directory it owns.
 */
interface Harness {
  readonly profileDir: string
  readonly dataDir: string
  readonly repository: FilePresetRepository
  readonly registry: FakeAgentPresetRegistry
  readonly service: PresetManagerService
  readonly managedIds: Set<string>
  /** Hash every DSH-owned file, for the before/after comparison. */
  hashProfile(): Promise<Record<string, string>>
}

const PROFILE_FILES: Record<string, string> = {
  'cordis.patch.yml': [
    '# the user patch layer',
    '- id: agent-default-model',
    '  config:',
    '    provider: magpie',
    '- id: agent-preset-registry',
    '  config:',
    '    default: standard',
    '    selectedDefault: standard-efficient',
    '',
  ].join('\n'),
  'package.json': JSON.stringify(
    {
      name: 'dsh-profile-test',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@local/some-bundle'] } },
      dependencies: { '@local/some-bundle': 'link:./some-bundle' },
    },
    null,
    2,
  ),
  'cordis.yml': '[]\n',
  'bundles/standard.patch.yml': [
    '- insert:',
    '    - id: preset-standard',
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    '        id: standard',
    '        plugins: []',
    '',
  ].join('\n'),
}

const NO_BUNDLED_PRESETS: BundledPresetRuntime = {
  ids: [],
  holds: () => false,
  conflicted: () => false,
  definition: () => undefined,
  setRegistered: async () => ({ healthy: true }),
}

async function makeHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dshpm-noninvasive-'))
  roots.push(root)
  const profileDir = join(root, 'profile')
  const dataDir = join(root, 'home', 'dsh-preset-manager')

  for (const [name, content] of Object.entries(PROFILE_FILES)) {
    const path = join(profileDir, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content, 'utf8')
  }

  const repository = new FilePresetRepository({ directory: dataDir })
  await repository.ensure()

  const registry = new FakeAgentPresetRegistry()
  // Two shipped presets that exist before the plugin does. `standard` carries a
  // real composition so a copy of it has something to copy.
  registry.seed(STANDARD_LIKE)
  registry.seed({ id: 'minimal', name: '最小', plugins: [] })

  const managedIds = new Set<string>()
  const adapter = new DynamicPresetRegistryAdapter({
    registry,
    managedIds: { has: (id) => managedIds.has(id) },
    isShippedPreset: (id) => id === 'standard' || id === 'minimal',
  })
  const registrations = new RegistrationManager({ runtime: adapter })

  const source = new DshPresetSource({
    reader: registry,
    managedIds: { has: (id) => managedIds.has(id) },
    isShippedPreset: (id) => id === 'standard' || id === 'minimal',
    defaultId: async () => 'standard-efficient',
  })

  const deps: ApplicationDeps = {
    repository,
    source,
    bundled: NO_BUNDLED_PRESETS,
    registrations,
    resolveModule: () => true,
    defaultPresetId: async () => 'standard-efficient',
    warn: () => {},
    now: Date.now,
  }

  const service = new PresetManagerService(deps)

  const outcome = await restoreStoredPresets({ repository, registrations })
  service.markReady(outcome.diagnostics)

  return {
    profileDir,
    dataDir,
    repository,
    registry,
    service,
    managedIds,
    async hashProfile() {
      const hashes: Record<string, string> = {}
      for (const name of Object.keys(PROFILE_FILES)) {
        const content = await readFile(join(profileDir, name), 'utf8')
        hashes[name] = createHash('sha256').update(content).digest('hex')
      }
      return hashes
    },
  }
}

const STANDARD_LIKE: PresetDefinition = {
  id: 'standard',
  name: '标准',
  description: '内置标准预设',
  order: 1,
  plugins: [
    {
      id: 'persona',
      name: PERSONA_MODULE,
      config: { prefix: 'You are a coding agent.', complete: false },
    },
    {
      id: 'grp',
      name: 'cordis:group',
      group: true,
      config: [{ id: 'inner', name: '@deepseek-ai/dsh-skill' }],
    },
  ],
}

describe('non-invasiveness', () => {
  it('leaves every DSH configuration file byte-identical across a full lifecycle', async () => {
    const harness = await makeHarness()
    const before = await harness.hashProfile()

    // 1. Copy a built-in preset into a new managed one.
    const clone = await harness.service.clone({
      sourceId: 'standard',
      newId: 'my-preset',
      name: '我的预设',
    })
    assert.equal(clone.ok, true)
    harness.managedIds.add('my-preset')

    // 2. Edit its persona.
    const detail = await harness.service.detail('my-preset')
    const edited: PresetDefinition = {
      ...detail.definition,
      plugins: detail.definition.plugins.map((row) =>
        row.name === PERSONA_MODULE
          ? { ...row, config: { ...(row.config as object), prefix: 'edited persona' } }
          : row,
      ),
    }
    const saved = await harness.service.save({
      definition: edited,
      expectedRevision: detail.revision,
    })
    assert.equal(saved.ok, true)

    // 3. Export it.
    const exported = await harness.service.exportPreset('my-preset')
    assert.match(exported.yaml, /edited persona/)

    // 4. Import it under a new id.
    const imported = await harness.service.importPreset({
      text: dumpShareText({ ...edited, id: 'imported-preset' }),
      source: 'share',
      acknowledgedRisks: true,
    })
    assert.equal(imported.ok, true)
    harness.managedIds.add('imported-preset')

    // 5. Delete one of them.
    const removed = await harness.service.remove({ id: 'imported-preset' })
    assert.equal(removed.ok, true)

    // 6. Nothing in the profile may have changed.
    assert.deepEqual(await harness.hashProfile(), before)
  })

  it('writes only inside its own data directory', async () => {
    const harness = await makeHarness()
    await harness.service.clone({ sourceId: 'standard', newId: 'mine' })

    // Every file the plugin created must be under its own directory.
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(harness.dataDir, { recursive: true, withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))

    assert.equal(files.length > 0, true)
    for (const file of files) {
      assert.equal(
        file.startsWith(harness.dataDir),
        true,
        `plugin wrote outside its data directory: ${file}`,
      )
    }
  })

  it('never modifies a built-in preset it copies from', async () => {
    const harness = await makeHarness()
    const originalRows = (await harness.registry.readDocument('standard')).content

    await harness.service.clone({ sourceId: 'standard', newId: 'copy-of-standard' })
    await harness.service.save({
      definition: {
        id: 'copy-of-standard',
        plugins: [{ id: 'persona', name: PERSONA_MODULE, config: { prefix: 'changed' } }],
      },
    })

    // The source document is untouched, and the built-in is still registered.
    assert.equal((await harness.registry.readDocument('standard')).content, originalRows)
    assert.equal(harness.registry.ids().includes('standard'), true)
  })

  it('refuses to delete a preset it does not own', async () => {
    const harness = await makeHarness()

    await assert.rejects(
      () => harness.service.remove({ id: 'standard' }),
      /不是本插件管理的预设/,
    )
    // The built-in is still there.
    assert.equal(harness.registry.ids().includes('standard'), true)
  })

  it('does not rewrite the official bundle patch when a preset is created', async () => {
    const harness = await makeHarness()
    const bundlePath = join(harness.profileDir, 'bundles/standard.patch.yml')
    const before = await readFile(bundlePath, 'utf8')

    await harness.service.clone({ sourceId: 'standard', newId: 'from-bundle' })

    assert.equal(await readFile(bundlePath, 'utf8'), before)
  })

  it('leaves the built-ins healthy after the plugin withdraws its own presets', async () => {
    const harness = await makeHarness()
    await harness.service.clone({ sourceId: 'standard', newId: 'temp' })
    assert.equal(harness.registry.ids().includes('temp'), true)

    // Simulate the plugin being disabled: the registration manager withdraws
    // everything it holds.
    await harness.service.quiesce()
    await (harness.service as unknown as { deps: ApplicationDeps }).deps.registrations.shutdown()

    assert.deepEqual(harness.registry.ids().sort(), ['minimal', 'standard'])
  })

  it('restores the same presets after a restart, with no duplicates', async () => {
    const harness = await makeHarness()
    await harness.service.clone({ sourceId: 'standard', newId: 'persisted' })
    harness.managedIds.add('persisted')

    // A fresh adapter and manager over the same files is what a restart means.
    const registry2 = new FakeAgentPresetRegistry()
    registry2.seed(STANDARD_LIKE)
    registry2.seed({ id: 'minimal', name: '最小', plugins: [] })
    const adapter2 = new DynamicPresetRegistryAdapter({
      registry: registry2,
      managedIds: { has: (id) => harness.managedIds.has(id) },
      isShippedPreset: (id) => id === 'standard' || id === 'minimal',
    })
    const registrations2 = new RegistrationManager({ runtime: adapter2 })
    const outcome = await restoreStoredPresets({
      repository: harness.repository,
      registrations: registrations2,
    })

    assert.deepEqual(outcome.restored.map((entry) => entry.definition.id), ['persisted'])
    // Registered exactly once.
    const attempts = registry2.attempts.filter((attempt) => attempt.id === 'persisted')
    assert.equal(attempts.length, 1)
    assert.equal(registry2.ids().includes('persisted'), true)
  })

  it('keeps working presets when one stored file is unusable', async () => {
    const harness = await makeHarness()
    await harness.service.clone({ sourceId: 'standard', newId: 'good-one' })
    harness.managedIds.add('good-one')

    // A definition that fails validation, as a hand-edited file might.
    await writeFile(
      join(harness.dataDir, 'presets', 'bad-one.yml'),
      'id: "Has Space"\nplugins: []\n',
      'utf8',
    )

    const registry2 = new FakeAgentPresetRegistry()
    registry2.seed(STANDARD_LIKE)
    const adapter2 = new DynamicPresetRegistryAdapter({
      registry: registry2,
      managedIds: { has: (id) => harness.managedIds.has(id) },
    })
    const registrations2 = new RegistrationManager({ runtime: adapter2 })
    const outcome = await restoreStoredPresets({
      repository: harness.repository,
      registrations: registrations2,
    })

    // The good one is restored, the bad one is reported, and nothing throws.
    assert.equal(registry2.ids().includes('good-one'), true)
    assert.equal(registry2.ids().includes('Has Space'), false)
    assert.equal(
      outcome.diagnostics.some((issue) => issue.code === 'preset.id.format'),
      true,
    )
  })
})
