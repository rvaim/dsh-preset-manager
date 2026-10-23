import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { indentGuideColumns } from '../../client/components/yaml-indentation.js'

describe('indentGuideColumns', () => {
  it('counts nested leading spaces as columns, including partial indentation levels', () => {
    const lines = ['root:', '  child:', '    leaf: value', '   partial: value', 'plain:    value']
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index)), [0, 2, 4, 3, 0])
  })

  it('advances tabs to the next default tab stop, including mixed spaces and tabs', () => {
    const lines = ['\tkey:', ' \tkey:', '  \tkey:', '\t key:', '\t\tkey:', '\t \tkey:']
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index)), [2, 2, 4, 3, 4, 4])
  })

  it('uses custom tab stops for content and inherited blank-line indentation', () => {
    const lines = ['\tkey:', ' \tkey:', '    \tkey:', '\t \tkey:']
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index, 4)), [4, 4, 8, 8])
    assert.equal(indentGuideColumns([' \tfirst:', '', '\t \tsecond:'], 1, 4), 4)
  })

  it('ends blank-line scopes at the shallower nearest nonblank line', () => {
    const lines = ['root:', '  branch:', '    leaf: value', '', ' \t', '  sibling: value', '', 'next:']
    assert.equal(indentGuideColumns(lines, 3), 2)
    assert.equal(indentGuideColumns(lines, 4), 2)
    assert.equal(indentGuideColumns(lines, 6), 0)
  })

  it('uses only the nearest nonblank line on either side of a blank run', () => {
    const lines = ['root:', '  branch:', '', '    leaf: value', 'next:']
    assert.equal(indentGuideColumns(lines, 2), 2)
    assert.equal(indentGuideColumns(['    first:', '', '  second:', 'root:'], 1), 2)
  })

  it('ignores the indentation typed into whitespace-only lines', () => {
    const lines = ['  first:', '      ', '\t\t\t', ' \t ', '    second:']
    assert.deepEqual([1, 2, 3].map((index) => indentGuideColumns(lines, index)), [2, 2, 2])
  })

  it('inherits the last nonblank indentation across trailing blank lines', () => {
    const lines = ['root:', '  branch:', '    leaf: value', '', ' \t ', '']
    assert.deepEqual([3, 4, 5].map((index) => indentGuideColumns(lines, index)), [4, 4, 4])
  })

  it('inherits the first nonblank indentation across leading blank lines', () => {
    const lines = ['', '\t', ' ', '    first: value']
    assert.deepEqual([0, 1, 2].map((index) => indentGuideColumns(lines, index)), [4, 4, 4])
  })

  it('returns zero for empty documents and documents containing only whitespace', () => {
    assert.equal(indentGuideColumns([], 0), 0)
    assert.equal(indentGuideColumns([''], 0), 0)
    const lines = ['', ' \t ', '\t', '   ']
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index)), [0, 0, 0, 0])
  })

  it('returns zero for negative, out-of-range, fractional, and nonfinite indexes', () => {
    const lines = ['  key: value']
    for (const index of [-1, 1, 10, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(indentGuideColumns(lines, index), 0)
    }
  })

  it('calculates indentation for incomplete JSON and YAML without parsing', () => {
    const lines = ['{', '   "items": [', ' \tkey: [', '  - unfinished: "', '   }']
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index)), [0, 3, 2, 2, 3])
  })

  it('preserves the original lines when given an immutable input', () => {
    const lines: readonly string[] = Object.freeze(['  root:  ', ' \t', '', '\t\tchild: [', ''])
    const before = [...lines]
    assert.deepEqual(lines.map((_, index) => indentGuideColumns(lines, index)), [2, 2, 2, 4, 4])
    assert.deepEqual(lines, before)
    assert.equal(Object.isFrozen(lines), true)
  })

  it('falls back to two-column tab stops for invalid tab widths', () => {
    for (const tabSize of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(indentGuideColumns([' \tkey: value'], 0, tabSize), 2)
    }
  })
})
