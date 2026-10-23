/**
 * Read-only detail of one preset.
 *
 * Shows the complete declared composition with its YAML, because the point of
 * this view is to answer "what is actually in this preset" — including the
 * `!!js` expressions and `isolate` realms a summary would hide.
 *
 * Editing and deletion are offered only for presets this plugin owns. For
 * everything else the view explains why, rather than silently omitting the
 * buttons: a user who cannot find Delete needs to know it is by design.
 */
import * as React from 'react'
import type { PageState } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Badge, Button, Chip, KeyValue, Loading, Panel } from '../../components/primitives.js'
import {
  IconArrowLeft,
  IconCopy,
  IconEdit,
  IconExport,
  IconHistory,
  IconTrash,
} from '../../components/icons.js'
import { stateOf } from './PresetList.js'

export interface PresetDetailViewProps {
  readonly state: PageState
  readonly t: Translate
  readonly onEditPersona: () => void
  readonly onEditYaml: () => void
  readonly onHistory: () => void
  readonly onExport: () => void
  readonly onClone: () => void
  readonly onDelete: () => void
  readonly onBack: () => void
}

const OWNERSHIP_KEY = {
  managed: 'ownership.managed',
  builtin: 'ownership.builtin',
  'third-party': 'ownership.thirdParty',
} as const

export function PresetDetailView(props: PresetDetailViewProps): React.ReactElement {
  const { state, t } = props
  const detail = state.detail

  if (detail === undefined) {
    return React.createElement(
      Panel,
      null,
      React.createElement(Loading, { label: t('common.loading') }),
    )
  }

  const { summary, definition, yaml, editable } = detail
  const managed = summary.ownership === 'managed'
  const live = stateOf(summary)
  const name = summary.name === undefined || summary.name === '' ? summary.id : summary.name

  return React.createElement(
    'div',
    { className: 'dshpm-stack' },

    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement(
        Button,
        { variant: 'quiet', onClick: props.onBack },
        React.createElement(IconArrowLeft, { size: 13 }),
        t('detail.backToList'),
      ),
      React.createElement('span', { className: 'dshpm-spacer' }),
      React.createElement(
        Button,
        { onClick: props.onClone },
        React.createElement(IconCopy, { size: 13 }),
        t('action.clone'),
      ),
      React.createElement(
        Button,
        { onClick: props.onExport },
        React.createElement(IconExport, { size: 13 }),
        t('action.export'),
      ),
      managed
        ? React.createElement(
            Button,
            { variant: 'primary', onClick: props.onEditPersona },
            React.createElement(IconEdit, { size: 13 }),
            t('action.editPersona'),
          )
        : null,
    ),

    React.createElement(
      Panel,
      { title: name },
      React.createElement(
        'div',
        { className: 'dshpm-row-meta' },
        React.createElement(Chip, null, t(OWNERSHIP_KEY[summary.ownership])),
        React.createElement(
          Badge,
          {
            tone: live.tone,
            ...(summary.broken === undefined ? {} : { title: summary.broken }),
          },
          t(live.key),
        ),
        summary.isDefault
          ? React.createElement(Badge, { tone: 'warn' }, t('state.default'))
          : null,
      ),

      React.createElement(KeyValue, {
        rows: [
          {
            key: 'ID',
            value: React.createElement('code', { className: 'dshpm-code-inline' }, summary.id),
          },
          ...(summary.description === undefined
            ? []
            : [{ key: t('editor.description'), value: summary.description }]),
          {
            key: t('detail.revisionLabel'),
            value: React.createElement(
              'code',
              { className: 'dshpm-code-inline' },
              detail.revision.slice(0, 12),
            ),
          },
          {
            key: t('detail.compositionHeading'),
            value: t('detail.rowCount', { count: definition.plugins.length }),
          },
        ],
      }),

      summary.broken === undefined
        ? null
        : React.createElement('p', { className: 'dshpm-error-text' }, summary.broken),

      summary.isDefault
        ? React.createElement('p', { className: 'dshpm-hint' }, t('detail.defaultWarning'))
        : null,

      managed
        ? React.createElement(
            'div',
            { className: 'dshpm-toolbar' },
            React.createElement(
              Button,
              { small: true, onClick: props.onEditYaml },
              t('action.editYaml'),
            ),
            React.createElement(
              Button,
              { small: true, onClick: props.onHistory },
              React.createElement(IconHistory, { size: 12 }),
              t('action.history'),
            ),
            React.createElement('span', { className: 'dshpm-spacer' }),
            React.createElement(
              Button,
              { small: true, variant: 'danger', onClick: props.onDelete },
              React.createElement(IconTrash, { size: 12 }),
              t('action.delete'),
            ),
          )
        : React.createElement('p', { className: 'dshpm-hint' }, t('detail.readOnlyNote')),
    ),

    React.createElement(
      Panel,
      { title: t('detail.compositionHeading'), hint: t('detail.compositionHint') },
      React.createElement('textarea', {
        className: 'dshpm-textarea dshpm-textarea--code',
        readOnly: true,
        value: yaml,
        spellCheck: false,
        'aria-label': t('detail.compositionHeading'),
      }),
    ),

    React.createElement(
      Panel,
      { title: t('defaultNote.heading'), hint: t('defaultNote.body') },
      React.createElement(KeyValue, {
        rows: [
          {
            key: t('detail.dataLocation'),
            value: React.createElement(
              'code',
              { className: 'dshpm-code-inline' },
              state.snapshot?.dataDirectory ?? '',
            ),
          },
        ],
      }),
    ),
  )
}
