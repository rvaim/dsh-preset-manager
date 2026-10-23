/**
 * The preset list.
 *
 * A row list, not a grid of cards: these are records with the same fields, and a
 * grid of equal cards would turn a scannable comparison into a hunt. Each row
 * carries identity, ownership, live state, and the actions that make sense for
 * that ownership — a built-in preset never shows Delete, because offering a
 * control and then refusing it is a worse answer than not offering it.
 */
import * as React from 'react'
import type { PresetSummary } from '../../../shared/types.js'
import type { PageState } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Loading,
  Panel,
} from '../../components/primitives.js'
import { IconCopy, IconEdit, IconExport, IconHistory, IconImport } from '../../components/icons.js'

export interface PresetListProps {
  readonly state: PageState
  readonly t: Translate
  readonly busy: boolean
  readonly ready: boolean
  readonly onView: (id: string) => void
  readonly onEditPersona: (id: string) => void
  readonly onHistory: (id: string) => void
  readonly onExport: (id: string) => void
  readonly onClone: () => void
  readonly onImport: () => void
  readonly onData: () => void
  readonly onRetry: () => void
}

/** Map a summary's live state to one badge tone and one label key. */
export function stateOf(summary: PresetSummary): {
  tone: 'ok' | 'warn' | 'err' | 'idle'
  key: string
} {
  if (summary.registration === 'failed') return { tone: 'err', key: 'state.failed' }
  if (summary.health === 'broken') return { tone: 'err', key: 'state.broken' }
  if (summary.registration === 'registered') return { tone: 'ok', key: 'state.registered' }
  if (summary.registration === 'registering') return { tone: 'warn', key: 'state.registering' }
  return { tone: 'idle', key: 'state.notRegistered' }
}

const OWNERSHIP_KEY: Record<PresetSummary['ownership'], string> = {
  managed: 'ownership.managed',
  builtin: 'ownership.builtin',
  'third-party': 'ownership.thirdParty',
}

export function PresetList(props: PresetListProps): React.ReactElement {
  const { state, t } = props
  const presets = state.snapshot?.presets ?? []
  const managedCount = presets.filter((preset) => preset.ownership === 'managed').length

  // The mount owns the "not ready" story; the list only reports what it knows.
  if (state.mount.status === 'mounting') {
    return React.createElement(
      Panel,
      null,
      React.createElement(Loading, { label: t('common.loading') }),
    )
  }
  if (state.mount.status === 'failed') {
    return React.createElement(
      Panel,
      null,
      React.createElement(EmptyState, {
        title: t('list.loadFailedTitle'),
        body: t('list.loadFailedBody'),
        actions: React.createElement(Button, { onClick: props.onRetry }, t('common.retry')),
      }),
    )
  }
  if (state.status === 'loading' && state.snapshot === undefined) {
    return React.createElement(
      Panel,
      null,
      React.createElement(Loading, { label: t('common.loading') }),
    )
  }
  if (state.status === 'failed' && state.snapshot === undefined) {
    return React.createElement(
      Panel,
      null,
      React.createElement(EmptyState, {
        title: t('list.loadFailedTitle'),
        body: t('list.loadFailedBody'),
        actions: React.createElement(Button, { onClick: props.onRetry }, t('common.retry')),
      }),
    )
  }

  return React.createElement(
    React.Fragment,
    null,

    // ---- toolbar
    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement(
        Button,
        {
          variant: 'primary',
          disabled: !props.ready || props.busy,
          onClick: props.onImport,
        },
        React.createElement(IconImport, { size: 13 }),
        t('action.import'),
      ),
      React.createElement(
        Button,
        { disabled: !props.ready || props.busy, onClick: props.onClone },
        React.createElement(IconCopy, { size: 13 }),
        t('action.clone'),
      ),
      React.createElement('span', { className: 'dshpm-spacer' }),
      React.createElement(
        'span',
        { className: 'dshpm-count' },
        t('list.summary', { total: presets.length, managed: managedCount }),
      ),
      React.createElement(
        Button,
        { variant: 'quiet', small: true, onClick: props.onData },
        t('action.purge'),
      ),
    ),

    // ---- list
    presets.length === 0
      ? React.createElement(
          Panel,
          null,
          React.createElement(EmptyState, {
            title: t('list.emptyTitle'),
            body: t('list.emptyBody'),
            actions: React.createElement(
              React.Fragment,
              null,
              React.createElement(
                Button,
                { variant: 'primary', onClick: props.onClone },
                t('list.emptyActionClone'),
              ),
              React.createElement(
                Button,
                { onClick: props.onImport },
                t('list.emptyActionImport'),
              ),
            ),
          }),
        )
      : React.createElement(
          Panel,
          null,
          React.createElement(
            'div',
            { className: 'dshpm-list' },
            presets.map((summary) =>
              React.createElement(Row, { key: summary.id, summary, ...props }),
            ),
          ),
        ),
  )
}

function Row(props: PresetListProps & { readonly summary: PresetSummary }): React.ReactElement {
  const { summary, t } = props
  const managed = summary.ownership === 'managed'
  const live = stateOf(summary)
  const name = summary.name === undefined || summary.name === '' ? summary.id : summary.name

  return React.createElement(
    'div',
    { className: 'dshpm-row' },

    React.createElement(
      'div',
      { className: 'dshpm-row-main' },
      React.createElement(
        'div',
        { className: 'dshpm-row-title' },
        React.createElement('span', { className: 'dshpm-row-name' }, name),
        React.createElement('span', { className: 'dshpm-row-id' }, summary.id),
      ),
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
        React.createElement(
          'span',
          { className: 'dshpm-count' },
          t('detail.rowCount', { count: summary.pluginCount }),
        ),
      ),
      summary.description === undefined
        ? null
        : React.createElement('span', { className: 'dshpm-row-desc' }, summary.description),
    ),

    React.createElement(
      'div',
      { className: 'dshpm-row-actions' },
      React.createElement(
        Button,
        { small: true, onClick: () => props.onView(summary.id), title: t('action.view') },
        t('action.view'),
      ),
      managed
        ? React.createElement(
            Button,
            {
              small: true,
              onClick: () => props.onEditPersona(summary.id),
              title: t('action.editPersona'),
            },
            React.createElement(IconEdit, { size: 12 }),
            t('action.edit'),
          )
        : React.createElement(
            Button,
            { small: true, onClick: props.onClone, title: t('action.clone') },
            React.createElement(IconCopy, { size: 12 }),
            t('action.clone'),
          ),
      React.createElement(
        Button,
        {
          small: true,
          variant: 'quiet',
          onClick: () => props.onExport(summary.id),
          title: t('action.export'),
        },
        React.createElement(IconExport, { size: 12 }),
      ),
      managed
        ? React.createElement(
            Button,
            {
              small: true,
              variant: 'quiet',
              onClick: () => props.onHistory(summary.id),
              title: t('action.history'),
            },
            React.createElement(IconHistory, { size: 12 }),
          )
        : null,
    ),
  )
}
