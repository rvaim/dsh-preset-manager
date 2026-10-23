/** Read-only dialog content. Editing is a separate action on the preset card. */
import * as React from 'react'
import { YamlEditor } from '../../components/YamlEditor.js'
import type { PageState } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Badge, KeyValue, Loading } from '../../components/primitives.js'
import { presetDisplay } from '../preset-display.js'
import { stateOf } from './PresetList.js'

export interface PresetDetailViewProps {
  readonly state: PageState
  readonly t: Translate
}

export function PresetDetailView({ state, t }: PresetDetailViewProps): React.ReactElement {
  const detail = state.detail
  if (detail === undefined) return React.createElement(Loading, { label: t('common.loading') })
  const display = presetDisplay(detail.summary, t)
  const live = stateOf(detail.summary)
  return React.createElement('div', { className: 'dshpm-stack' },
    React.createElement('p', { className: 'dshpm-preset-description' }, display.description),
    React.createElement('div', { className: 'dshpm-row-meta' },
      React.createElement(Badge, { tone: live.tone }, t(live.key)),
      detail.summary.isDefault ? React.createElement(Badge, { tone: 'idle' }, t('state.default')) : null,
    ),
    React.createElement(KeyValue, { rows: [
      { key: 'ID', value: detail.definition.id },
      { key: t('detail.revisionLabel'), value: detail.revision.slice(0, 12) },
      { key: t('detail.compositionHeading'), value: t('detail.rowCount', { count: detail.definition.plugins.length }) },
    ] }),
    detail.summary.broken === undefined ? null : React.createElement('p', { className: 'dshpm-error-text' }, detail.summary.broken),
    React.createElement('label', { className: 'dshpm-label' }, t('detail.compositionHeading')),
    React.createElement(YamlEditor, { value: detail.yaml, readOnly: true, label: t('detail.compositionHeading') }),
    !detail.editable ? React.createElement('p', { className: 'dshpm-hint' }, t('detail.readOnlyNote')) : null,
  )
}
