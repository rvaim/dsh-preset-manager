/** Persistent preset grid with independent read-only and edit dialogs. */
import * as React from 'react'
import { STYLES } from '../styles.js'
import type { PageState, PresetManagerStore } from '../state/store.js'
import { Button, Checkbox, Notice } from '../components/primitives.js'
import { ActionButton } from '../components/ActionButton.js'
import { IconFork } from '../components/icons.js'
import { diffPresets } from '../../domain/preset-diff.js'
import { Dialog } from '../components/Dialog.js'
import { PresetList } from '../features/preset-list/PresetList.js'
import { PresetDetailView } from '../features/preset-list/PresetDetailView.js'
import { PresetEditor } from '../features/persona-editor/PresetEditor.js'
import { HistoryView } from '../features/preset-history/HistoryView.js'
import { presetDisplay } from '../features/preset-display.js'
import { ImportPanel } from '../features/preset-import/ImportPanel.js'
import { DataPanel } from '../features/preset-history/DataPanel.js'

export type Translate = (key: string, params?: Record<string, string | number>) => string
export interface PageProps {
  readonly store: PresetManagerStore
  readonly useStore: () => PageState
  readonly t: Translate
}
export type Overlay = { kind: 'none' } | { kind: 'import' } | { kind: 'data' }
export type Confirmation = 'none' | 'discard' | 'delete' | 'save'

export function PresetManagerPage(props: PageProps): React.ReactElement {
  const { store, useStore, t } = props
  React.useEffect(() => store.retainPage(), [store])
  const state = useStore()
  const [overlay, setOverlay] = React.useState<Overlay>({ kind: 'none' })
  const [confirmation, setConfirmation] = React.useState<Confirmation>('none')
  const [acknowledgedDefaultRisk, setAcknowledgedDefaultRisk] = React.useState(false)
  React.useEffect(() => { if (state.view.kind === 'list') setConfirmation('none') }, [state.view.kind])
  const busy = state.busy
  const ready = state.mount.status === 'ready'
  const closeView = (): void => { setConfirmation('none'); store.backToList() }
  const requestClose = (): void => {
    if (busy) return
    if (store.hasUnsavedChanges) { setConfirmation('discard'); return }
    closeView()
  }
  const save = async (): Promise<void> => { const saved = await store.save(); setConfirmation('none'); if (saved) closeView() }
  const remove = async (): Promise<void> => {
    if (state.view.kind !== 'editor') return
    const removed = await store.remove(state.view.id, acknowledgedDefaultRisk)
    setConfirmation('none')
    if (removed) closeView()
  }
  const closeOverlay = (): void => {
    if (busy) return
    if (overlay.kind === 'import') store.clearPreview()
    else store.dismissNotice()
    setOverlay({ kind: 'none' })
  }

  return React.createElement('div', { className: 'dshpm' },
    React.createElement('style', { 'data-dsh-preset-manager': 'true' }, STYLES),
    React.createElement('div', { className: 'dshpm-head' },
      React.createElement('div', { className: 'dshpm-head-text' },
        React.createElement('h2', { className: 'dshpm-title' }, t('page.title')),
        React.createElement('p', { className: 'dshpm-subtitle' }, t('page.subtitle'))),
      React.createElement('div', { className: 'dshpm-head-actions' },
        React.createElement(Button, { disabled: busy || !ready, onClick: () => void store.refresh() }, t('common.refresh')))),
    state.mount.status === 'failed' ? React.createElement(Notice, {
      level: 'error', title: t('error.notReadyTitle'), message: state.mount.error ?? t('error.notReadyBody'),
    }) : null,
    state.view.kind === 'list' && overlay.kind === 'none' ? React.createElement(OperationNotice, { state, store, t }) : null,
    React.createElement(Diagnostics, { state, t }),
    React.createElement(PresetWorkspace, {
      state, store, t, busy, ready, confirmation,
      onRequestClose: requestClose, onClose: closeView,
      onKeepEditing: () => setConfirmation('none'),
      onDeleteRequest: () => { setAcknowledgedDefaultRisk(false); setConfirmation('delete') },
      onDelete: () => void remove(), onSave: () => setConfirmation('save'), onConfirmSave: () => void save(),
      acknowledgedDefaultRisk, onAcknowledgeDefaultRisk: setAcknowledgedDefaultRisk,
      onOverlay: (next) => { if (next.kind === 'import') store.clearPreview(); setOverlay(next) },
    }),
    ready && overlay.kind === 'import' ? React.createElement(ImportPanel, {
      key: 'import', store, t, state, onClose: closeOverlay,
      onImported: () => setOverlay({ kind: 'none' }),
    }, React.createElement(OperationNotice, { state, store, t })) : null,
    ready && overlay.kind === 'data' ? React.createElement(Dialog, {
      key: 'data', title: t('data.heading'),
      closeLabel: t('common.close'), busy, onClose: closeOverlay,
    },
      React.createElement(OperationNotice, { state, store, t }),
      React.createElement(DataPanel, { store, t, snapshot: state.snapshot, api: store.apiForPanel, onClose: closeOverlay }),
    ) : null,
  )
}

export interface WorkspaceProps {
  state: PageState
  store: PresetManagerStore
  t: Translate
  busy: boolean
  ready: boolean
  confirmation: Confirmation
  onRequestClose(): void
  onClose(): void
  onKeepEditing(): void
  onDeleteRequest(): void
  onDelete(): void
  onSave(): void
  onConfirmSave?(): void
  acknowledgedDefaultRisk?: boolean
  onAcknowledgeDefaultRisk?(value: boolean): void
  onOverlay(next: Overlay): void
}

/** The list is never replaced by a detail/editor view; its scroll seat survives. */
export function PresetWorkspace(props: WorkspaceProps): React.ReactElement {
  const { state, store, t, busy, ready } = props
  const view = state.view
  const source = view.kind === 'list' ? undefined : state.snapshot?.presets.find((preset) => preset.id === view.id)
  const name = source === undefined ? (view.kind === 'list' ? '' : view.id) : presetDisplay(source, t).name
  const duplicate = async (id: string): Promise<boolean> => {
    const preset = state.snapshot?.presets.find((row) => row.id === id)
    return preset === undefined ? false : store.duplicate({ ...preset, ...presetDisplay(preset, t) }, t('clone.copySuffix'))
  }
  const editor = view.kind === 'editor'
  const footer = React.createElement(React.Fragment, null,
    editor ? React.createElement(Button, { variant: 'danger', disabled: busy || !state.draft, onClick: props.onDeleteRequest }, t('action.delete')) :
      view.kind === 'detail' ? React.createElement(ActionButton, {
        label: t('action.fork'), pendingLabel: t('feedback.forking'), successLabel: t('feedback.forked'), retryLabel: t('common.retry'),
        disabled: busy || !state.detail, hint: t('feedback.forkHint'), icon: React.createElement(IconFork, { size: 14 }),
        feedback: state.notice?.localAction?.kind === 'fork' && state.notice.localAction.id === view.id ? state.notice.message : undefined,
        onAction: () => duplicate(view.id),
      }) : null,
    React.createElement('span', { className: 'dshpm-spacer' }),
    React.createElement(Button, { disabled: busy, onClick: props.onRequestClose }, t(editor ? 'common.cancel' : 'common.close')),
    editor ? React.createElement(Button, {
      variant: 'primary', disabled: busy || !state.draft || !!state.yamlError || state.parsingYaml || state.compositionError !== undefined || state.validation?.ok === false || !store.hasUnsavedChanges,
      onClick: props.onSave,
    }, t('common.save')) : null,
  )
  const changes = state.detail && state.draft ? diffPresets(state.detail.definition, state.draft) : undefined
  return React.createElement(React.Fragment, null,
    React.createElement(PresetList, {
      key: 'preset-list', state, t, busy, ready,
      onToggle: (id, enabled) => store.setEnabled(id, enabled),
      onView: (id) => void store.openDetail(id),
      onEditPersona: (id) => void store.openEditor(id, 'persona'),
      onHistory: (id) => void store.openHistory(id),
      onExport: (id) => store.copyConfiguration(id, async (text) => {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
        await navigator.clipboard.writeText(text)
      }),
      onImport: () => props.onOverlay({ kind: 'import' }),
      onData: () => props.onOverlay({ kind: 'data' }), onRetry: () => void store.load(),
    }),
    view.kind === 'list' || !ready ? null : React.createElement(Dialog, {
      key: `${view.kind}:${view.id}`,
      title: `${t(editor ? 'action.edit' : view.kind === 'history' ? 'action.history' : 'action.view')} · ${name}`,
      closeLabel: t('common.close'), busy, onClose: props.onRequestClose, footer, variant: editor ? 'editor' : 'default',
    },
      React.createElement(OperationNotice, { state, store, t }),
      editor ? React.createElement(PresetEditor, {
        state, store, t, mode: view.mode,
        onModeChange: (mode) => store.setEditorMode(mode),
      }) : view.kind === 'history' ? React.createElement(HistoryView, { state, store, t, onBack: props.onRequestClose }) :
        React.createElement(PresetDetailView, { state, t }),
    ),
    view.kind === 'editor' && ready && props.confirmation !== 'none' ? React.createElement(Dialog, {
      key: `confirm:${props.confirmation}`, variant: 'confirm', busy, closeLabel: t('common.cancel'), onClose: props.onKeepEditing,
      title: t(props.confirmation === 'delete' ? 'remove.heading' : props.confirmation === 'discard' ? 'editor.discardTitle' : 'editor.saveTitle'),
      footer: React.createElement(React.Fragment, null,
        React.createElement(Button, { disabled: busy, onClick: props.onKeepEditing }, t(props.confirmation === 'save' ? 'editor.backToEdit' : 'editor.keepEditing')),
        React.createElement(Button, {
          variant: props.confirmation === 'save' ? 'primary' : 'danger',
          disabled: busy || (props.confirmation === 'delete' && source?.isDefault === true && !props.acknowledgedDefaultRisk),
          onClick: props.confirmation === 'delete' ? props.onDelete : props.confirmation === 'discard' ? props.onClose : props.onConfirmSave,
        }, t(busy ? 'common.working' : props.confirmation === 'delete' ? 'remove.confirm' : props.confirmation === 'discard' ? 'editor.discardChanges' : 'common.save')),
      ),
    },
      React.createElement('p', { className: 'dshpm-confirm-message' }, t(props.confirmation === 'delete' ? 'remove.body' : props.confirmation === 'discard' ? 'editor.unsavedWarning' : 'editor.saveBody', { name: state.draft?.name || name })),
      props.confirmation === 'save' && changes ? React.createElement('p', { className: 'dshpm-hint' }, t('editor.changeSummary', {
        metadata: changes.changedMetadata.length, added: changes.addedPlugins.length, changed: changes.changedPlugins.length, removed: changes.removedPlugins.length,
      })) : null,
      props.confirmation === 'delete' && source?.isDefault ? React.createElement(React.Fragment, null,
        React.createElement(Notice, { level: 'warning', message: t('remove.defaultRiskBody') }),
        React.createElement(Checkbox, { checked: props.acknowledgedDefaultRisk === true, onChange: (value) => props.onAcknowledgeDefaultRisk?.(value) }, t('remove.defaultRiskConfirm')),
      ) : null,
    ) : null,
  )
}

export function OperationNotice({ state, store, t }: { state: PageState; store: PresetManagerStore; t: Translate }): React.ReactElement | null {
  const notice = state.notice
  return notice === undefined || notice.localAction !== undefined ? null : React.createElement(Notice, {
    ...notice, onDismiss: () => store.dismissNotice(), dismissLabel: t('common.dismiss'),
  })
}
function Diagnostics({ state, t }: { state: PageState; t: Translate }): React.ReactElement | null {
  const diagnostics = state.snapshot?.diagnostics ?? []
  return diagnostics.length === 0 ? null : React.createElement(Notice, {
    level: state.snapshot?.phase === 'degraded' ? 'warning' : 'info', title: t('diagnostics.heading'),
    details: diagnostics.map((issue) => `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${issue.detail === undefined ? '' : `（${issue.detail}）`}`),
  })
}
