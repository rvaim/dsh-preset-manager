/**
 * Persistence: atomic writes, history, quarantine, and concurrency.
 *
 * The properties under test are the ones a user would notice as data loss: a
 * half-written file must never replace a good one, a corrupt file must not take
 * its neighbours down with it, and two concurrent saves must not silently
 * collapse into one.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import { FilePresetRepository } from '../../host/adapters/file-preset-repository.js'
import { revisionOf } from '../../domain/preset-revision.js'

const roots: string[] = []

async function makeRepository(): Promise<{ repository: FilePresetRepository; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dshpm-repo-'))
  roots.push(dir)
  const repository = new FilePresetRepository({ directory: join(dir, 'data') })
  await repository.ensure()
  return { repository, dir: join(dir, 'data') }
}

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

function preset(id: string, extra: Partial<PresetDefinition> = {}): PresetDefinition {
  return {
    id,
    name: `preset ${id}`,
    description: `description for ${id}`,
    plugins: [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'hi', complete: false } },
    ],
    ...extra,
  }
}

describe('FilePresetRepository', () => {
  it('saves and reads back a preset', async () => {
    const { repository } = await makeRepository()
    const saved = await repository.save(preset('alpha'), 'create')

    assert.equal(saved.definition.id, 'alpha')
    assert.equal(saved.revision, revisionOf(preset('alpha')))

    const list = await repository.list()
    assert.equal(list.length, 1)
    assert.equal(list[0]?.definition.id, 'alpha')
  })

  it('keeps the effective preset in presets/ and nothing else authoritative', async () => {
    const { repository, dir } = await makeRepository()
    await repository.save(preset('alpha'), 'create')

    const files = await readdir(join(dir, 'presets'))
    assert.deepEqual(files, ['alpha.yml'])

    // metadata.json is an index: it must not contain a copy of the plugin list.
    const metadata = await readFile(join(dir, 'metadata.json'), 'utf8')
    assert.equal(metadata.includes('@deepseek-ai/dsh-persona'), false)
  })

  it('archives the previous revision when a preset changes', async () => {
    const { repository, dir } = await makeRepository()
    const first = await repository.save(preset('alpha'), 'create')
    await repository.save(preset('alpha', { name: 'renamed' }), 'save')

    const history = await repository.history('alpha')
    assert.equal(history.length, 1)
    assert.equal(history[0]?.revision, first.revision)

    // The archived revision is readable and is the old content.
    const restored = await repository.readHistory('alpha', first.revision)
    assert.equal(restored?.name, 'preset alpha')

    const files = await readdir(join(dir, 'history', 'alpha'))
    assert.equal(files.length, 1)
  })

  it('does not archive when the content is unchanged', async () => {
    const { repository } = await makeRepository()
    await repository.save(preset('alpha'), 'create')
    await repository.save(preset('alpha'), 'save')

    const history = await repository.history('alpha')
    assert.equal(history.length, 0)
  })

  it('refuses a write whose expected revision is stale', async () => {
    const { repository } = await makeRepository()
    const first = await repository.save(preset('alpha'), 'create')
    await repository.save(preset('alpha', { name: 'second' }), 'save')

    await assert.rejects(
      () => repository.save(preset('alpha', { name: 'third' }), 'save', first.revision),
      /changed since it was read/,
    )

    // The second revision is still what is stored.
    const stored = await repository.get('alpha')
    assert.equal(stored?.definition.name, 'second')
  })

  it('serializes concurrent writes so neither is silently dropped', async () => {
    const { repository } = await makeRepository()
    await repository.save(preset('alpha'), 'create')

    // Two writers that each read the same revision and then write different
    // content. Exactly one must win; the other must fail on the revision check.
    const current = await repository.get('alpha')
    assert.ok(current !== undefined)

    const results = await Promise.allSettled([
      repository.save(preset('alpha', { name: 'writer-one' }), 'save', current.revision),
      repository.save(preset('alpha', { name: 'writer-two' }), 'save', current.revision),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    assert.equal(fulfilled.length, 1)
    assert.equal(rejected.length, 1)

    const stored = await repository.get('alpha')
    assert.ok(['writer-one', 'writer-two'].includes(stored?.definition.name ?? ''))
  })

  it('quarantines a corrupt file without losing the others', async () => {
    const { repository, dir } = await makeRepository()
    await repository.save(preset('good'), 'create')

    // A file that cannot be parsed, as a truncated write would leave.
    await writeFile(join(dir, 'presets', 'broken.yml'), 'id: broken\nplugins: [\n', 'utf8')

    const list = await repository.list()
    assert.deepEqual(list.map((entry) => entry.definition.id), ['good'])

    const quarantined = await repository.quarantined()
    assert.equal(quarantined.length, 1)
    assert.match(quarantined[0]?.file ?? '', /broken\.yml/)

    // The original bytes are preserved for hand repair, not deleted.
    const preserved = await readdir(join(dir, 'backups', 'quarantine'))
    assert.equal(preserved.length, 1)
  })

  it('writes atomically, leaving no temporary file behind', async () => {
    const { repository, dir } = await makeRepository()
    await repository.save(preset('alpha'), 'create')
    await repository.save(preset('alpha', { name: 'again' }), 'save')

    const files = await readdir(join(dir, 'presets'))
    assert.deepEqual(files, ['alpha.yml'])
    assert.equal(files.some((name) => name.endsWith('.tmp')), false)
  })

  it('deletes a preset but keeps its final revision recoverable', async () => {
    const { repository } = await makeRepository()
    const saved = await repository.save(preset('alpha'), 'create')
    await repository.delete('alpha')

    assert.equal(await repository.get('alpha'), undefined)
    const restored = await repository.readHistory('alpha', saved.revision)
    assert.equal(restored?.id, 'alpha')
  })

  it('refuses a path-traversal id', async () => {
    const { repository } = await makeRepository()
    await assert.rejects(
      () => repository.save(preset('../escape'), 'create'),
      /not usable as a file name/,
    )
  })

  it('preserves the YAML dialect across a round-trip', async () => {
    const { repository } = await makeRepository()
    const definition: PresetDefinition = {
      id: 'dialect',
      name: '方言',
      plugins: [
        {
          id: 'conditional',
          name: '@deepseek-ai/dsh-skill',
          disabled: { __jsExpr: "ctx.get('profileContext') === undefined" },
          config: {
            description: '多行\n中文描述',
            group: false,
            isolate: { tools: true },
            nested: [{ deep: { value: 1 } }],
          },
        },
        {
          id: 'grp',
          name: 'cordis:group',
          group: true,
          config: [{ id: 'inner', name: '@deepseek-ai/dsh-persona', config: { prefix: 'x' } }],
        },
      ],
    }

    await repository.save(definition, 'create')
    const stored = await repository.get('dialect')

    assert.deepEqual(stored?.definition.plugins, definition.plugins)
    assert.equal(stored?.revision, revisionOf(definition))
  })

  it('purges every owned file after writing one backup', async () => {
    const { repository, dir } = await makeRepository()
    await repository.save(preset('alpha'), 'create')
    await repository.save(preset('beta'), 'create')

    await repository.purge()

    assert.deepEqual(await repository.list(), [])
    const backups = await readdir(join(dir, 'backups'))
    assert.equal(backups.some((name) => name.startsWith('purge-')), true)
  })
})
