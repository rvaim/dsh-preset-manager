/** The preset editor follows DSH's metadata + Cordis composition model. */
import * as React from 'react'
import type { PresetDefinition } from '../../../shared/types.js'
import type { EditorMode, PageState, PresetManagerStore } from '../../state/store.js'
import { formatIssue } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Field, Loading, Notice, Tabs } from '../../components/primitives.js'
import { readPersona, writePersona, PERSONA_MODULE } from '../../../domain/persona-editor.js'
import { isLoaderExpression } from '../../../domain/preset-model.js'
import { listCompositionRows, getCompositionRow, replaceCompositionRow } from '../../../domain/composition-editor.js'
import { YamlEditor } from '../../components/YamlEditor.js'
import { CompositionEditor } from './CompositionEditor.js'

export interface PresetEditorProps {
  readonly state: PageState
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly mode: EditorMode
  readonly onModeChange: (mode: EditorMode) => void
}

export function PresetEditor({ state, store, t, mode, onModeChange }: PresetEditorProps): React.ReactElement {
  const draft = state.draft
  if (!draft) return React.createElement(Loading, { label: t('common.loading') })
  const update = (patch: Partial<Pick<PresetDefinition, 'name' | 'description' | 'order'>>): void => store.setDraft({ ...draft, ...patch })
  const metadataLocked = mode === 'yaml' || state.compositionError !== undefined
  return React.createElement('fieldset', { className: 'dshpm-editor-fields dshpm-prompt-editor-layout', disabled: state.busy },
    React.createElement('div', { className: 'dshpm-editor-meta' },
      React.createElement(Field, { label: t('editor.name'), htmlFor: `${draft.id}-name` },
        React.createElement('input', { id: `${draft.id}-name`, className: 'dshpm-input', type: 'text', disabled: metadataLocked,
          value: draft.name ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement>) => update({ name: event.target.value }) })),
      React.createElement(Field, { label: t('editor.description'), htmlFor: `${draft.id}-description` },
        React.createElement('input', { id: `${draft.id}-description`, className: 'dshpm-input', type: 'text', disabled: metadataLocked,
          value: draft.description ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement>) => update({ description: event.target.value }) })),
      React.createElement(Field, { label: t('editor.order'), htmlFor: `${draft.id}-order` },
        React.createElement('input', { id: `${draft.id}-order`, className: 'dshpm-input', type: 'number', step: 'any', disabled: metadataLocked,
          value: draft.order ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement>) => update({ order: event.target.value === '' ? undefined : Number(event.target.value) }) })),
    ),
    React.createElement('div', { className: 'dshpm-editor-toolbar' },
      React.createElement(Tabs, { value: mode, options: [
        { value: 'persona', label: t('editor.tabPersona') }, { value: 'plugins', label: t('editor.tabPlugins') }, { value: 'yaml', label: t('editor.tabYaml') },
      ], onChange: (next) => onModeChange(next === 'yaml' ? 'yaml' : next === 'plugins' ? 'plugins' : 'persona') }),
      React.createElement('code', { className: 'dshpm-editor-id', title: t('editor.stableId') }, draft.id),
    ),
    mode === 'persona' ? React.createElement(PersonaEditor, { definition: draft, t, onChange: (next) => store.setDraft(next), onPlugins: () => onModeChange('plugins') }) :
    mode === 'plugins' ? React.createElement(CompositionEditor, { definition: draft, t, busy: state.busy, error: state.compositionError,
      onChange: (next) => store.setDraft(next), onError: (error) => store.setCompositionError(error) }) :
      React.createElement('div', { className: 'dshpm-prompt-region' },
        React.createElement('label', { className: 'dshpm-label', htmlFor: `${draft.id}-yaml` }, t('editor.yamlHeading')),
        React.createElement(YamlEditor, { value: state.yamlText, label: t('editor.yamlHeading'), readOnly: state.busy, onChange: (text) => void store.setYaml(text) }),
      ),
    state.compositionError === undefined ? null : React.createElement(Notice, { level: 'error', message: state.compositionError }),
    state.yamlError === undefined ? null : React.createElement(Notice, { level: 'error', title: t('editor.yamlErrorTitle'), message: state.yamlError }),
    state.validation === undefined || state.validation.ok ? null : React.createElement(Notice, { level: 'error', title: t('editor.validateFailedTitle'), details: state.validation.errors.map(formatIssue) }),
  )
}

function PersonaEditor(props: { definition: PresetDefinition; t: Translate; onChange(next: PresetDefinition): void; onPlugins(): void }): React.ReactElement {
  const personas = listCompositionRows(props.definition).filter((entry) => entry.row.name === PERSONA_MODULE)
  const [selection, setSelection] = React.useState('')
  const [part, setPart] = React.useState<'prefix' | 'suffix'>('prefix')
  const active = personas.find((entry) => entry.path.join('.') === selection) ?? personas[0]
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'dshpm-editor-toolbar' },
      React.createElement(Tabs, { className: 'dshpm-prompt-tabs', value: part,
        options: [{ value: 'prefix', label: props.t('editor.prefixTab') }, { value: 'suffix', label: props.t('editor.suffixTab') }],
        onChange: (value) => setPart(value === 'suffix' ? 'suffix' : 'prefix'),
      }),
      personas.length > 1 ? React.createElement('select', { className: 'dshpm-select dshpm-persona-picker', value: active?.path.join('.') ?? '',
        'aria-label': props.t('editor.personaEntry'), onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setSelection(event.target.value) },
        personas.map((entry) => React.createElement('option', { key: entry.path.join('.'), value: entry.path.join('.') }, `${entry.row.id || 'persona'} · ${entry.path.map((index) => index + 1).join(' / ')}`))) : null,
      React.createElement(Button, { variant: 'quiet', onClick: props.onPlugins }, props.t('editor.otherPromptSections')),
    ),
    React.createElement(PromptFields, { ...props, path: active?.path, part }),
  )
}

export function PromptFields({ definition, t, onChange, path, part = 'prefix' }: {
  definition: PresetDefinition; t: Translate; onChange(next: PresetDefinition): void; path?: readonly number[]; part?: 'prefix' | 'suffix'
}): React.ReactElement {
  const selectedPath = path ?? listCompositionRows(definition).find((entry) => entry.row.name === PERSONA_MODULE)?.path
  const row = selectedPath ? getCompositionRow(definition, selectedPath) : undefined
  const dynamicConfig = row !== undefined && isLoaderExpression(row.config)
  const config = row?.config && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config as Record<string, unknown> : {}
  const fallback = readPersona({ ...definition, plugins: row ? [row] : [] })
  const patch = (field: 'prefix' | 'suffix', value: string): void => {
    if (dynamicConfig || isLoaderExpression(config[field])) return
    const next = row && selectedPath ? replaceCompositionRow(definition, selectedPath, { ...row, config: { ...config, [field]: value } }) : writePersona(definition, { [field]: value })
    onChange(next)
  }
  const text = (field: 'prefix' | 'suffix'): string => dynamicConfig ? `!!js ${(row!.config as { __jsExpr: string }).__jsExpr}` : isLoaderExpression(config[field]) ? `!!js ${(config[field] as { __jsExpr: string }).__jsExpr}` : fallback.fields[field]
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'dshpm-prompt-region' },
      React.createElement('textarea', { id: `${definition.id}-${part}`, className: 'dshpm-textarea dshpm-prompt-text',
        value: text(part), spellCheck: false, readOnly: dynamicConfig || isLoaderExpression(config[part]), 'aria-label': t(`editor.${part}`),
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => patch(part, event.target.value),
      }),
      dynamicConfig || isLoaderExpression(config[part]) ? React.createElement('span', { className: 'dshpm-hint' }, t('editor.dynamicTemplate')) : null,
    ),
    config.complete === true && part === 'suffix' ? React.createElement('p', { className: 'dshpm-hint' }, t('editor.suffixInactive')) : null,
  )
}
