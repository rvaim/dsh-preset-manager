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
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Field, KeyValue, Notice, Panel } from '../../components/primitives.js'
import { IconTrash } from '../../components/icons.js'

export interface DataPanelProps {
  readonly store: PresetManagerStore
  readonly t: Translate
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

  const managed = snapshot?.presets.filter((preset) => preset.ownership === 'managed').length ?? 0

  const purge = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    setFailed(undefined)
    try {
      await api.purge(confirmation)
      setMessage(t('data.purgeSucceeded'))
      setConfirmation('')
      await store.refresh()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    Panel,
    {
      title: t('data.heading'),
      footer: React.createElement(Button, { onClick: props.onClose }, t('common.close')),
    },

    React.createElement(KeyValue, {
      rows: [
        {
          key: t('data.locationLabel'),
          value: React.createElement(
            'code',
            { className: 'dshpm-code-inline' },
            snapshot?.dataDirectory ?? '',
          ),
        },
        { key: t('list.heading'), value: t('data.managedCount', { count: managed }) },
      ],
    }),

    React.createElement('p', { className: 'dshpm-hint' }, t('data.keepNote')),

    React.createElement('hr', { className: 'dshpm-divider' }),

    React.createElement(
      'div',
      { className: 'dshpm-stack' },
      React.createElement('span', { className: 'dshpm-label' }, t('data.purgeHeading')),
      React.createElement(Notice, { level: 'warning', message: t('data.purgeWarning') }),

      message === undefined
        ? null
        : React.createElement(Notice, { level: 'success', message }),
      failed === undefined ? null : React.createElement(Notice, { level: 'error', message: failed }),

      React.createElement(
        Field,
        { label: t('data.purgeInstruction', { phrase: PURGE_CONFIRMATION }) },
        React.createElement('input', {
          className: 'dshpm-input dshpm-input--mono',
          type: 'text',
          value: confirmation,
          placeholder: PURGE_CONFIRMATION,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            setConfirmation(event.target.value),
        }),
      ),

      React.createElement(
        'div',
        { className: 'dshpm-toolbar' },
        React.createElement(
          Button,
          {
            variant: 'danger',
            disabled: busy || confirmation !== PURGE_CONFIRMATION,
            onClick: () => void purge(),
          },
          React.createElement(IconTrash, { size: 13 }),
          t('data.purgeButton'),
        ),
      ),
    ),
  )
}
