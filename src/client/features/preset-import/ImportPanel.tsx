/** Import: paste/file → current preview → explicit confirmation. */
import * as React from 'react'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Checkbox } from '../../components/primitives.js'
import { Dialog } from '../../components/Dialog.js'
import { YamlEditor } from '../../components/YamlEditor.js'
import { IconAlert, IconImport } from '../../components/icons.js'
import { ImportFeedback } from './ImportFeedback.js'

export interface ImportPanelProps {
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly state: PageState
  readonly onClose: () => void
  readonly onImported: () => void
  readonly children?: React.ReactNode
}

export function ImportPanel(props: ImportPanelProps): React.ReactElement {
  const { store, t, state } = props
  const [text, setText] = React.useState('')
  const [source, setSource] = React.useState<'share' | 'yaml-file'>('share')
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [clipboardNote, setClipboardNote] = React.useState<string | undefined>(undefined)
  const fileInput = React.useRef<HTMLInputElement | null>(null)
  const active = React.useRef(true)
  const automaticPreview = React.useRef(false)
  const requestedPreview = React.useRef<{ text: string; source: string } | undefined>(undefined)
  React.useEffect(() => {
    active.current = true
    return () => { active.current = false; store.clearPreview() }
  }, [store])
  React.useEffect(() => {
    if (!automaticPreview.current || text.trim() === '') return
    const timer = setTimeout(() => {
      const requested = requestedPreview.current
      if (!active.current || (requested?.text === text && requested.source === source)) return
      requestedPreview.current = { text, source }
      void store.previewImport(text, source)
    }, 250)
    return () => clearTimeout(timer)
  }, [text, source, store])

  const preview = state.preview
  const checking = state.previewingImport
  const canConfirm = preview?.validation.ok === true && !checking && acknowledged && !state.busy

  const changeText = (value: string, nextSource = source): void => {
    if (value === text && nextSource === source) return
    requestedPreview.current = undefined
    store.clearPreview()
    setText(value)
    setSource(nextSource)
    setAcknowledged(false)
    setClipboardNote(undefined)
  }
  const readClipboard = async (): Promise<void> => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard unavailable')
      const content = await navigator.clipboard.readText()
      if (active.current) changeText(content, 'share')
    } catch {
      if (active.current) setClipboardNote(t('import.clipboardFailed'))
    }
  }
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    if (active.current) changeText(content, 'yaml-file')
  }
  const doPreview = async (): Promise<void> => {
    setAcknowledged(false)
    automaticPreview.current = true
    requestedPreview.current = { text, source }
    await store.previewImport(text, source)
  }
  const doImport = async (): Promise<void> => {
    if (!canConfirm || !preview) return
    const ok = await store.confirmImport({
      text, source, acknowledgedRisks: acknowledged,
    })
    if (ok && active.current) props.onImported()
  }

  return React.createElement(Dialog, {
    variant: 'import', title: t('import.heading'), closeLabel: t('common.close'), busy: state.busy, onClose: props.onClose,
    footer: React.createElement(React.Fragment, null,
      React.createElement(Button, { disabled: state.busy, onClick: props.onClose }, t('common.cancel')),
      React.createElement('span', { className: 'dshpm-import-note' }, t('import.nothingApplied')),
      React.createElement('span', { className: 'dshpm-spacer' }),
      preview === undefined ? React.createElement(Button, {
        variant: 'primary', disabled: text.trim() === '' || state.busy || checking,
        onClick: () => void doPreview(),
      }, t(checking ? 'common.working' : 'action.previewImport')) : React.createElement(Button, {
        variant: 'primary', disabled: !canConfirm, onClick: () => void doImport(),
      }, React.createElement(IconImport, { size: 13 }), t('action.confirmImport')),
    ),
  }, React.createElement('div', { className: 'dshpm-import-layout' },
    props.children,
    React.createElement('div', { className: 'dshpm-import-source-head' },
      React.createElement('span', { className: 'dshpm-label' }, t('import.pasteLabel')),
      React.createElement('div', { className: 'dshpm-toolbar' },
        React.createElement(Button, { small: true, disabled: state.busy, onClick: () => void readClipboard() }, t('import.readClipboard')),
        React.createElement(Button, { small: true, disabled: state.busy, onClick: () => fileInput.current?.click() }, t('import.pickFile')),
        React.createElement('input', {
          ref: fileInput, type: 'file', accept: '.yml,.yaml,.txt', disabled: state.busy,
          style: { display: 'none' }, onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onFile(event),
        }),
      ),
    ),
    React.createElement('div', { className: 'dshpm-import-code' },
      React.createElement(YamlEditor, {
        value: text, label: t('import.pasteLabel'), placeholder: t('import.emptyText'),
        readOnly: state.busy, onChange: (value) => changeText(value),
      }),
    ),
    clipboardNote === undefined ? null : React.createElement('p', { className: 'dshpm-import-inline dshpm-import-inline--warning', role: 'status' },
      React.createElement(IconAlert, { size: 14 }), React.createElement('span', null, clipboardNote),
    ),
    React.createElement(ImportFeedback, { preview, checking, t }),
    preview === undefined ? null : React.createElement(Checkbox, {
      checked: acknowledged, disabled: checking || !preview.validation.ok || state.busy, onChange: setAcknowledged,
    }, t('import.acknowledge')),
  ))
}
