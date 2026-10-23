/**
 * Copy an existing preset into a new managed one.
 *
 * The source picker lists every readable preset, not just built-ins: copying
 * another plugin's preset or one of your own is equally legitimate, and the
 * operation never modifies the source. The new id is validated locally for
 * immediate feedback, and the Host remains the authority.
 */
import * as React from 'react'
import type { PresetSummary } from '../../../shared/types.js'
import type { PresetManagerStore } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Field, Panel } from '../../components/primitives.js'
import { IconCopy } from '../../components/icons.js'

export interface CloneDialogProps {
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly presets: readonly PresetSummary[]
  readonly onClose: () => void
  readonly onCloned: () => void
}

/** Ids the Host accepts, mirrored for immediate feedback. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

const OWNERSHIP_KEY = {
  managed: 'ownership.managed',
  builtin: 'ownership.builtin',
  'third-party': 'ownership.thirdParty',
} as const

export function CloneDialog(props: CloneDialogProps): React.ReactElement {
  const { store, t, presets } = props
  const [sourceId, setSourceId] = React.useState<string>(presets[0]?.id ?? '')
  const [newId, setNewId] = React.useState<string>('')
  const [name, setName] = React.useState<string>('')
  const [submitted, setSubmitted] = React.useState<boolean>(false)
  // Subscribe to the store's busy flag so the submit button reflects a running
  // clone; reading `getState()` during render would freeze at its first value.
  const busy = React.useSyncExternalStore(
    store.subscribe,
    () => store.getState().busy,
    () => store.getState().busy,
  )

  const source = presets.find((preset) => preset.id === sourceId)
  const idValid = ID_PATTERN.test(newId)
  const taken = presets.some((preset) => preset.id === newId)
  const canSubmit = sourceId !== '' && idValid && !taken

  // A suggested id derived from the source, so the common case needs no typing.
  const suggested = React.useMemo(() => {
    if (source === undefined) return ''
    const base = `${source.id}-copy`
    if (!presets.some((preset) => preset.id === base)) return base
    for (let suffix = 2; suffix < 100; suffix += 1) {
      const candidate = `${base}-${suffix}`
      if (!presets.some((preset) => preset.id === candidate)) return candidate
    }
    return base
  }, [source, presets])

  const submit = async (): Promise<void> => {
    setSubmitted(true)
    if (!canSubmit) return
    const ok = await store.clone({
      sourceId,
      newId,
      ...(name.trim() === '' ? {} : { name: name.trim() }),
    })
    if (ok) props.onCloned()
  }

  return React.createElement(
    Panel,
    {
      title: t('clone.heading'),
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement('span', { className: 'dshpm-spacer' }),
        React.createElement(Button, { onClick: props.onClose }, t('common.cancel')),
        React.createElement(
          Button,
          { variant: 'primary', disabled: !canSubmit || busy, onClick: () => void submit() },
          React.createElement(IconCopy, { size: 13 }),
          t('clone.submit'),
        ),
      ),
    },

    React.createElement(
      Field,
      { label: t('clone.source') },
      React.createElement(
        'select',
        {
          className: 'dshpm-select',
          value: sourceId,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            setSourceId(event.target.value),
        },
        presets.map((preset) =>
          React.createElement(
            'option',
            { key: preset.id, value: preset.id },
            `${preset.name ?? preset.id} · ${preset.id} · ${t(OWNERSHIP_KEY[preset.ownership])}`,
          ),
        ),
      ),
    ),

    React.createElement(
      Field,
      {
        label: t('clone.newId'),
        hint: t('clone.newIdHint'),
      },
      React.createElement('input', {
        className: 'dshpm-input dshpm-input--mono',
        type: 'text',
        value: newId,
        placeholder: suggested,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setNewId(event.target.value),
      }),
    ),

    submitted && !idValid && newId !== ''
      ? React.createElement('p', { className: 'dshpm-error-text' }, t('clone.newIdInvalid'))
      : null,
    taken ? React.createElement('p', { className: 'dshpm-error-text' }, t('clone.newIdTaken')) : null,

    React.createElement(
      Field,
      { label: t('clone.name'), hint: t('clone.nameHint') },
      React.createElement('input', {
        className: 'dshpm-input',
        type: 'text',
        value: name,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value),
      }),
    ),
  )
}
