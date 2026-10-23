/** Complete composition editing must address rows by position, never by name. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetDefinition, PresetPluginRow } from '../../shared/types.js'
import {
  appendCompositionRow,
  getCompositionRow,
  listCompositionRows,
  moveCompositionRow,
  removeCompositionRow,
  replaceCompositionRow,
} from '../../domain/composition-editor.js'
import { cloneDefinition, collectExpressions } from '../../domain/preset-model.js'

const PERSONA_MODULE = '@deepseek-ai/dsh-persona'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function fixture(): PresetDefinition {
  return deepFreeze({
    id: 'complete-composition',
    name: 'Complete preset',
    description: 'Nested groups and repeated plugin names',
    order: 7,
    plugins: [
      {
        id: 'root-persona',
        name: PERSONA_MODULE,
        config: { prefix: 'root', suffix: 'root suffix', complete: false },
        disabled: null,
      },
      {
        id: 'outer',
        name: 'cordis:group',
        group: true,
        disabled: { __jsExpr: '!ctx.get("profileContext")' },
        inject: ['service-a'],
        intercept: { 'service-a': true },
        isolate: { 'service-a': 'outer-realm' },
        futureGroupField: { flags: [true, null, 'kept'] },
        config: [
          {
            name: PERSONA_MODULE,
            config: { prefix: 'first nested', complete: false, model: 'keep-model' },
            disabled: { __jsExpr: 'platform !== "desktop"' },
            isolate: { 'service-a': true },
            futurePluginField: { nested: [{ preserved: 1 }] },
          },
          {
            id: 'inner',
            name: 'cordis:group',
            group: true,
            disabled: null,
            isolate: { 'service-b': 'inner-realm' },
            config: [
              {
                id: 'deep-persona',
                name: PERSONA_MODULE,
                config: {
                  prefix: 'deep',
                  suffix: 'deep suffix',
                  complete: true,
                  custom: { expression: { __jsExpr: 'ctx.someService.value' } },
                },
                disabled: { __jsExpr: '(() => { throw new Error("never evaluate") })()' },
                inject: { required: ['service-b'] },
                intercept: ['service-b'],
                isolate: { 'service-b': true },
                futurePluginField: { untouched: [1, { text: 'keep' }] },
              },
              {
                id: 'deep-other',
                name: '@example/other',
                disabled: false,
                config: ['json array', null, 42, { __jsExpr: 'ctx.arrayValue' }],
              },
            ],
          },
          { id: 'last-nested', name: '@example/last', config: null, disabled: true },
        ],
      },
      {
        id: 'ordinary-array-config',
        name: '@example/array-config',
        config: [{ name: 'cordis:group', group: true, config: [{ name: PERSONA_MODULE }] }],
      },
      { name: PERSONA_MODULE, config: 'literal config' },
    ],
  })
}

describe('composition row lookup', () => {
  it('lists groups and descendants in document order, with exact paths and depths', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const rows = listCompositionRows(source)
    assert.deepEqual(
      rows.map(({ path, depth }) => ({ path, depth })),
      [
        { path: [0], depth: 0 },
        { path: [1], depth: 0 },
        { path: [1, 0], depth: 1 },
        { path: [1, 1], depth: 1 },
        { path: [1, 1, 0], depth: 2 },
        { path: [1, 1, 1], depth: 2 },
        { path: [1, 2], depth: 1 },
        { path: [2], depth: 0 },
        { path: [3], depth: 0 },
      ],
    )
    assert.equal(rows[4]?.row.id, 'deep-persona')
    assert.equal(rows.filter(({ row }) => row.name === PERSONA_MODULE).length, 4)
    assert.equal(JSON.stringify(source), before)
  })

  it('uses the shared group flag semantics, leaving ordinary array configs opaque', () => {
    const source: PresetDefinition = deepFreeze({
      id: 'group-semantics',
      plugins: [
        { name: '@example/group-name', group: true, config: [{ name: '@example/child' }] },
        { name: 'cordis:group', group: false, config: [{ name: '@example/opaque' }] },
      ],
    })
    assert.deepEqual(listCompositionRows(source).map(({ path }) => path), [[0], [0, 0], [1]])
    assert.equal(getCompositionRow(source, [0, 0]).name, '@example/child')
    assert.throws(() => getCompositionRow(source, [1, 0]), /not a structural group/)
    assert.deepEqual(listCompositionRows({ id: 'empty', plugins: [] }), [])
  })

  it('locates repeated names and id-less rows independently at every depth', () => {
    const source = fixture()
    assert.equal(getCompositionRow(source, [0]).id, 'root-persona')
    assert.equal(getCompositionRow(source, [1]).id, 'outer')
    assert.deepEqual(getCompositionRow(source, [1, 0]).config, {
      prefix: 'first nested', complete: false, model: 'keep-model',
    })
    assert.equal(getCompositionRow(source, [1, 1, 0]).id, 'deep-persona')
    assert.equal(getCompositionRow(source, [3]).id, undefined)
    assert.equal(getCompositionRow(source, [3]).config, 'literal config')
  })
})

describe('composition row editing', () => {
  it('edits a deeply nested persona without losing unknown fields, metadata, or expressions', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const path = deepFreeze([1, 1, 0])
    const current = getCompositionRow(source, path)
    const replacement: PresetPluginRow = deepFreeze({
      ...current,
      config: { ...(current.config as Record<string, unknown>), prefix: 'edited deep prefix' },
    })
    const edited = replaceCompositionRow(source, path, replacement)
    const actual = getCompositionRow(edited, path)
    assert.deepEqual(actual, replacement)
    assert.deepEqual(getCompositionRow(edited, [0]), getCompositionRow(source, [0]))
    assert.deepEqual(getCompositionRow(edited, [1, 0]), getCompositionRow(source, [1, 0]))
    assert.deepEqual(getCompositionRow(edited, [1, 1, 1]), getCompositionRow(source, [1, 1, 1]))
    assert.deepEqual(getCompositionRow(edited, [3]), getCompositionRow(source, [3]))
    for (const groupPath of [[1], [1, 1]]) {
      const original = getCompositionRow(source, groupPath)
      assert.deepEqual(
        { ...getCompositionRow(edited, groupPath), config: original.config },
        original,
      )
    }
    assert.deepEqual({ ...edited, plugins: source.plugins }, source)
    assert.deepEqual(collectExpressions(edited), collectExpressions(source))
    assert.notEqual(actual, replacement)
    assert.notEqual(actual.config, replacement.config)
    assert.equal(JSON.stringify(source), before)
    assert.deepEqual(path, [1, 1, 0])
  })

  it('replaces the full row and supports arbitrary JSON config without merging', () => {
    const source = fixture()
    for (const config of [null, false, 0, 'text', ['array', null], { arbitrary: { json: true } }]) {
      const replacement = deepFreeze({ name: '@example/replacement', config })
      const edited = replaceCompositionRow(source, [1, 0], replacement)
      assert.deepEqual(getCompositionRow(edited, [1, 0]), replacement)
      assert.equal(getCompositionRow(edited, [1, 0]).futurePluginField, undefined)
      assert.deepEqual(getCompositionRow(edited, [1, 1]), getCompositionRow(source, [1, 1]))
    }
    assert.deepEqual(
      getCompositionRow(source, [1, 0]).futurePluginField,
      { nested: [{ preserved: 1 }] },
    )
  })

  it('appends complete groups at the root and rows to a specifically selected nested group', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const group: PresetPluginRow = deepFreeze({
      name: 'cordis:group',
      group: true,
      disabled: { __jsExpr: 'ctx.extraGroupDisabled' },
      isolate: { extra: 'extra-realm' },
      config: [{ name: '@example/added-child', config: { value: 1 } }],
      future: { preserved: true },
    })
    const rootEdited = appendCompositionRow(source, undefined, group)
    assert.deepEqual(rootEdited.plugins.slice(0, -1), source.plugins)
    assert.deepEqual(getCompositionRow(rootEdited, [4]), group)
    assert.equal(getCompositionRow(rootEdited, [4, 0]).name, '@example/added-child')
    assert.notEqual(getCompositionRow(rootEdited, [4]).config, group.config)

    const row = deepFreeze({ name: PERSONA_MODULE, config: { prefix: 'added deep' } })
    const nestedEdited = appendCompositionRow(source, [1, 1], row)
    assert.deepEqual(getCompositionRow(nestedEdited, [1, 1, 2]), row)
    assert.deepEqual(getCompositionRow(nestedEdited, [1, 0]), getCompositionRow(source, [1, 0]))
    assert.equal(nestedEdited.plugins.length, source.plugins.length)
    assert.equal(JSON.stringify(source), before)
  })

  it('appends to an empty group and an empty root list', () => {
    const source: PresetDefinition = deepFreeze({
      id: 'empty-group',
      plugins: [{ name: 'cordis:group', group: true, config: [] }],
    })
    const row = deepFreeze({ name: '@example/first', config: false })
    assert.deepEqual(getCompositionRow(appendCompositionRow(source, [0], row), [0, 0]), row)
    assert.deepEqual(appendCompositionRow({ id: 'empty', plugins: [] }, undefined, row).plugins, [row])
    assert.deepEqual(getCompositionRow(source, [0]).config, [])
  })

  it('removes a complete group and its descendants without removing same-name rows elsewhere', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const edited = removeCompositionRow(source, [1])
    assert.deepEqual(edited.plugins, [source.plugins[0], source.plugins[2], source.plugins[3]])
    assert.deepEqual(listCompositionRows(edited).map(({ path }) => path), [[0], [1], [2]])
    assert.equal(JSON.stringify(source), before)

    const nestedEdited = removeCompositionRow(source, [1, 1])
    assert.deepEqual(getCompositionRow(nestedEdited, [1]).config, [
      getCompositionRow(source, [1, 0]), getCompositionRow(source, [1, 2]),
    ])
    assert.deepEqual(getCompositionRow(nestedEdited, [3]), getCompositionRow(source, [3]))
  })

  it('keeps an empty group after its last child is removed', () => {
    const source: PresetDefinition = deepFreeze({
      id: 'last-child',
      plugins: [{ name: 'cordis:group', group: true, config: [{ name: '@example/child' }] }],
    })
    const edited = removeCompositionRow(source, [0, 0])
    assert.deepEqual(edited.plugins, [{ name: 'cordis:group', group: true, config: [] }])
    assert.equal(listCompositionRows(source).length, 2)
  })

  it('moves a root group as one unit and returns its new path', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const path = deepFreeze([1])
    const moved = moveCompositionRow(source, path, 1)
    assert.deepEqual(moved.path, [2])
    assert.deepEqual(moved.definition.plugins, [
      source.plugins[0], source.plugins[2], source.plugins[1], source.plugins[3],
    ])
    assert.deepEqual(getCompositionRow(moved.definition, [2, 1, 0]), getCompositionRow(source, [1, 1, 0]))
    const restored = moveCompositionRow(moved.definition, moved.path, -1)
    assert.deepEqual(restored.definition, source)
    assert.deepEqual(restored.path, path)
    assert.equal(JSON.stringify(source), before)
    assert.deepEqual(path, [1])
  })

  it('moves rows only within their own sibling list, in both directions', () => {
    const source = fixture()
    const moved = moveCompositionRow(source, [1, 1, 0], 1)
    assert.deepEqual(moved.path, [1, 1, 1])
    assert.deepEqual(getCompositionRow(moved.definition, [1, 1]).config, [
      getCompositionRow(source, [1, 1, 1]), getCompositionRow(source, [1, 1, 0]),
    ])
    assert.deepEqual(getCompositionRow(moved.definition, [1, 0]), getCompositionRow(source, [1, 0]))
    assert.deepEqual(getCompositionRow(moved.definition, [1, 2]), getCompositionRow(source, [1, 2]))
    const restored = moveCompositionRow(moved.definition, moved.path, -1)
    assert.deepEqual(restored.definition, source)
  })

  it('returns independent clones for every write, including supplied replacement and appended rows', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const row: PresetPluginRow = deepFreeze({
      name: '@example/input', config: { nested: { value: 'input' } }, future: { keep: true },
    })
    const results = [
      replaceCompositionRow(source, [1, 0], row),
      appendCompositionRow(source, [1, 1], row),
      removeCompositionRow(source, [3]),
      moveCompositionRow(source, [1], -1).definition,
    ]
    for (const result of results) {
      const rootPersona = listCompositionRows(result).find(({ row }) => row.id === 'root-persona')!.row
      ;(rootPersona.config as { prefix: string }).prefix = 'changed result'
      const outerGroup = listCompositionRows(result).find(({ row }) => row.id === 'outer')!.row
      ;(outerGroup.futureGroupField as { flags: unknown[] }).flags.push('changed result')
      assert.notEqual(result, source)
    }
    for (const result of results.slice(0, 2)) {
      const inserted = listCompositionRows(result).find(({ row }) => row.name === '@example/input')!.row
      ;(inserted.config as { nested: { value: string } }).nested.value = 'changed result'
      ;(inserted.future as { keep: boolean }).keep = false
    }
    assert.equal(JSON.stringify(source), before)
    assert.deepEqual(row, {
      name: '@example/input', config: { nested: { value: 'input' } }, future: { keep: true },
    })
  })
})

describe('composition path errors', () => {
  it('rejects malformed, missing, and non-group descendant paths for every row operation', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const invalidPaths: readonly (readonly number[])[] = [
      [], [-1], [0.5], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.MAX_SAFE_INTEGER + 1],
      [4], [1, 3], [1, 1, 2], [0, 0], [2, 0], [1, 1, 0, 0],
      ['1' as unknown as number], new Array<number>(1),
      null as unknown as readonly number[], undefined as unknown as readonly number[],
    ]
    const row = deepFreeze({ name: '@example/replacement' })
    for (const path of invalidPaths) {
      const operations = [
        () => getCompositionRow(source, path),
        () => replaceCompositionRow(source, path, row),
        () => removeCompositionRow(source, path),
        () => moveCompositionRow(source, path, 1),
      ]
      for (const operation of operations) assert.throws(operation, /Invalid composition path/)
      if (path !== undefined) {
        assert.throws(() => appendCompositionRow(source, path, row), /Invalid composition path/)
      }
    }
    for (const path of [[0], [2], [3], [1, 0], [1, 1, 0]]) {
      assert.throws(() => appendCompositionRow(source, path, row), /not a structural group/)
    }
    assert.equal(JSON.stringify(source), before)
  })

  it('rejects malformed group configs instead of treating them as empty lists', () => {
    for (const config of [undefined, null, false, 'text', { not: 'rows' }]) {
      const source: PresetDefinition = deepFreeze({
        id: 'bad-group',
        plugins: [{ name: 'cordis:group', group: true, config }],
      })
      assert.throws(() => listCompositionRows(source), /group config must be a list of rows/)
      assert.throws(() => getCompositionRow(source, [0, 0]), /group config must be a list of rows/)
      assert.throws(
        () => appendCompositionRow(source, [0], { name: '@example/new' }),
        /group config must be a list of rows/,
      )
      // The group itself remains addressable for replacement or removal.
      assert.equal(getCompositionRow(source, [0]).group, true)
      assert.deepEqual(removeCompositionRow(source, [0]).plugins, [])
    }
  })

  it('reports malformed rows and out-of-bounds moves as explicit errors', () => {
    const malformed: PresetDefinition = {
      id: 'bad-row', plugins: [null as unknown as PresetPluginRow],
    }
    assert.throws(() => listCompositionRows(malformed), /target is not a composition row/)
    assert.throws(() => getCompositionRow(malformed, [0]), /target is not a composition row/)

    const source = fixture()
    const before = cloneDefinition(source)
    for (const [path, delta] of [
      [[0], -1], [[3], 1], [[1, 0], -1], [[1, 2], 1], [[1, 1, 0], -1], [[1, 1, 1], 1],
    ] as const) {
      assert.throws(() => moveCompositionRow(source, path, delta), /sibling list boundary/)
    }
    for (const delta of [0, 2, -2, Number.NaN]) {
      assert.throws(() => moveCompositionRow(source, [1], delta as 1), /delta must be -1 or 1/)
    }
    assert.deepEqual(source, before)
  })
})
