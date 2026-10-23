/** Native-style preset cards: purpose first, contextual actions in each footer. */
import * as React from 'react'
import type { PresetSummary } from '../../../shared/types.js'
import type { PageState } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { ActionButton } from '../../components/ActionButton.js'
import { Badge, Button, EmptyState, Loading, Panel } from '../../components/primitives.js'
import { IconCopy, IconEdit, IconHistory, IconImport } from '../../components/icons.js'
import { presetDisplay } from '../preset-display.js'

export interface PresetListProps {
  readonly state: PageState
  readonly t: Translate
  readonly busy: boolean
  readonly ready: boolean
  readonly onView: (id: string) => void
  readonly onEditPersona: (id: string) => void
  readonly onHistory: (id: string) => void
  readonly onExport: (id: string) => Promise<boolean>
  readonly onImport: () => void
  readonly onData: () => void
  readonly onRetry: () => void
}

export function stateOf(summary: PresetSummary): { tone: 'ok' | 'warn' | 'err' | 'idle'; key: string } {
  if (summary.registration === 'failed') return { tone: 'err', key: 'state.failed' }
  if (summary.health === 'broken') return { tone: 'err', key: 'state.broken' }
  if (summary.registration === 'registered') return { tone: 'ok', key: 'state.registered' }
  if (summary.registration === 'registering') return { tone: 'warn', key: 'state.registering' }
  return { tone: 'idle', key: 'state.notRegistered' }
}

export function PresetList(props: PresetListProps): React.ReactElement {
  const { state, t } = props
  const presets = state.snapshot?.presets ?? []
  if (state.mount.status === 'mounting' || (state.status === 'loading' && !state.snapshot)) {
    return React.createElement(Panel, null, React.createElement(Loading, { label: t('common.loading') }))
  }
  if (state.mount.status === 'failed' || (state.status === 'failed' && !state.snapshot)) {
    return React.createElement(Panel, null, React.createElement(EmptyState, {
      title: t('list.loadFailedTitle'), body: t('list.loadFailedBody'),
      actions: React.createElement(Button, { onClick: props.onRetry }, t('common.retry')),
    }))
  }
  const groups = [
    { key: 'builtin', label: 'list.builtinGroup', rows: presets.filter((row) => row.ownership === 'builtin') },
    { key: 'managed', label: 'list.customGroup', rows: presets.filter((row) => row.ownership === 'managed') },
    { key: 'third-party', label: 'list.thirdPartyGroup', rows: presets.filter((row) => row.ownership === 'third-party') },
  ]
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'dshpm-toolbar' },
      React.createElement(Button, { variant: 'primary', disabled: !props.ready || props.busy, onClick: props.onImport },
        React.createElement(IconImport, { size: 14 }), t('action.import')),
      React.createElement('span', { className: 'dshpm-spacer' }),
      React.createElement('span', { className: 'dshpm-count' }, t('list.summary', {
        total: presets.length, managed: groups[1]!.rows.length,
      })),
      React.createElement(Button, { variant: 'quiet', disabled: !props.ready || props.busy, onClick: props.onData }, t('action.purge')),
    ),
    ...groups.map((group) => group.rows.length === 0 ? null : React.createElement('section', {
      key: group.key, className: 'dshpm-preset-group', 'aria-label': t(group.label),
    },
      React.createElement('h3', { className: 'dshpm-group-title' }, t(group.label)),
      React.createElement('div', { className: 'dshpm-preset-grid' }, group.rows.map((summary) =>
        React.createElement(PresetCard, { ...props, key: summary.id, summary }))),
    )),
    groups[1]!.rows.length === 0 ? React.createElement('section', { className: 'dshpm-preset-group' },
      React.createElement('h3', { className: 'dshpm-group-title' }, t('list.customGroup')),
      React.createElement('p', { className: 'dshpm-custom-hint' }, t('list.customHint')),
    ) : null,
    presets.length === 0 ? React.createElement(Panel, null, React.createElement(EmptyState, {
      title: t('list.emptyTitle'), body: t('list.emptyBody'),
      actions: React.createElement(Button, { variant: 'primary', disabled: props.busy, onClick: props.onImport }, t('list.emptyActionImport')),
    })) : null,
  )
}

export function PresetCard(props: PresetListProps & { readonly summary: PresetSummary }): React.ReactElement {
  const { summary, t } = props
  const display = presetDisplay(summary, t)
  const live = stateOf(summary)
  const disabled = props.busy || !props.ready
  const managed = summary.ownership === 'managed'
  return React.createElement('article', {
    className: 'dshpm-preset-card', 'data-default': summary.isDefault || undefined,
    'data-preset-id': summary.id,
  },
    React.createElement('div', { className: 'dshpm-preset-content' },
      React.createElement('div', { className: 'dshpm-preset-title-row' },
        React.createElement('h4', { className: 'dshpm-preset-name' }, display.name),
        summary.isDefault ? React.createElement('span', { className: 'dshpm-default-badge' }, t('state.default')) : null,
        React.createElement('code', { className: 'dshpm-preset-id' }, summary.id),
      ),
      React.createElement('p', { className: 'dshpm-preset-description' }, display.description),
      live.tone === 'ok' ? null : React.createElement(Badge, { tone: live.tone, title: summary.broken }, t(live.key)),
    ),
    React.createElement('div', { className: 'dshpm-preset-actions' },
      React.createElement(Button, { variant: 'quiet', disabled, onClick: () => props.onView(summary.id) }, t('action.viewConfig')),
      managed ? React.createElement(Button, { variant: 'quiet', disabled, onClick: () => props.onEditPersona(summary.id) },
        React.createElement(IconEdit, { size: 14 }), t('action.edit')) : null,
      React.createElement('span', { className: 'dshpm-spacer' }),
      managed ? React.createElement(Button, { variant: 'quiet', disabled, onClick: () => props.onHistory(summary.id), title: `${t('action.history')} · ${display.name}` },
        React.createElement(IconHistory, { size: 14 })) : null,
      React.createElement(ActionButton, {
        disabled, label: t('action.copy'), pendingLabel: t('feedback.copying'), successLabel: t('common.copied'), retryLabel: t('common.retry'),
        hint: t('feedback.copyHint'), icon: React.createElement(IconCopy, { size: 14 }),
        feedback: props.state.notice?.localAction?.id === summary.id && props.state.notice.localAction.kind === 'copy'
          ? [props.state.notice.message, ...(props.state.notice.details ?? [])].join('\n') : undefined,
        onAction: () => props.onExport(summary.id),
      }),
    ),
  )
}
