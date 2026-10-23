/**
 * Retained revisions of one preset.
 *
 * Restoring is offered per revision and states the consequence inline: the
 * current revision is archived first, so restoring is itself undoable. Ordering
 * is newest-first, which is the order a user looking for "the version before my
 * mistake" expects.
 */
import * as React from 'react'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Chip, EmptyState, Panel } from '../../components/primitives.js'
import { IconArrowLeft, IconHistory } from '../../components/icons.js'

export interface HistoryViewProps {
  readonly state: PageState
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly onBack: () => void
}

const REASON_KEY: Record<string, string> = {
  create: 'history.reasonCreate',
  save: 'history.reasonSave',
  import: 'history.reasonImport',
  restore: 'history.reasonRestore',
}

export function HistoryView(props: HistoryViewProps): React.ReactElement {
  const { state, store, t } = props
  const entries = state.history
  const id = state.view.kind === 'history' ? state.view.id : ''

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
        t('common.back'),
      ),
    ),
    React.createElement(
      Panel,
      { title: t('history.heading'), hint: t('history.hint') },
      entries.length === 0
        ? React.createElement(EmptyState, {
            title: t('history.emptyTitle'),
            body: t('history.emptyBody'),
          })
        : React.createElement(
            'table',
            { className: 'dshpm-table' },
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', null, t('history.columnSavedAt')),
                React.createElement('th', null, t('history.columnPreset')),
                React.createElement('th', null, t('history.columnPlugins')),
                React.createElement('th', null, t('history.columnOrigin')),
                React.createElement('th', null, ''),
              ),
            ),
            React.createElement(
              'tbody',
              null,
              entries.map((entry) =>
                React.createElement(
                  'tr',
                  { key: entry.revision },
                  React.createElement('td', null, formatTime(entry.savedAt)),
                  React.createElement(
                    'td',
                    null,
                    React.createElement(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                      React.createElement('span', null, entry.name ?? entry.revision.slice(0, 12)),
                      React.createElement(
                        'span',
                        { className: 'dshpm-mono dshpm-muted' },
                        entry.revision.slice(0, 12),
                      ),
                    ),
                  ),
                  React.createElement('td', { className: 'dshpm-num' }, String(entry.pluginCount)),
                  React.createElement(
                    'td',
                    null,
                    React.createElement(Chip, null, t(REASON_KEY[entry.reason] ?? 'history.reasonSave')),
                  ),
                  React.createElement(
                    'td',
                    { style: { textAlign: 'right' } },
                    React.createElement(
                      Button,
                      {
                        small: true,
                        disabled: state.busy,
                        onClick: () => void store.restoreRevision(id, entry.revision),
                      },
                      React.createElement(IconHistory, { size: 12 }),
                      t('action.restore'),
                    ),
                  ),
                ),
              ),
            ),
          ),
    ),
  )
}

/** Render an ISO timestamp in the browser's own locale and zone. */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
