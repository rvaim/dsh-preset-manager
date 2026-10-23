/**
 * Import: paste, file, or clipboard → preview → confirm.
 *
 * The panel enforces the two-phase contract the Host implements. Previewing
 * parses, validates, checks module availability, and collects risks while
 * writing nothing; only the confirm step applies. That is why the confirm button
 * stays disabled until the user ticks the acknowledgement: an import that mounts
 * a composition the user did not read is exactly the failure this split exists
 * to prevent.
 *
 * No `!!js` expression is evaluated anywhere in this panel. Expressions are
 * listed as risks so the user can see what will be evaluated later, by the DSH
 * loader, inside the runtime.
 */
import * as React from 'react'
import type { ImportPreview } from '../../../shared/types.js'
import type { PageState, PresetManagerStore } from '../../state/store.js'
import { Card, Field, Notice, SectionHeader } from '../../components/primitives.js'

export interface ImportPanelProps {
  readonly store: PresetManagerStore
  readonly t: (key: string) => string
  readonly state: PageState
  readonly onClose: () => void
  readonly onImported: () => void
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
      if (navigator.clipboard?.readText === undefined) throw new Error('clipboard API unavailable')
      const content = await navigator.clipboard.readText()
      setText(content)
      setClipboardNote(undefined)
    } catch {
      // Reading the clipboard needs a permission this panel may not have; the
      // paste box above remains the supported path, so this is a hint, not an error.
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
    'div',
    { className: 'dshpm' },
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, {
        title: t('import.title'),
        hint: t('import.nothingApplied'),
      }),

      React.createElement(
        Field,
        { label: t('import.paste') },
        React.createElement('textarea', {
          className: 'dshpm-code',
          value: text,
          spellCheck: false,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value),
        }),
      ),

      clipboardNote === undefined
        ? null
        : React.createElement(Notice, { level: 'warning', message: clipboardNote }),

      React.createElement(
        'div',
        { className: 'dshpm-actions' },
        React.createElement(
          'button',
          { type: 'button', onClick: () => void readClipboard() },
          t('import.readClipboard'),
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => fileInput.current?.click() },
          t('import.pickFile'),
        ),
        React.createElement('input', {
          ref: fileInput,
          type: 'file',
          accept: '.yml,.yaml,.txt',
          style: { display: 'none' },
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => void onFile(event),
        }),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshpm-primary',
            disabled: text.trim() === '' || state.busy,
            onClick: () => void doPreview(),
          },
          t('import.preview'),
        ),
        React.createElement('button', { type: 'button', onClick: props.onClose }, t('action.cancel')),
      ),
    ),

    preview === undefined
      ? null
      : React.createElement(
          Card,
          null,
          React.createElement(SectionHeader, { title: t('import.previewTitle') }),

          React.createElement(
            'div',
            { className: 'dshpm-badges' },
            React.createElement('span', { className: 'dshpm-mono' }, preview.definition.id),
            React.createElement('span', { className: 'dshpm-mono' }, `formatVersion ${preview.document.formatVersion}`),
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
                'div',
                { className: 'dshpm' },
                React.createElement(Notice, {
                  level: 'warning',
                  message: `${t('import.idConflict')}: ${preview.definition.id}`,
                  details: [t('import.idConflictHint')],
                }),
                React.createElement(
                  Field,
                  {
                    label: t('import.suggestedId'),
                    ...(preview.idConflict.suggestedId === undefined
                      ? {}
                      : { hint: preview.idConflict.suggestedId }),
                  },
                  React.createElement('input', {
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
                message: t('import.previewTitle'),
                details: preview.validation.errors.map(formatLine),
              }),

          preview.risks.length === 0
            ? null
            : React.createElement(Notice, {
                level: 'warning',
                message: t('import.risks'),
                details: preview.risks.map(formatLine),
              }),

          preview.validation.warnings.length === 0
            ? null
            : React.createElement(Notice, {
                level: 'info',
                message: t('import.risks'),
                details: preview.validation.warnings.map(formatLine),
              }),

          // The complete composition, so the user approves what will actually mount.
          React.createElement('textarea', {
            className: 'dshpm-code',
            readOnly: true,
            value: preview.yaml,
            spellCheck: false,
            'aria-label': t('import.previewTitle'),
          }),

          React.createElement(
            'label',
            { className: 'dshpm-inline' },
            React.createElement('input', {
              type: 'checkbox',
              className: 'dshpm-checkbox',
              checked: acknowledged,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                setAcknowledged(event.target.checked),
            }),
            React.createElement('span', null, t('import.mustAcknowledge')),
          ),

          React.createElement(
            'div',
            { className: 'dshpm-actions' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dshpm-primary',
                disabled: !canConfirm,
                onClick: () => void doImport(),
              },
              t('action.confirmImport'),
            ),
            React.createElement(
              'button',
              { type: 'button', onClick: () => store.clearPreview() },
              t('action.cancel'),
            ),
          ),
        ),
  )
}

function formatLine(issue: { message: string; path?: string; detail?: string }): string {
  return `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
    issue.detail === undefined ? '' : `（${issue.detail}）`
  }`
}
