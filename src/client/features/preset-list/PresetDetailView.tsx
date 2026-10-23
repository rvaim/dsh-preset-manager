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
import { Badge, Card, SectionHeader } from '../../components/primitives.js'
import { registrationTone } from '../../pages/PresetManagerPage.js'

export interface PresetDetailViewProps {
  readonly state: PageState
  readonly t: (key: string) => string
  readonly onEditPersona: () => void
  readonly onEditYaml: () => void
  readonly onHistory: () => void
  readonly onExport: () => void
  readonly onClone: () => void
  readonly onDelete: () => void
  readonly onBack: () => void
}

export function PresetDetailView(props: PresetDetailViewProps): React.ReactElement {
  const { state, t } = props
  const detail = state.detail

  if (detail === undefined) {
    return React.createElement('p', { className: 'dshpm-muted' }, t('loading'))
  }

  const { summary, definition, yaml, editable } = detail
  const managed = summary.ownership === 'managed'

  return React.createElement(
    'div',
    { className: 'dshpm' },

    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: summary.name ?? summary.id }),
      React.createElement(
        'div',
        { className: 'dshpm-badges' },
        React.createElement(Badge, { tone: managed ? 'ok' : 'plain' }, t(`ownership.${summary.ownership}`)),
        React.createElement(
          Badge,
          { tone: registrationTone(summary) },
          t(`registration.${summary.registration}`),
        ),
        summary.isDefault
          ? React.createElement(Badge, { tone: 'warn' }, t('detail.defaultBadge'))
          : null,
      ),
      React.createElement(
        'div',
        { className: 'dshpm-name' },
        React.createElement('span', { className: 'dshpm-mono' }, summary.id),
        summary.description === undefined
          ? null
          : React.createElement('span', { className: 'dshpm-hint' }, summary.description),
      ),
      summary.broken === undefined
        ? null
        : React.createElement('p', { className: 'dshpm-error-text' }, summary.broken),
      React.createElement(
        'div',
        { className: 'dshpm-actions' },
        React.createElement(
          'button',
          { type: 'button', onClick: props.onClone },
          t('action.clone'),
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: props.onExport },
          t('action.export'),
        ),
        managed
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                'button',
                { type: 'button', className: 'dshpm-primary', onClick: props.onEditPersona },
                t('action.editPersona'),
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: props.onEditYaml },
                t('action.editYaml'),
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: props.onHistory },
                t('action.history'),
              ),
              React.createElement(
                'button',
                { type: 'button', className: 'dshpm-danger', onClick: props.onDelete },
                t('action.delete'),
              ),
            )
          : null,
      ),
      editable
        ? null
        : React.createElement('p', { className: 'dshpm-hint' }, t('detail.readonlyNote')),
    ),

    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, {
        title: t('detail.composition'),
        hint: t('detail.compositionHint'),
      }),
      React.createElement(
        'p',
        { className: 'dshpm-muted' },
        `${definition.plugins.length} rows · revision ${detail.revision.slice(0, 12)}`,
      ),
      React.createElement('textarea', {
        className: 'dshpm-code dshpm-preauth',
        readOnly: true,
        value: yaml,
        spellCheck: false,
        'aria-label': t('detail.composition'),
      }),
    ),

    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('defaultNote.title'), hint: t('defaultNote.body') }),
      React.createElement(
        'p',
        { className: 'dshpm-mono' },
        `${t('detail.dataDirectory')}: ${state.snapshot?.dataDirectory ?? ''}`,
      ),
    ),
  )
}
