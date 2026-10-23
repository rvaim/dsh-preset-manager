/**
 * The plugin's own data: where it lives, and how to erase it.
 *
 * The distinction this panel makes explicit is the one the design depends on:
 *
 *  - **Disabling** the plugin removes its preset registrations and its settings
 *    page, and keeps the files.
 *  - **Uninstalling** the package removes the code and the page entry, and also
 *    keeps the files — DSH's uninstall path gives a plugin no reliable hook that
 *    distinguishes "uninstall" from a hot reload, so deleting data there could
 *    destroy presets on an HMR cycle.
 *  - **Clearing the data** is an explicit, confirmed action here.
 *
 * Saying so plainly is the honest alternative to claiming a clean uninstall that
 * the platform cannot actually guarantee.
 */
import * as React from 'react'
import type { ManagerSnapshot } from '../../../shared/types.js'
import type { PresetManagerApi } from '../../api/remote-api.js'
import type { PresetManagerStore } from '../../state/store.js'
import { Card, Notice, SectionHeader } from '../../components/primitives.js'

export interface DataPanelProps {
  readonly store: PresetManagerStore
  readonly t: (key: string) => string
  readonly snapshot: ManagerSnapshot | undefined
  readonly api: PresetManagerApi
  readonly onClose: () => void
}

/** Must match the phrase the Host requires. */
const PURGE_CONFIRMATION = 'DELETE ALL PRESET DATA'

export function DataPanel(props: DataPanelProps): React.ReactElement {
  const { store, t, snapshot, api } = props
  const [confirmation, setConfirmation] = React.useState<string>('')
  const [message, setMessage] = React.useState<string | undefined>(undefined)
  const [failed, setFailed] = React.useState<string | undefined>(undefined)
  const [busy, setBusy] = React.useState<boolean>(false)

  const purge = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    setFailed(undefined)
    try {
      await api.purge(confirmation)
      setMessage(t('purge.done'))
      setConfirmation('')
      await store.refresh()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    'div',
    { className: 'dshpm' },
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, {
        title: t('defaultNote.title'),
        hint: t('defaultNote.body'),
      }),
      React.createElement(
        'p',
        { className: 'dshpm-mono' },
        `${t('detail.dataDirectory')}: ${snapshot?.dataDirectory ?? ''}`,
      ),
      React.createElement(
        'p',
        { className: 'dshpm-hint' },
        snapshot === undefined
          ? ''
          : `${snapshot.presets.filter((preset) => preset.ownership === 'managed').length} managed presets`,
      ),
    ),

    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('purge.title'), hint: t('purge.warning') }),
      message === undefined ? null : React.createElement(Notice, { level: 'success', message }),
      failed === undefined ? null : React.createElement(Notice, { level: 'error', message: failed }),
      React.createElement('input', {
        type: 'text',
        value: confirmation,
        placeholder: PURGE_CONFIRMATION,
        'aria-label': t('purge.instruction'),
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          setConfirmation(event.target.value),
      }),
      React.createElement('p', { className: 'dshpm-hint' }, t('purge.instruction')),
      React.createElement(
        'div',
        { className: 'dshpm-actions' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshpm-danger',
            disabled: busy || confirmation !== PURGE_CONFIRMATION,
            onClick: () => void purge(),
          },
          t('action.purge'),
        ),
        React.createElement('button', { type: 'button', onClick: props.onClose }, t('action.cancel')),
      ),
    ),
  )
}
