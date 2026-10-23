/**
 * The editor: one draft, two ways to see it.
 *
 * The Persona form and the YAML box are two projections of the *same* draft in
 * the store. Switching between them changes only which projection is rendered,
 * so a change made in one is present in the other. That is the requirement this
 * module exists to satisfy; a per-form copy would silently diverge.
 *
 * Persona edits go through the domain's `writePersona`, which rewrites exactly
 * the persona plugin's config and leaves every other row structurally untouched —
 * so editing a persona can never disturb another plugin's settings.
 */
import * as React from 'react'
import type { PresetDefinition } from '../../../shared/types.js'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import { formatIssue } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import {
  Button,
  Checkbox,
  Field,
  Loading,
  Notice,
  Panel,
  Tabs,
} from '../../components/primitives.js'
import { IconArrowLeft, IconCheck } from '../../components/icons.js'
import { readPersona, writePersona } from '../../../domain/persona-editor.js'

export interface PresetEditorProps {
  readonly state: PageState
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly mode: 'persona' | 'yaml'
  readonly onModeChange: (mode: 'persona' | 'yaml') => void
  readonly onBack: () => void
}

export function PresetEditor(props: PresetEditorProps): React.ReactElement {
  const { state, store, t, mode } = props
  const draft = state.draft

  if (draft === undefined) {
    return React.createElement(
      Panel,
      null,
      React.createElement(Loading, { label: t('common.loading') }),
    )
  }

  const persona = readPersona(draft)

  /** Apply a persona field change to the shared draft. */
  const updatePersona = (
    patch: Partial<{ prefix: string; suffix: string; complete: boolean }>,
  ): void => {
    store.setDraft(writePersona(draft, patch))
  }

  /** Apply a metadata change to the shared draft. */
  const updateMeta = (
    patch: Partial<Pick<PresetDefinition, 'name' | 'description'>>,
  ): void => {
    store.setDraft({ ...draft, ...patch })
  }

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
      React.createElement(Tabs, {
        value: mode,
        options: [
          { value: 'persona', label: t('editor.tabPersona') },
          { value: 'yaml', label: t('editor.tabYaml') },
        ],
        onChange: (next: string) => props.onModeChange(next === 'yaml' ? 'yaml' : 'persona'),
      }),
      React.createElement('span', { className: 'dshpm-spacer' }),
      React.createElement(
        Button,
        { disabled: state.busy, onClick: () => void store.prepareSave() },
        t('editor.validateAndDiff'),
      ),
      React.createElement(
        Button,
        {
          variant: 'primary',
          disabled: state.busy,
          onClick: () => void store.save(),
        },
        React.createElement(IconCheck, { size: 13 }),
        t('editor.saveAndRegister'),
      ),
    ),

    React.createElement('p', { className: 'dshpm-hint' }, t('editor.sharedDraft')),

    // ---- metadata, shared by both modes
    React.createElement(
      Panel,
      { title: t('editor.heading') },
      React.createElement(
        'div',
        { className: 'dshpm-fields' },
        React.createElement(
          Field,
          { label: t('editor.name') },
          React.createElement('input', {
            className: 'dshpm-input',
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
            className: 'dshpm-input',
            type: 'text',
            value: draft.description ?? '',
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              updateMeta({ description: event.target.value }),
          }),
        ),
      ),
      React.createElement(
        'p',
        { className: 'dshpm-mono dshpm-muted' },
        `${draft.id} · ${t('detail.rowCount', { count: draft.plugins.length })}`,
      ),
    ),

    mode === 'persona'
      ? React.createElement(PersonaForm, { persona, t, updatePersona })
      : React.createElement(YamlForm, { state, store, t }),

    state.yamlError === undefined
      ? null
      : React.createElement(Notice, {
          level: 'error',
          title: t('editor.yamlErrorTitle'),
          message: state.yamlError,
        }),

    state.validation === undefined || state.validation.ok
      ? null
      : React.createElement(Notice, {
          level: 'error',
          title: t('editor.validateFailedTitle'),
          details: state.validation.errors.map(formatIssue),
        }),

    React.createElement(DiffBlock, { state, t }),
  )
}

function PersonaForm(props: {
  persona: ReturnType<typeof readPersona>
  t: Translate
  updatePersona: (
    patch: Partial<{ prefix: string; suffix: string; complete: boolean }>,
  ) => void
}): React.ReactElement {
  const { persona, t, updatePersona } = props
  const { fields } = persona

  return React.createElement(
    Panel,
    { title: t('editor.tabPersona') },
    React.createElement(
      Field,
      { label: t('editor.prefix') },
      React.createElement('textarea', {
        className: 'dshpm-textarea',
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
        className: 'dshpm-textarea',
        value: fields.suffix,
        spellCheck: false,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
          updatePersona({ suffix: event.target.value }),
      }),
    ),
    React.createElement(
      'div',
      { className: 'dshpm-stack' },
      React.createElement(
        Checkbox,
        {
          checked: fields.complete,
          onChange: (checked: boolean) => updatePersona({ complete: checked }),
        },
        t('editor.complete'),
      ),
      React.createElement('p', { className: 'dshpm-hint' }, t('editor.completeHint')),
      persona.present
        ? null
        : React.createElement('p', { className: 'dshpm-hint' }, t('editor.noPersonaRow')),
    ),
  )
}

function YamlForm(props: {
  state: PageState
  store: PresetManagerStore
  t: Translate
}): React.ReactElement {
  const { state, store, t } = props
  return React.createElement(
    Panel,
    { title: t('editor.yamlHeading'), hint: t('editor.yamlHint') },
    React.createElement('textarea', {
      className: 'dshpm-textarea dshpm-textarea--code',
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
function DiffBlock(props: {
  state: PageState
  t: Translate
}): React.ReactElement | null {
  const { state, t } = props
  const diff = state.diff
  if (diff === undefined) return null

  const nothing =
    diff.changedMetadata.length === 0 &&
    diff.addedPlugins.length === 0 &&
    diff.removedPlugins.length === 0 &&
    diff.changedPlugins.length === 0

  if (nothing) {
    return React.createElement(
      Panel,
      { title: t('editor.diffHeading') },
      React.createElement('p', { className: 'dshpm-muted' }, t('editor.noChanges')),
    )
  }

  const group = (
    key: string,
    label: string,
    mark: string,
    rows: readonly { id: string; name: string }[],
  ): React.ReactElement | null =>
    rows.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'dshpm-diff-group', key },
          React.createElement('span', { className: 'dshpm-diff-label' }, label),
          React.createElement(
            'ul',
            { className: 'dshpm-diff-list' },
            rows.map((row, index) =>
              React.createElement(
                'li',
                { className: 'dshpm-diff-item', key: index },
                React.createElement(
                  'span',
                  { className: `dshpm-diff-mark dshpm-diff-mark--${mark}` },
                  mark === 'add' ? '+' : mark === 'del' ? '−' : '~',
                ),
                React.createElement('span', { className: 'dshpm-mono' }, row.id),
                React.createElement('span', { className: 'dshpm-muted' }, row.name),
              ),
            ),
          ),
        )

  return React.createElement(
    Panel,
    { title: t('editor.diffHeading') },
    diff.changedMetadata.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'dshpm-diff-group' },
          React.createElement(
            'span',
            { className: 'dshpm-diff-label' },
            t('editor.diffMetadata'),
          ),
          React.createElement(
            'ul',
            { className: 'dshpm-diff-list' },
            diff.changedMetadata.map((field, index) =>
              React.createElement(
                'li',
                { className: 'dshpm-diff-item', key: index },
                React.createElement('span', { className: 'dshpm-mono' }, field.field),
                React.createElement(
                  'span',
                  { className: 'dshpm-muted' },
                  `${field.before ?? '—'} → ${field.after ?? '—'}`,
                ),
              ),
            ),
          ),
        ),
    group('add', t('editor.diffAdded'), 'add', diff.addedPlugins),
    group('del', t('editor.diffRemoved'), 'del', diff.removedPlugins),
    group('chg', t('editor.diffChanged'), 'chg', diff.changedPlugins),
    React.createElement(
      'p',
      { className: 'dshpm-muted' },
      t('editor.diffUnchanged', { count: diff.unchangedPlugins }),
    ),
  )
}
