/**
 * Retained revisions of one preset.
 *
 * Restoring is offered per revision and states the consequence inline: the
 * current revision is archived first, so restoring is itself undoable. Ordering
 * is newest-first, which is the order a user looking for "the version before my
 * mistake" expects.
 */
import * as React from 'react'
import type { PageState } from '../../state/store.js'
import type { PresetManagerStore } from '../../state/store.js'
import { Badge, Card, SectionHeader } from '../../components/primitives.js'

export interface HistoryViewProps {
  readonly state: PageState
  readonly store: PresetManagerStore
  readonly t: (key: string) => string
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

  return React.createElement(
    'div',
    { className: 'dshpm' },
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('history.title'), hint: t('history.restoreWarning') }),
      entries.length === 0
        ? React.createElement('p', { className: 'dshpm-muted' }, t('history.empty'))
        : React.createElement(
            'table',
            { className: 'dshpm-table' },
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', null, t('history.savedAt')),
                React.createElement('th', null, t('column.name')),
                React.createElement('th', null, t('column.plugins')),
                React.createElement('th', null, t('history.reason')),
                React.createElement('th', null, t('column.actions')),
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
                      { className: 'dshpm-name' },
                      React.createElement('span', null, entry.name ?? entry.revision.slice(0, 12)),
                      React.createElement('span', { className: 'dshpm-mono' }, entry.revision.slice(0, 12)),
                    ),
                  ),
                  React.createElement('td', null, String(entry.pluginCount)),
                  React.createElement(
                    'td',
                    null,
                    React.createElement(
                      Badge,
                      { tone: 'plain' },
                      t(REASON_KEY[entry.reason] ?? 'history.reasonSave'),
                    ),
                  ),
                  React.createElement(
                    'td',
                    null,
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        disabled: state.busy,
                        onClick: () =>
                          void store.restoreRevision(state.view.kind === 'history' ? state.view.id : '', entry.revision),
                      },
                      t('action.restore'),
                    ),
                  ),
                ),
              ),
            ),
          ),
    ),
    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement('button', { type: 'button', onClick: props.onBack }, t('back')),
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
