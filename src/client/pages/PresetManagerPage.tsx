/**
 * The settings page: one list, and one active pane.
 *
 * The page is a plain view over {@link PresetManagerStore}; it holds no
 * authoritative state of its own. That is what keeps the list honest after every
 * operation — each mutation ends with a fresh Host snapshot, so what is on
 * screen is what the Host reported, not what the click hoped for.
 */
import * as React from 'react'
import type { ManagerSnapshot, PresetSummary } from '../../shared/types.js'
import type { PageState, PresetManagerStore } from '../state/store.js'
import { Notice, SectionHeader } from '../components/primitives.js'
import { PresetList } from '../features/preset-list/PresetList.js'
import { PresetDetailView } from '../features/preset-list/PresetDetailView.js'
import { PresetEditor } from '../features/persona-editor/PresetEditor.js'
import { HistoryView } from '../features/preset-history/HistoryView.js'
import { CloneDialog } from '../features/preset-clone/CloneDialog.js'
import { ImportPanel } from '../features/preset-import/ImportPanel.js'
import { ExportPanel } from '../features/preset-export/ExportPanel.js'
import { DataPanel } from '../features/preset-history/DataPanel.js'

export interface PageProps {
  readonly store: PresetManagerStore
  readonly useStore: () => PageState
  readonly t: (key: string) => string
}

/** Which modal-ish panel is open over the list. */
type Overlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'clone' }
  | { readonly kind: 'import' }
  | { readonly kind: 'export'; readonly id: string }
  | { readonly kind: 'data' }

export function PresetManagerPage(props: PageProps): React.ReactElement {
  const { store, useStore, t } = props
  const state = useStore()
  const [overlay, setOverlay] = React.useState<Overlay>({ kind: 'none' })

  React.useEffect(() => {
    void store.load()
  }, [store])

  const snapshot: ManagerSnapshot | undefined = state.snapshot
  const busy = state.busy || snapshot?.busy === true

  const closeOverlay = React.useCallback(() => {
    setOverlay({ kind: 'none' })
    store.dismissNotice()
  }, [store])

  return React.createElement(
    'div',
    { className: 'dshpm' },

    React.createElement(
      'div',
      { className: 'dshpm-header' },
      React.createElement('h3', { className: 'dshpm-title' }, t('title')),
      React.createElement('p', { className: 'dshpm-subtitle' }, t('subtitle')),
    ),

    state.notice === undefined
      ? null
      : React.createElement(Notice, {
          level: state.notice.level,
          message: state.notice.message,
          ...(state.notice.details === undefined ? {} : { details: state.notice.details }),
          onDismiss: () => store.dismissNotice(),
        }),

    snapshot === undefined
      ? React.createElement('p', { className: 'dshpm-muted' }, t('loading'))
      : React.createElement(DiagnosticsBanner, { snapshot, t }),

    overlay.kind === 'export'
      ? React.createElement(ExportPanel, {
          api: store.apiForPanel,
          id: overlay.id,
          t,
          onClose: closeOverlay,
          onNotice: (level, message) =>
            level === 'error' ? store.dismissNotice() : undefined,
        })
      : null,

    overlay.kind === 'clone'
      ? React.createElement(CloneDialog, {
          store,
          t,
          presets: snapshot?.presets ?? [],
          onClose: closeOverlay,
          onCloned: closeOverlay,
        })
      : null,

    overlay.kind === 'import'
      ? React.createElement(ImportPanel, {
          store,
          t,
          state,
          onClose: closeOverlay,
          onImported: closeOverlay,
        })
      : null,

    overlay.kind === 'data'
      ? React.createElement(DataPanel, {
          store,
          t,
          snapshot,
          api: store.apiForPanel,
          onClose: closeOverlay,
        })
      : null,

    // ---- primary toolbar
    React.createElement(
      'div',
      { className: 'dshpm-toolbar' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dshpm-primary',
          disabled: busy || snapshot === undefined,
          onClick: () => setOverlay({ kind: 'import' }),
        },
        t('action.import'),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          disabled: busy || snapshot === undefined,
          onClick: () => setOverlay({ kind: 'clone' }),
        },
        t('action.clone'),
      ),
      React.createElement('span', { className: 'dshpm-spacer' }),
      state.view.kind === 'list'
        ? null
        : React.createElement(
            'button',
            { type: 'button', onClick: () => store.backToList() },
            t('back'),
          ),
      React.createElement(
        'button',
        { type: 'button', disabled: busy, onClick: () => void store.refresh() },
        t('refresh'),
      ),
      React.createElement(
        'button',
        { type: 'button', disabled: busy, onClick: () => setOverlay({ kind: 'data' }) },
        t('action.purge'),
      ),
    ),

    busy ? React.createElement('p', { className: 'dshpm-muted' }, t('busy')) : null,

    // ---- active pane
    renderPane(state, props, setOverlay),
  )
}

function renderPane(
  state: PageState,
  props: PageProps,
  setOverlay: (overlay: Overlay) => void,
): React.ReactElement {
  const { store, t } = props
  const view = state.view

  if (view.kind === 'detail') {
    return React.createElement(PresetDetailView, {
      state,
      t,
      onEditPersona: () => void store.openEditor(view.id, 'persona'),
      onEditYaml: () => void store.openEditor(view.id, 'yaml'),
      onHistory: () => void store.openHistory(view.id),
      onExport: () => setOverlay({ kind: 'export', id: view.id }),
      onClone: () => setOverlay({ kind: 'clone' }),
      onDelete: () => void store.remove(view.id),
      onBack: () => store.backToList(),
    })
  }

  if (view.kind === 'editor') {
    return React.createElement(PresetEditor, {
      state,
      store,
      t,
      mode: view.mode,
      onModeChange: (mode) => void store.setEditorMode(mode),
      onBack: () => void store.openDetail(view.id),
      onSaved: () => void store.openDetail(view.id),
    })
  }

  if (view.kind === 'history') {
    return React.createElement(HistoryView, {
      state,
      store,
      t,
      onBack: () => void store.openDetail(view.id),
    })
  }

  return React.createElement(PresetList, {
    state,
    t,
    onView: (id: string) => void store.openDetail(id),
    onEditPersona: (id: string) => void store.openEditor(id, 'persona'),
    onHistory: (id: string) => void store.openHistory(id),
    onExport: (id: string) => setOverlay({ kind: 'export', id }),
    onClone: () => setOverlay({ kind: 'clone' }),
    onImport: () => setOverlay({ kind: 'import' }),
    onRetry: () => void store.load(),
  })
}

/**
 * Startup diagnostics.
 *
 * A quarantined file or a failed registration is shown as an explicit banner
 * rather than buried in the log: the user has to know that a preset they
 * believe exists did not load, and why.
 */
function DiagnosticsBanner(props: {
  snapshot: ManagerSnapshot
  t: (key: string) => string
}): React.ReactElement | null {
  const { snapshot, t } = props
  if (snapshot.diagnostics.length === 0) return null
  const details = snapshot.diagnostics.map(
    (issue) =>
      `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
        issue.detail === undefined ? '' : `（${issue.detail}）`
      }`,
  )
  return React.createElement(Notice, {
    level: snapshot.phase === 'degraded' ? 'warning' : 'info',
    message: t('diagnostics.degraded'),
    details,
  })
}

/** Shared helper: tone for a registration state. */
export function registrationTone(
  summary: PresetSummary,
): 'ok' | 'warn' | 'err' | 'idle' {
  if (summary.registration === 'failed') return 'err'
  if (summary.health === 'broken') return 'err'
  if (summary.registration === 'registered') return 'ok'
  return 'idle'
}
