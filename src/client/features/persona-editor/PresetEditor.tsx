/**
 * The editor: one draft, two ways to see it.
 *
 * The Persona form and the YAML box are two projections of the *same* draft in
 * the store. Switching between them changes only which projection is rendered,
 * so a change made in one is present in the other. That is the requirement this
 * module exists to satisfy; a per-form copy would silently diverge.
 *
 * Persona edits go through the domain's `writePersona`, which rewrites exactly
 * the persona plugin's config and leaves every other row structurally
 * untouched — so editing a persona can never disturb another plugin's settings.
 */
import * as React from 'react'
import type { PresetDefinition } from '../../../shared/types.js'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import { formatIssue } from '../../state/store.js'
import { Card, Field, Notice, SectionHeader } from '../../components/primitives.js'
import { readPersona, writePersona } from '../../../domain/persona-editor.js'

export interface PresetEditorProps {
  readonly state: PageState
  readonly store: PresetManagerStore
  readonly t: (key: string) => string
  readonly mode: 'persona' | 'yaml'
  readonly onModeChange: (mode: 'persona' | 'yaml') => void
  readonly onBack: () => void
  readonly onSaved: () => void
}

export function PresetEditor(props: PresetEditorProps): React.ReactElement {
  const { state, store, t, mode } = props
  const draft = state.draft

  if (draft === undefined) {
    return React.createElement('p', { className: 'dshpm-muted' }, t('loading'))
  }

  const persona = readPersona(draft)

  /** Apply a persona field change to the shared draft. */
  const updatePersona = (patch: Partial<{ prefix: string; suffix: string; complete: boolean }>): void => {
    store.setDraft(writePersona(draft, patch))
  }

  /** Apply a metadata change to the shared draft. */
  const updateMeta = (patch: Partial<Pick<PresetDefinition, 'name' | 'description'>>): void => {
    store.setDraft({ ...draft, ...patch })
  }

  return React.createElement(
    'div',
    { className: 'dshpm' },

    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement(
        'div',
        { className: 'dshpm-tabs' },
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-pressed': mode === 'persona',
            onClick: () => props.onModeChange('persona'),
          },
          t('editor.personaTitle'),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'aria-pressed': mode === 'yaml',
            onClick: () => props.onModeChange('yaml'),
          },
          t('editor.yamlTitle'),
        ),
      ),
      React.createElement('span', { className: 'dshpm-spacer' }),
      React.createElement(
        'button',
        { type: 'button', disabled: state.busy, onClick: () => void store.prepareSave() },
        t('editor.validate'),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dshpm-primary',
          disabled: state.busy,
          onClick: () => void store.save(),
        },
        t('action.save'),
      ),
      React.createElement(
        'button',
        { type: 'button', onClick: props.onBack },
        t('action.cancel'),
      ),
    ),

    React.createElement('p', { className: 'dshpm-hint' }, t('editor.draftShared')),

    // ---- metadata, shared by both modes
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('detail.metadata') }),
      React.createElement(
        'div',
        { className: 'dshpm-row' },
        React.createElement(
          Field,
          { label: t('editor.name') },
          React.createElement('input', {
            type: 'text',
            value: draft.name ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              updateMeta({ name: event.target.value }),
          }),
        ),
        React.createElement(
          Field,
          { label: t('editor.description') },
          React.createElement('input', {
            type: 'text',
            value: draft.description ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              updateMeta({ description: event.target.value }),
          }),
        ),
      ),
      React.createElement('p', { className: 'dshpm-mono' }, draft.id),
    ),

    mode === 'persona'
      ? React.createElement(PersonaForm, { persona, t, updatePersona, present: persona.present })
      : React.createElement(YamlForm, { state, store, t }),

    state.yamlError === undefined
      ? null
      : React.createElement(Notice, {
          level: 'error',
          message: t('editor.yamlInvalid'),
          details: [state.yamlError],
        }),

    state.validation === undefined || state.validation.ok
      ? null
      : React.createElement(Notice, {
          level: 'error',
          message: t('editor.validate'),
          details: state.validation.errors.map(formatIssue),
        }),

    React.createElement(DiffBlock, { state, t }),
  )
}

function PersonaForm(props: {
  persona: ReturnType<typeof readPersona>
  present: boolean
  t: (key: string) => string
  updatePersona: (patch: Partial<{ prefix: string; suffix: string; complete: boolean }>) => void
}): React.ReactElement {
  const { persona, t, updatePersona } = props
  const { fields } = persona

  return React.createElement(
    Card,
    null,
    React.createElement(SectionHeader, { title: t('editor.personaTitle') }),
    React.createElement(
      Field,
      { label: t('editor.prefix') },
      React.createElement('textarea', {
        value: fields.prefix,
        spellCheck: false,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          updatePersona({ prefix: event.target.value }),
      }),
    ),
    React.createElement(
      Field,
      { label: t('editor.suffix') },
      React.createElement('textarea', {
        value: fields.suffix,
        spellCheck: false,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          updatePersona({ suffix: event.target.value }),
      }),
    ),
    React.createElement(
      'label',
      { className: 'dshpm-inline' },
      React.createElement('input', {
        type: 'checkbox',
        className: 'dshpm-checkbox',
        checked: fields.complete,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          updatePersona({ complete: event.target.checked }),
      }),
      React.createElement('span', null, t('editor.complete')),
    ),
    React.createElement('p', { className: 'dshpm-hint' }, t('editor.completeHint')),
    props.present
      ? null
      : React.createElement('p', { className: 'dshpm-hint' }, t('editor.personaMissing')),
  )
}

function YamlForm(props: {
  state: PageState
  store: PresetManagerStore
  t: (key: string) => string
}): React.ReactElement {
  const { state, store, t } = props
  return React.createElement(
    Card,
    null,
    React.createElement(SectionHeader, {
      title: t('editor.yamlTitle'),
      hint: t('editor.yamlHint'),
    }),
    React.createElement('textarea', {
      className: 'dshpm-code',
      value: state.yamlText,
      spellCheck: false,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        void store.setYaml(event.target.value),
    }),
  )
}

/**
 * The pending diff, shown before a save commits.
 *
 * Presenting the diff first is what makes saving an informed action: the user
 * sees exactly which plugin rows are added, removed, or changed instead of
 * approving an opaque overwrite.
 */
function DiffBlock(props: { state: PageState; t: (key: string) => string }): React.ReactElement | null {
  const { state, t } = props
  const diff = state.diff
  if (diff === undefined) return null

  const metadataChanges = diff.changedMetadata.map(
    (field) =>
      `${field.field}: ${field.before ?? '(空)'} → ${field.after ?? '(空)'}`,
  )

  const nothing =
    diff.changedMetadata.length === 0 &&
    diff.addedPlugins.length === 0 &&
    diff.removedPlugins.length === 0 &&
    diff.changedPlugins.length === 0

  return React.createElement(
    Card,
    null,
    React.createElement(SectionHeader, { title: t('editor.diffTitle') }),
    nothing
      ? React.createElement('p', { className: 'dshpm-muted' }, t('editor.noChanges'))
      : React.createElement(
          'div',
          { className: 'dshpm' },
          metadataChanges.length === 0
            ? null
            : React.createElement(
                'div',
                null,
                React.createElement('span', { className: 'dshpm-label' }, t('editor.diffMetadata')),
                React.createElement(
                  'ul',
                  { className: 'dshpm-list' },
                  metadataChanges.map((line, index) =>
                    React.createElement('li', { key: index }, line),
                  ),
                ),
              ),
          ...[
            { title: t('editor.diffAdded'), rows: diff.addedPlugins },
            { title: t('editor.diffRemoved'), rows: diff.removedPlugins },
            { title: t('editor.diffChanged'), rows: diff.changedPlugins },
          ].map((group, index) =>
            group.rows.length === 0
              ? null
              : React.createElement(
                  'div',
                  { key: index },
                  React.createElement('span', { className: 'dshpm-label' }, group.title),
                  React.createElement(
                    'ul',
                    { className: 'dshpm-list' },
                    group.rows.map((row, rowIndex) =>
                      React.createElement('li', { key: rowIndex }, `${row.id} — ${row.name}`),
                    ),
                  ),
                ),
          ),
          React.createElement(
            'p',
            { className: 'dshpm-muted' },
            `${t('editor.diffUnchanged')}: ${diff.unchangedPlugins}`,
          ),
        ),
  )
}
