/**
 * Copy an existing preset into a new managed one.
 *
 * The source picker lists every readable preset, not just built-ins: copying
 * another plugin's preset or one of your own is equally legitimate, and the
 * operation never modifies the source. A live preview of the derived id is
 * enough validation feedback before the Host's authoritative check.
 */
import * as React from 'react'
import type { PresetSummary } from '../../../shared/types.js'
import type { PresetManagerStore } from '../../state/store.js'
import { Card, Field, SectionHeader } from '../../components/primitives.js'

export interface CloneDialogProps {
  readonly store: PresetManagerStore
  readonly t: (key: string) => string
  readonly presets: readonly PresetSummary[]
  readonly onClose: () => void
  readonly onCloned: () => void
}

/** Ids the Host accepts, mirrored for immediate feedback. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function CloneDialog(props: CloneDialogProps): React.ReactElement {
  const { store, t, presets } = props
  const [sourceId, setSourceId] = React.useState<string>(presets[0]?.id ?? '')
  const [newId, setNewId] = React.useState<string>('')
  const [name, setName] = React.useState<string>('')
  const [localError, setLocalError] = React.useState<string | undefined>(undefined)

  const idValid = ID_PATTERN.test(newId)
  const taken = presets.some((preset) => preset.id === newId)
  const canSubmit = sourceId !== '' && idValid && !taken

  const submit = async (): Promise<void> => {
    if (sourceId === '') {
      setLocalError(t('clone.mustPickSource'))
      return
    }
    if (newId === '') {
      setLocalError(t('clone.idRequired'))
      return
    }
    setLocalError(undefined)
    const ok = await store.clone({
      sourceId,
      newId,
      ...(name.trim() === '' ? {} : { name: name.trim() }),
    })
    if (ok) props.onCloned()
  }

  return React.createElement(
    'div',
    { className: 'dshpm' },
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('clone.title') }),

      React.createElement(
        Field,
        { label: t('clone.source') },
        React.createElement(
          'select',
          {
            value: sourceId,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              setSourceId(event.target.value),
          },
          presets.map((preset) =>
            React.createElement(
              'option',
              { key: preset.id, value: preset.id },
              `${preset.name ?? preset.id} (${preset.id}) — ${t(`ownership.${preset.ownership}`)}`,
            ),
          ),
        ),
      ),

      React.createElement(
        Field,
        { label: t('clone.newId'), hint: t('clone.newIdHint') },
        React.createElement('input', {
          type: 'text',
          value: newId,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setNewId(event.target.value),
        }),
      ),

      newId !== '' && !idValid
        ? React.createElement('p', { className: 'dshpm-error-text' }, t('clone.newIdHint'))
        : null,
      taken
        ? React.createElement('p', { className: 'dshpm-error-text' }, t('import.idConflictHint'))
        : null,
      localError === undefined
        ? null
        : React.createElement('p', { className: 'dshpm-error-text' }, localError),

      React.createElement(
        Field,
        { label: t('clone.name') },
        React.createElement('input', {
          type: 'text',
          value: name,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
        }),
      ),

      React.createElement(
        'div',
        { className: 'dshpm-actions' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshpm-primary',
            disabled: !canSubmit,
            onClick: () => void submit(),
          },
          t('clone.submit'),
        ),
        React.createElement('button', { type: 'button', onClick: props.onClose }, t('action.cancel')),
      ),
    ),
  )
}
