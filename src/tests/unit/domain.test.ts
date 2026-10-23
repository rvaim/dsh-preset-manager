/**
 * Domain rules: validation, cloning, persona projection, and diffing.
 *
 * These are pure functions, so the tests state the rule directly: what makes a
 * definition invalid, what a copy must preserve, and what a persona edit may
 * never touch.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import { validatePreset, validatePresetId } from '../../domain/preset-validator.js'
import { clonePreset, copyPreservesComposition } from '../../domain/clone-preset.js'
import { readPersona, writePersona, PERSONA_MODULE } from '../../domain/persona-editor.js'
import { diffPresets, isEmptyDiff } from '../../domain/preset-diff.js'
import { collectExpressions, countPlugins, flattenPlugins } from '../../domain/preset-model.js'

function preset(id: string, extra: Partial<PresetDefinition> = {}): PresetDefinition {
  return {
    id,
    name: `name ${id}`,
    plugins: [{ id: 'persona', name: PERSONA_MODULE, config: { prefix: 'p', complete: false } }],
    ...extra,
  }
}

describe('preset validation', () => {
  it('accepts a well-formed definition', () => {
    const report = validatePreset(preset('good-id'))
    assert.equal(report.ok, true)
    assert.deepEqual(report.errors, [])
  })

  it('rejects an empty, malformed, or reserved id', () => {
    assert.equal(validatePresetId('').length, 1)
    assert.equal(validatePresetId('Has Space').length, 1)
    assert.equal(validatePresetId('UPPER').length, 1)

    // `dsh-internal-x` is a well-formed id that hits a reserved prefix: one
    // problem, naming the prefix.
    const reserved = validatePresetId('dsh-internal-x')
    assert.equal(reserved.length, 1)
    assert.equal(reserved[0]?.code, 'preset.id.reserved')

    // `cordis:x` fails the format rule *and* the reserved-prefix rule, and both
    // are reported so the user does not fix one and hit the other.
    const both = validatePresetId('cordis:x')
    assert.equal(both.length, 2)
    assert.deepEqual(
      both.map((entry) => entry.code).sort(),
      ['preset.id.format', 'preset.id.reserved'],
    )

    assert.equal(validatePresetId('ok-id.1_2').length, 0)
  })

  it('accepts the Loader builtin specifiers a shipped preset uses', () => {
    // `cordis:group` is what a real standard preset names its nested sections,
    // so rejecting it would make the built-in preset invalid.
    const report = validatePreset({
      id: 'with-group',
      plugins: [
        {
          name: 'cordis:group',
          group: true,
          config: [{ id: 'inner', name: '@deepseek-ai/dsh-persona' }],
        } as never,
      ],
    })
    assert.equal(report.ok, true)
    assert.deepEqual(report.errors, [])
  })

  it('rejects a row that names no module, with a path', () => {
    const report = validatePreset({
      id: 'x',
      plugins: [{ name: '' } as never],
    })
    assert.equal(report.ok, false)
    assert.equal(report.errors[0]?.path, 'plugins[0].name')
  })

  it('rejects a group row whose config is not a row list', () => {
    const report = validatePreset({
      id: 'x',
      plugins: [{ name: 'cordis:group', group: true, config: { not: 'a list' } } as never],
    })
    assert.equal(report.ok, false)
    assert.match(report.errors[0]?.code ?? '', /group/)
  })

  it('validates nested group rows recursively', () => {
    const report = validatePreset({
      id: 'x',
      plugins: [
        {
          name: 'cordis:group',
          group: true,
          config: [{ name: '@ok/plugin' }, { name: '' }],
        } as never,
      ],
    })
    assert.equal(report.ok, false)
    assert.equal(report.errors[0]?.path, 'plugins[0].config[1].name')
  })

  it('refuses an id already owned by someone else', () => {
    const report = validatePreset(preset('taken'), {
      knownIds: new Map([['taken', 'DSH 内置']]),
    })
    assert.equal(report.ok, false)
    assert.match(report.errors[0]?.message ?? '', /DSH 内置/)
  })

  it('permits replacing its own id', () => {
    const report = validatePreset(preset('mine'), {
      knownIds: new Map([['mine', '本插件']]),
      ownId: 'mine',
    })
    assert.equal(report.ok, true)
  })

  it('warns about an empty plugin list without blocking', () => {
    const report = validatePreset({ id: 'empty', plugins: [] })
    assert.equal(report.ok, true)
    assert.equal(report.warnings.length, 1)
  })
})

describe('cloning', () => {
  const source: PresetDefinition = {
    id: 'standard',
    name: '标准',
    description: '内置标准预设',
    order: 5,
    plugins: [
      { id: 'persona', name: PERSONA_MODULE, config: { prefix: '多行\n中文', complete: false } },
      {
        id: 'conditional',
        name: '@deepseek-ai/dsh-skill',
        disabled: { __jsExpr: "dshHomePath('x')" },
        config: { nested: [{ a: 1 }], isolate: { tools: true } },
      },
      {
        id: 'grp',
        name: 'cordis:group',
        group: true,
        config: [{ id: 'inner', name: '@deepseek-ai/dsh-persona', config: {} }],
      },
    ],
  }

  it('preserves the whole composition and changes only identity', () => {
    const copy = clonePreset(source, { newId: 'mine' })

    assert.equal(copy.id, 'mine')
    assert.equal(copy.name, '标准 副本')
    assert.equal(copy.description, source.description)
    assert.equal(copy.order, 6)
    assert.equal(copyPreservesComposition(source, copy), true)
    // Deep equality, including `!!js`, groups, isolate, and nested config.
    assert.deepEqual(copy.plugins, source.plugins)
  })

  it('never mutates or aliases the source', () => {
    const copy = clonePreset(source, { newId: 'mine' })
    // Mutating the copy's nested config must not reach the source.
    const copyRow = copy.plugins[1] as { config: { nested: { a: number }[] } }
    copyRow.config.nested[0]!.a = 99
    const sourceRow = source.plugins[1] as { config: { nested: { a: number }[] } }
    assert.equal(sourceRow.config.nested[0]!.a, 1)
    assert.equal(source.id, 'standard')
  })

  it('honours explicit name, description, and order', () => {
    const copy = clonePreset(source, {
      newId: 'mine',
      name: 'my name',
      description: 'my description',
      order: 42,
    })
    assert.equal(copy.name, 'my name')
    assert.equal(copy.description, 'my description')
    assert.equal(copy.order, 42)
  })
})

describe('persona editing', () => {
  const definition: PresetDefinition = {
    id: 'x',
    plugins: [
      { id: 'other', name: '@deepseek-ai/dsh-skill', config: { keep: 'me' } },
      {
        id: 'persona',
        name: PERSONA_MODULE,
        config: { prefix: 'old', suffix: 'tail', complete: false, model: 'keep-this' },
      },
    ],
  }

  it('reads the persona fields', () => {
    const { fields, present, rowIndex } = readPersona(definition)
    assert.equal(present, true)
    assert.equal(rowIndex, 1)
    assert.deepEqual(fields, { prefix: 'old', suffix: 'tail', complete: false })
  })

  it('writes only the persona config, preserving other keys and rows', () => {
    const edited = writePersona(definition, { prefix: 'new' })
    const persona = edited.plugins[1] as { config: Record<string, unknown> }
    assert.equal(persona.config.prefix, 'new')
    // An unrelated persona config key survives.
    assert.equal(persona.config.model, 'keep-this')
    // An unrelated plugin row is untouched.
    assert.deepEqual(edited.plugins[0], definition.plugins[0])
    // The source is unchanged.
    assert.equal((definition.plugins[1] as { config: { prefix: string } }).config.prefix, 'old')
  })

  it('keeps complete false by default and can set it explicitly', () => {
    const additive = writePersona(definition, { prefix: 'x' })
    assert.equal((additive.plugins[1] as { config: { complete: boolean } }).config.complete, false)

    const replacing = writePersona(definition, { complete: true })
    assert.equal((replacing.plugins[1] as { config: { complete: boolean } }).config.complete, true)
  })

  it('reports an absent persona rather than failing', () => {
    const withoutPersona: PresetDefinition = {
      id: 'y',
      plugins: [{ id: 'a', name: '@deepseek-ai/dsh-skill' }],
    }
    const { present, fields } = readPersona(withoutPersona)
    assert.equal(present, false)
    assert.deepEqual(fields, { prefix: '', suffix: '', complete: false })
  })

  it('adds a persona row only when one is genuinely absent', () => {
    const withoutPersona: PresetDefinition = {
      id: 'y',
      plugins: [{ id: 'a', name: '@deepseek-ai/dsh-skill' }],
    }
    const edited = writePersona(withoutPersona, { prefix: 'added' })
    assert.equal(edited.plugins.length, 2)
    assert.equal(edited.plugins[1]?.name, PERSONA_MODULE)
    assert.equal(edited.plugins[1]?.config !== undefined, true)
  })
})

describe('diffing', () => {
  const before: PresetDefinition = {
    id: 'x',
    name: 'before',
    plugins: [
      { id: 'a', name: '@a/plugin' },
      { id: 'b', name: '@b/plugin', config: { v: 1 } },
    ],
  }

  it('reports no change for identical definitions', () => {
    const diff = diffPresets(before, JSON.parse(JSON.stringify(before)) as PresetDefinition)
    assert.equal(isEmptyDiff(diff), true)
    assert.equal(diff.unchangedPlugins, 2)
  })

  it('separates metadata, added, removed, and changed rows', () => {
    const after: PresetDefinition = {
      id: 'x',
      name: 'after',
      plugins: [
        { id: 'a', name: '@a/plugin' },
        { id: 'b', name: '@b/plugin', config: { v: 2 } },
        { id: 'c', name: '@c/plugin' },
      ],
    }
    const diff = diffPresets(before, after)

    assert.deepEqual(diff.changedMetadata.map((field) => field.field), ['name'])
    assert.deepEqual(diff.addedPlugins.map((row) => row.id), ['c'])
    assert.deepEqual(diff.changedPlugins.map((row) => row.id), ['b'])
    assert.deepEqual(diff.removedPlugins, [])
    assert.equal(diff.unchangedPlugins, 1)
  })

  it('matches rows by id, so reordering is not a change', () => {
    const reordered: PresetDefinition = {
      id: 'x',
      name: 'before',
      plugins: [
        { id: 'b', name: '@b/plugin', config: { v: 1 } },
        { id: 'a', name: '@a/plugin' },
      ],
    }
    const diff = diffPresets(before, reordered)
    assert.equal(diff.addedPlugins.length, 0)
    assert.equal(diff.removedPlugins.length, 0)
    assert.equal(diff.changedPlugins.length, 0)
  })
})

describe('composition helpers', () => {
  it('counts nested group plugins, not groups', () => {
    const rows = [
      { id: 'a', name: '@a/plugin' },
      {
        name: 'cordis:group',
        group: true,
        config: [{ id: 'b', name: '@b/plugin' }, { id: 'c', name: '@c/plugin' }],
      },
    ]
    assert.equal(countPlugins(rows as never), 3)
    assert.equal(flattenPlugins(rows as never).length, 3)
  })

  it('inherits a group’s disabled state to its children', () => {
    const rows = [
      {
        name: 'cordis:group',
        group: true,
        disabled: true,
        config: [{ id: 'inner', name: '@inner/plugin' }],
      },
    ]
    const flat = flattenPlugins(rows as never)
    assert.equal(flat[0]?.disabled, true)
  })

  it('collects every !!js expression with its path', () => {
    const definition: PresetDefinition = {
      id: 'x',
      plugins: [
        { id: 'a', name: '@a/plugin', disabled: { __jsExpr: 'cond-1' } },
        { id: 'b', name: '@b/plugin', config: { inner: { when: { __jsExpr: 'cond-2' } } } },
      ],
    }
    const found = collectExpressions(definition)
    assert.deepEqual(
      found.map((item) => item.expression),
      ['cond-1', 'cond-2'],
    )
    assert.match(found[0]?.path ?? '', /plugins\[0\]\.disabled/)
  })
})
