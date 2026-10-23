import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { yamlLanguage } from '@codemirror/lang-yaml'
import { highlightTree, tags } from '@lezer/highlight'
import { yamlHighlightStyle } from '../../client/components/YamlEditor.js'

function highlighted(source: string): { text: string; classes: string }[] {
  const result: { text: string; classes: string }[] = []
  highlightTree(yamlLanguage.parser.parse(source), yamlHighlightStyle, (from, to, classes) => result.push({ text: source.slice(from, to), classes }))
  return result
}

describe('YAML syntax presentation', () => {
  it('gives keys, scalar values and comments distinct syntax classes', () => {
    const result = highlighted('name: "Preset"\nconfig:\n  prefix: Plain prompt\n  # comment\n')
    const key = yamlHighlightStyle.style([tags.definition(tags.propertyName)])!
    const string = yamlHighlightStyle.style([tags.string])!
    const comment = yamlHighlightStyle.style([tags.comment])!
    assert.notEqual(key, string)
    assert.notEqual(string, comment)
    assert.ok(result.some((span) => span.text === 'name' && span.classes.includes(key)))
    assert.ok(result.some((span) => span.text.includes('Preset') && span.classes.includes(string)))
    assert.ok(result.some((span) => span.text.includes('Plain prompt') && span.classes.includes(string)))
    assert.ok(result.some((span) => span.text.includes('# comment') && span.classes.includes(comment)))
  })
  it('highlights Loader tags without interpreting their expressions', () => {
    const result = highlighted('disabled: !!js "ctx.platform === \'win32\'"\n')
    const meta = yamlHighlightStyle.style([tags.typeName])!
    assert.ok(result.some((span) => span.text.includes('!!js') && span.classes.includes(meta)))
  })
  it('supports keys inside nested groups and incomplete input during typing', () => {
    const result = highlighted('plugins:\n  - name: cordis:group\n    config:\n      - name: example\n        config: {')
    const key = yamlHighlightStyle.style([tags.propertyName])!
    assert.ok(result.filter((span) => span.text === 'name' && span.classes.includes(key)).length === 2)
  })
})
