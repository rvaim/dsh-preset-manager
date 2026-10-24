import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as React from 'react'
import type { ImportPreview } from '../../shared/types.js'
import { ImportFeedback } from '../../client/features/preset-import/ImportFeedback.js'
import { zh } from '../../client/locales/index.js'
import type { Translate } from '../../client/pages/PresetManagerPage.js'

const t: Translate = (key, params = {}) => (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
function elements(node: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...elements(child.props.children)] : [])
}
function text(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? text(child.props.children) : String(child)).filter(Boolean).join(' ')
}
function preview(): ImportPreview {
  const definition = { id: 'candidate', name: '标准增强', description: '完整用途说明', plugins: [{ name: '@example/plugin' }] }
  return {
    document: { kind: 'dsh-agent-preset-share', formatVersion: 1, preset: definition },
    definition, validation: { ok: true, errors: [], warnings: [] }, risks: [], idConflict: { conflict: false }, yaml: '[]\n',
  }
}

describe('compact import feedback', () => {
  it('starts with a collapsed count while retaining every full risk and warning in native details', () => {
    const value: ImportPreview = {
      ...preview(),
      risks: [{ code: 'compat.expression', path: 'plugins[3].disabled', message: 'Conditional expression', detail: "process.platform === 'win32'" }],
      validation: { ok: true, errors: [], warnings: [{ code: 'test.warning', message: 'A complete warning that must remain available' }] },
    }
    const nodes = elements(ImportFeedback({ preview: value, checking: false, t }))
    const disclosures = nodes.filter((node) => node.type === 'details')
    assert.equal(disclosures.length, 1)
    assert.equal(disclosures[0]!.props.open, undefined)
    const summary = elements(disclosures[0]!.props.children).find((node) => node.type === 'summary')!
    assert.equal(text(summary.props.children), '风险与提醒 · 2 项')
    assert.match(text(disclosures[0]!.props.children), /plugins\[3\]\.disabled: Conditional expression/)
    assert.match(text(disclosures[0]!.props.children), /process\.platform === 'win32'/)
    assert.match(text(disclosures[0]!.props.children), /A complete warning that must remain available/)
    assert.equal(nodes.some((node) => node.props.className?.includes('dshpm-notice')), false)
  })

  it('keeps one visible ID conflict outside the folded nonblocking details', () => {
    const value: ImportPreview = {
      ...preview(), idConflict: { conflict: true },
      validation: { ok: false, errors: [{ code: 'preset.conflict', path: 'id', message: 'Duplicate identity from the Host' }], warnings: [] },
      risks: [{ code: 'compat.expression', message: 'Conditional expression' }],
    }
    const result = ImportFeedback({ preview: value, checking: false, t })
    const nodes = elements(result)
    const conflict = nodes.find((node) => node.props.role === 'status')!
    assert.ok(conflict)
    assert.equal(text(conflict.props.children), t('import.idConflictBody'))
    assert.equal(text(result).split(t('import.idConflictBody')).length - 1, 1)
    assert.equal(text(result).includes('Duplicate identity from the Host'), false)
    const details = nodes.find((node) => node.type === 'details')!
    assert.equal(elements(details).includes(conflict), false)
    assert.equal(nodes.some((node) => node.type === 'input' || node.type === 'textarea'), false)
  })

  it('omits empty disclosures and stale feedback while the next validation is pending', () => {
    const value = preview()
    const result = ImportFeedback({ preview: value, checking: false, t })
    assert.equal(elements(result).some((node) => node.type === 'details'), false)
    assert.match(text(result), /标准增强/)
    assert.match(text(result), /完整用途说明/)
    assert.equal(ImportFeedback({ preview: value, checking: true, t }), null)
    assert.equal(ImportFeedback({ preview: undefined, checking: false, t }), null)
  })

  it('leaves blocking validation errors visible even when notes are folded', () => {
    const value: ImportPreview = {
      ...preview(),
      validation: { ok: false, errors: [{ code: 'compat.missing-module', path: 'plugins[0]', message: 'Required module is missing' }], warnings: [] },
      risks: [{ code: 'compat.expression', message: 'Conditional expression' }],
    }
    const nodes = elements(ImportFeedback({ preview: value, checking: false, t }))
    const alert = nodes.find((node) => node.props.role === 'alert')!
    assert.ok(alert)
    assert.match(text(alert.props.children), /Required module is missing/)
    const details = nodes.find((node) => node.type === 'details')!
    assert.equal(elements(details).includes(alert), false)
    assert.equal(details.props.open, undefined)
  })
})
