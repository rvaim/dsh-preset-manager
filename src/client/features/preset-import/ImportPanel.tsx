/**
 * Import: paste, file, or clipboard → preview → confirm.
 *
 * The panel enforces the two-phase contract the Host implements. Previewing
 * parses, validates, checks module availability, and collects risks while
 * writing nothing; only the confirm step applies. That is why the confirm button
 * stays disabled until the user ticks the acknowledgement: an import that mounts
 * a composition the user did not read is exactly the failure this split exists to
 * prevent.
 *
 * No `!!js` expression is evaluated anywhere in this panel. Expressions are
 * listed as risks so the user can see what will be evaluated later, by the DSH
 * loader, inside the runtime.
 */
import * as React from 'react'
import type { ImportPreview } from '../../../shared/types.js'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import {
  Button,
  Checkbox,
  Field,
  Notice,
  Panel,
} from '../../components/primitives.js'
import { IconImport } from '../../components/icons.js'

export interface ImportPanelProps {
  readonly store: PresetManagerStore
  readonly t: Translate
  readonly state: PageState
  readonly onClose: () => void
  readonly onImported: () => void
}

function line(issue: { message: string; path?: string; detail?: string }): string {
  return `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
    issue.detail === undefined ? '' : `（${issue.detail}）`
  }`
}

export function ImportPanel(props: ImportPanelProps): React.ReactElement {
  const { store, t, state } = props
  const [text, setText] = React.useState<string>('')
  const [source, setSource] = React.useState<'share' | 'yaml-file'>('share')
  const [acknowledged, setAcknowledged] = React.useState<boolean>(false)
  const [resolveId, setResolveId] = React.useState<string>('')
  const [clipboardNote, setClipboardNote] = React.useState<string | undefined>(undefined)
  const fileInput = React.useRef<HTMLInputElement | null>(null)

  const preview: ImportPreview | undefined = state.preview

  const readClipboard = async (): Promise<void> => {
    try {
      if (navigator.clipboard?.readText === undefined) throw new Error('clipboard unavailable')
      const content = await navigator.clipboard.readText()
      setText(content)
      setClipboardNote(undefined)
    } catch {
      // Reading the clipboard needs a permission this panel may not have; the
      // paste box remains the supported path, so this is a hint, not an error.
      setClipboardNote(t('import.clipboardFailed'))
    }
  }

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setText(await file.text())
    setSource('yaml-file')
  }

  const doPreview = async (): Promise<void> => {
    setAcknowledged(false)
    await store.previewImport(text, source)
  }

  const doImport = async (): Promise<void> => {
    const finalId = resolveId.trim() === '' ? undefined : resolveId.trim()
    const ok = await store.confirmImport({
      text,
      source,
      ...(finalId === undefined ? {} : { id: finalId }),
      acknowledgedRisks: acknowledged,
    })
    if (ok) props.onImported()
  }

  const blockedByConflict = preview?.idConflict.conflict === true && resolveId.trim() === ''
  const blockedByValidation = preview !== undefined && !preview.validation.ok
  const canConfirm =
    preview !== undefined && acknowledged && !blockedByConflict && !blockedByValidation && !state.busy

  return React.createElement(
    Panel,
    {
      title: t('import.heading'),
      hint: t('import.nothingApplied'),
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { onClick: props.onClose }, t('common.cancel')),
        React.createElement('span', { className: 'dshpm-spacer' }),
        preview === undefined
          ? React.createElement(
              Button,
              {
                variant: 'primary',
                disabled: text.trim() === '' || state.busy,
                onClick: () => void doPreview(),
              },
              t('action.previewImport'),
            )
          : React.createElement(
              Button,
              {
                variant: 'primary',
                disabled: !canConfirm,
                onClick: () => void doImport(),
              },
              React.createElement(IconImport, { size: 13 }),
              t('action.confirmImport'),
            ),
      ),
    },

    // ---- source
    React.createElement(
      Field,
      { label: t('import.pasteLabel') },
      React.createElement('textarea', {
        className: 'dshpm-textarea dshpm-textarea--code',
        value: text,
        spellCheck: false,
        placeholder: t('import.emptyText'),
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
      }),
    ),

    clipboardNote === undefined
      ? null
      : React.createElement(Notice, { level: 'warning', message: clipboardNote }),

    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement(
        Button,
        { small: true, onClick: () => void readClipboard() },
        t('import.readClipboard'),
      ),
      React.createElement(
        Button,
        { small: true, onClick: () => fileInput.current?.click() },
        t('import.pickFile'),
      ),
      React.createElement('input', {
        ref: fileInput,
        type: 'file',
        accept: '.yml,.yaml,.txt',
        style: { display: 'none' },
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onFile(event),
      }),
    ),

    preview === undefined
      ? null
      : React.createElement(
          React.Fragment,
          null,

          React.createElement('hr', { className: 'dshpm-divider' }),

          React.createElement(
            'div',
            { className: 'dshpm-row-meta' },
            React.createElement(
              'span',
              { className: 'dshpm-mono' },
              preview.definition.id,
            ),
            React.createElement(
              'span',
              { className: 'dshpm-count' },
              `formatVersion ${preview.document.formatVersion}`,
            ),
            React.createElement(
              'span',
              { className: 'dshpm-count' },
              t('detail.rowCount', { count: preview.definition.plugins.length }),
            ),
          ),

          preview.definition.name === undefined
            ? null
            : React.createElement('p', { className: 'dshpm-label' }, preview.definition.name),
          preview.definition.description === undefined
            ? null
            : React.createElement('p', { className: 'dshpm-hint' }, preview.definition.description),

          // A conflict needs a new id before the import can proceed.
          preview.idConflict.conflict
            ? React.createElement(
                React.Fragment,
                null,
                React.createElement(Notice, {
                  level: 'warning',
                  title: t('import.idConflictTitle'),
                  message: t('import.idConflictBody'),
                  details:
                    preview.idConflict.suggestedId === undefined
                      ? []
                      : [`${t('import.newIdLabel')}: ${preview.idConflict.suggestedId}`],
                }),
                React.createElement(
                  Field,
                  { label: t('import.newIdLabel') },
                  React.createElement('input', {
                    className: 'dshpm-input dshpm-input--mono',
                    type: 'text',
                    value: resolveId,
                    placeholder: preview.idConflict.suggestedId ?? '',
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                      setResolveId(event.target.value),
                  }),
                ),
              )
            : null,

          preview.validation.errors.length === 0
            ? null
            : React.createElement(Notice, {
                level: 'error',
                title: t('import.errorsTitle'),
                details: preview.validation.errors.map(line),
              }),

          preview.risks.length === 0
            ? null
            : React.createElement(Notice, {
                level: 'warning',
                title: t('import.risksTitle'),
                details: preview.risks.map(line),
              }),

          preview.validation.warnings.length === 0
            ? null
            : React.createElement(Notice, {
                level: 'info',
                title: t('import.warningsTitle'),
                details: preview.validation.warnings.map(line),
              }),

          // The complete composition, so the user approves what will actually mount.
          React.createElement(
            Field,
            { label: t('import.compositionHeading') },
            React.createElement('textarea', {
              className: 'dshpm-textarea dshpm-textarea--code',
              readOnly: true,
              value: preview.yaml,
              spellCheck: false,
            }),
          ),

          React.createElement(
            Checkbox,
            {
              checked: acknowledged,
              disabled: blockedByValidation,
              onChange: setAcknowledged,
            },
            t('import.acknowledge'),
          ),

          blockedByValidation || blockedByConflict
            ? React.createElement('p', { className: 'dshpm-hint' }, t('import.blockedHint'))
            : null,
        ),
  )
}
