/** Compact import summary: blockers stay visible; nonblocking details are disclosed on demand. */
import * as React from 'react'
import type { ImportPreview } from '../../../shared/types.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { IconAlert, IconError } from '../../components/icons.js'

function issueText(issue: { message: string; path?: string; detail?: string }): string {
  return `${issue.path ? issue.path + ': ' : ''}${issue.message}${issue.detail ? `（${issue.detail}）` : ''}`
}

export function ImportFeedback({ preview, checking, t }: {
  preview: ImportPreview | undefined
  checking: boolean
  t: Translate
}): React.ReactElement | null {
  if (!preview || checking) return null
  const errors = preview.validation.errors.filter((issue) => issue.code !== 'preset.conflict')
  const notes = [...preview.risks, ...preview.validation.warnings]
  return React.createElement('section', { className: 'dshpm-import-feedback', 'aria-label': t('import.previewHeading') },
    React.createElement('div', { className: 'dshpm-import-meta' },
      preview.definition.name ? React.createElement('strong', null, preview.definition.name) : null,
      React.createElement('span', { className: 'dshpm-count' }, t('detail.rowCount', { count: preview.definition.plugins.length })),
    ),
    preview.definition.description ? React.createElement('p', { className: 'dshpm-import-description' }, preview.definition.description) : null,
    preview.idConflict.conflict ? React.createElement('p', { className: 'dshpm-import-inline dshpm-import-inline--warning', role: 'status' },
      React.createElement(IconAlert, { size: 14 }), React.createElement('span', null, t('import.idConflictBody')),
    ) : null,
    errors.length === 0 ? null : React.createElement('div', { className: 'dshpm-import-inline dshpm-import-inline--error', role: 'alert' },
      React.createElement(IconError, { size: 14 }),
      React.createElement('ul', { className: 'dshpm-import-error-list' }, errors.map((issue, index) => React.createElement('li', { key: index }, issueText(issue)))),
    ),
    notes.length === 0 ? null : React.createElement('details', { className: 'dshpm-import-disclosure' },
      React.createElement('summary', null,
        React.createElement(IconAlert, { size: 14 }),
        React.createElement('span', null, t('import.diagnosticsSummary', { count: notes.length })),
        React.createElement('svg', { className: 'dshpm-import-chevron', width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true },
          React.createElement('path', { d: 'm4 6 4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      ),
      React.createElement('ul', { className: 'dshpm-import-issue-list' }, notes.map((issue, index) => React.createElement('li', { key: index }, issueText(issue)))),
    ),
  )
}
