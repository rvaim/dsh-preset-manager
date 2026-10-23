/**
 * The preset list.
 *
 * One row per preset the Host reports, including presets that failed to
 * register — a preset the user owns must stay visible even when it is unusable,
 * otherwise a broken file looks deleted and invites the user to re-create it.
 *
 * Actions are gated by ownership rather than merely guarded on click: showing a
 * Delete button for a built-in preset and then refusing would be a misleading
 * affordance, so a non-managed row simply does not offer it.
 */
import * as React from 'react'
import type { PresetSummary } from '../../../shared/types.js'
import type { PageState } from '../../state/store.js'
import { registrationTone } from '../../pages/PresetManagerPage.js'
import { Badge } from '../../components/primitives.js'

export interface PresetListProps {
  readonly state: PageState
  readonly t: (key: string) => string
  readonly onView: (id: string) => void
  readonly onEditPersona: (id: string) => void
  readonly onHistory: (id: string) => void
  readonly onExport: (id: string) => void
  readonly onClone: () => void
  readonly onImport: () => void
  readonly onRetry: () => void
}

export function PresetList(props: PresetListProps): React.ReactElement {
  const { state, t } = props
  const presets = state.snapshot?.presets ?? []

  if (state.status === 'loading' && state.snapshot === undefined) {
    return React.createElement('p', { className: 'dshpm-muted' }, t('loading'))
  }
  if (state.status === 'failed' && state.snapshot === undefined) {
    return React.createElement(
      'div',
      { className: 'dshpm' },
      React.createElement('p', { className: 'dshpm-error-text' }, t('loadFailed')),
      React.createElement(
        'div',
        { className: 'dshpm-toolbar' },
        React.createElement(
          'button',
          { type: 'button', onClick: props.onRetry },
          t('retry'),
        ),
      ),
    )
  }

  if (presets.length === 0) {
    return React.createElement(
      'div',
      { className: 'dshpm-card' },
      React.createElement('p', { className: 'dshpm-muted' }, t('empty')),
      React.createElement(
        'div',
        { className: 'dshpm-toolbar' },
        React.createElement(
          'button',
          { type: 'button', className: 'dshpm-primary', onClick: props.onClone },
          t('action.clone'),
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: props.onImport },
          t('action.import'),
        ),
      ),
    )
  }

  return React.createElement(
    'table',
    { className: 'dshpm-table' },
    React.createElement(
      'thead',
      null,
      React.createElement(
        'tr',
        null,
        React.createElement('th', null, t('column.name')),
        React.createElement('th', null, t('column.ownership')),
        React.createElement('th', null, t('column.plugins')),
        React.createElement('th', null, t('column.state')),
        React.createElement('th', null, t('column.actions')),
      ),
    ),
    React.createElement(
      'tbody',
      null,
      presets.map((summary) =>
        React.createElement(Row, { key: summary.id, summary, ...props }),
      ),
    ),
  )
}

function Row(
  props: PresetListProps & { readonly summary: PresetSummary },
): React.ReactElement {
  const { summary, t } = props
  const managed = summary.ownership === 'managed'

  return React.createElement(
    'tr',
    null,

    // name + id
    React.createElement(
      'td',
      null,
      React.createElement(
        'div',
        { className: 'dshpm-name' },
        React.createElement(
          'strong',
          null,
          summary.name === undefined || summary.name === '' ? summary.id : summary.name,
        ),
        React.createElement('span', { className: 'dshpm-mono' }, summary.id),
        summary.description === undefined
          ? null
          : React.createElement('span', { className: 'dshpm-hint' }, summary.description),
      ),
    ),

    // ownership + default
    React.createElement(
      'td',
      null,
      React.createElement(
        'div',
        { className: 'dshpm-badges' },
        React.createElement(
          Badge,
          { tone: managed ? 'ok' : 'plain' },
          t(`ownership.${summary.ownership}`),
        ),
        summary.isDefault
          ? React.createElement(Badge, { tone: 'warn' }, t('detail.defaultBadge'))
          : null,
      ),
    ),

    // plugin count
    React.createElement('td', null, String(summary.pluginCount)),

    // state
    React.createElement(
      'td',
      null,
      React.createElement(
        'div',
        { className: 'dshpm-badges' },
        React.createElement(
          Badge,
          { tone: registrationTone(summary) },
          t(`registration.${summary.registration}`),
        ),
        summary.health === 'broken'
          ? React.createElement(
              Badge,
              {
                tone: 'err',
                ...(summary.broken === undefined ? {} : { title: summary.broken }),
              },
              t('health.broken'),
            )
          : null,
      ),
    ),

    // actions
    React.createElement(
      'td',
      null,
      React.createElement(
        'div',
        { className: 'dshpm-actions' },
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onView(summary.id) },
          t('action.view'),
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: props.onClone },
          t('action.clone'),
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onExport(summary.id) },
          t('action.export'),
        ),
        managed
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'button',
                { type: 'button', onClick: () => props.onEditPersona(summary.id) },
                t('action.edit'),
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: () => props.onHistory(summary.id) },
                t('action.history'),
              ),
            )
          : null,
      ),
    ),
  )
}
