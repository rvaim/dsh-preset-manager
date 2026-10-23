import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import { CompositionTreeRow } from '../../client/features/persona-editor/CompositionEditor.js'
import { listCompositionRows } from '../../domain/composition-editor.js'
import type { PresetDefinition } from '../../shared/types.js'

function descendants(node: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...descendants(child.props.children)] : [])
}
const definition: PresetDefinition = { id: 'tree', plugins: [
  { name: 'cordis:group', group: true, id: 'root', config: [
    { name: 'cordis:group', group: true, id: 'nested', config: [{ name: 'first' }, { name: 'last' }] },
    { name: 'sibling' },
  ] },
] }

describe('composition tree presentation', () => {
  it('draws ancestor continuation and ends the final child branch at its label', () => {
    const entry = listCompositionRows(definition).find((row) => row.path.join('.') === '0.0.1')!
    const button = CompositionTreeRow({ definition, entry, t: (key) => key, disabled: false, selected: true, onSelect: () => {} })
    const nodes = descendants(button)
    const guides = nodes.filter((node) => node.props.className === 'dshpm-tree-guide')
    assert.equal(guides.length, 2)
    assert.equal(guides[0]!.props.style.height, '100%')
    assert.equal(guides[1]!.props.style.height, 17)
    assert.ok(nodes.some((node) => node.props.className === 'dshpm-tree-connector'))
    assert.equal(button.props['aria-current'], 'true')
  })
  it('keeps the name and package description in one aligned text column', () => {
    const entry = listCompositionRows(definition)[0]!
    const button = CompositionTreeRow({ definition, entry, t: (key) => key, disabled: false, selected: false, onSelect: () => {} })
    const text = descendants(button).find((node) => node.props.className === 'dshpm-tree-text')!
    const children = React.Children.toArray(text.props.children) as React.ReactElement[]
    assert.equal(children[0]!.props.className, 'dshpm-tree-label')
    assert.equal(children[1]!.props.className, 'dshpm-tree-description')
    assert.equal(descendants(button).filter((node) => node.props.className === 'dshpm-tree-guide').length, 0)
    assert.ok(descendants(button).some((node) => node.props.className === 'dshpm-tree-stem'))
  })
})
