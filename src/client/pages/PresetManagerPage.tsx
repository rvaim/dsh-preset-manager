/**
 * The settings page: one header, one active pane.
 *
 * The page is a plain view over {@link PresetManagerStore}; it holds no
 * authoritative state of its own. That is what keeps the list honest after every
 * operation — each mutation ends with a fresh Host snapshot, so what is on
 * screen is what the Host reported, not what the click hoped for.
 *
 * The Remote mount has its own first-class state. When it fails, the page shows
 * the actual reason the gateway returned rather than a generic "load failed",
 * because a mount failure is a defect and hiding its cause makes it unfixable.
 */
import * as React from 'react'
import type { PageState, PresetManagerStore } from '../state/store.js'
import { Notice } from '../components/primitives.js'
import { PresetList } from '../features/preset-list/PresetList.js'
import { PresetDetailView } from '../features/preset-list/PresetDetailView.js'
import { PresetEditor } from '../features/persona-editor/PresetEditor.js'
import { HistoryView } from '../features/preset-history/HistoryView.js'
import { CloneDialog } from '../features/preset-clone/CloneDialog.js'
import { ImportPanel } from '../features/preset-import/ImportPanel.js'
import { ExportPanel } from '../features/preset-export/ExportPanel.js'
import { DataPanel } from '../features/preset-history/DataPanel.js'

/** The translate signature DSH's locale binding provides. */
export type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string

export interface PageProps {
  readonly store: PresetManagerStore
  readonly useStore: () => PageState
  readonly t: Translate
}

/** Which panel is open over the list. */
export type Overlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'clone' }
  | { readonly kind: 'import' }
  | { readonly kind: 'export'; readonly id: string }
  | { readonly kind: 'data' }

export function PresetManagerPage(props: PageProps): React.ReactElement {
  const { store, useStore, t } = props
  const state = useStore()
  const [overlay, setOverlay] = React.useState<Overlay>({ kind: 'none' })

  const closeOverlay = React.useCallback(() => {
    setOverlay({ kind: 'none' })
    store.dismissNotice()
  }, [store])

  const busy = state.busy || state.snapshot?.busy === true
  const ready = state.mount.status === 'ready'

  return React.createElement(
    'div',
    { className: 'dshpm' },

    // ---- header
    React.createElement(
      'div',
      { className: 'dshpm-head' },
      React.createElement(
        'div',
        { className: 'dshpm-head-text' },
        React.createElement('h2', { className: 'dshpm-title' }, t('page.title')),
        React.createElement('p', { className: 'dshpm-subtitle' }, t('page.subtitle')),
      ),
      React.createElement(
        'div',
        { className: 'dshpm-head-actions' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshpm-btn',
            disabled: busy || !ready,
            onClick: () => void store.refresh(),
          },
          t('common.refresh'),
        ),
      ),
    ),

    // ---- mount failure: the real reason, not a generic one
    state.mount.status === 'failed'
      ? React.createElement(Notice, {
          level: 'error',
          title: t('error.notReadyTitle'),
          message: state.mount.error ?? t('error.notReadyBody'),
        })
      : null,

    // ---- operation notice
    state.notice === undefined
      ? null
      : React.createElement(Notice, {
          level: state.notice.level,
          ...(state.notice.title === undefined ? {} : { title: state.notice.title }),
          message: state.notice.message,
          ...(state.notice.details === undefined ? {} : { details: state.notice.details }),
          onDismiss: () => store.dismissNotice(),
          dismissLabel: t('common.dismiss'),
        }),

    // ---- startup diagnostics
    state.snapshot === undefined
      ? null
      : React.createElement(Diagnostics, { state, t }),

    // ---- overlays
    overlay.kind === 'export'
      ? React.createElement(ExportPanel, {
          api: store.apiForPanel,
          id: overlay.id,
          t,
          onClose: closeOverlay,
        })
      : null,

    overlay.kind === 'clone'
      ? React.createElement(CloneDialog, {
          store,
          t,
          presets: state.snapshot?.presets ?? [],
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
          snapshot: state.snapshot,
          api: store.apiForPanel,
          onClose: closeOverlay,
        })
      : null,

    // ---- active pane
    renderPane(state, props, setOverlay, busy, ready),
  )
}

function renderPane(
  state: PageState,
  props: PageProps,
  setOverlay: (next: Overlay) => void,
  busy: boolean,
  ready: boolean,
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
      onModeChange: (mode: 'persona' | 'yaml') => store.setEditorMode(mode),
      onBack: () => void store.openDetail(view.id),
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
    busy,
    ready,
    onView: (id: string) => void store.openDetail(id),
    onEditPersona: (id: string) => void store.openEditor(id, 'persona'),
    onHistory: (id: string) => void store.openHistory(id),
    onExport: (id: string) => setOverlay({ kind: 'export', id }),
    onClone: () => setOverlay({ kind: 'clone' }),
    onImport: () => setOverlay({ kind: 'import' }),
    onData: () => setOverlay({ kind: 'data' }),
    onRetry: () => void store.load(),
  })
}

/**
 * Startup diagnostics.
 *
 * A quarantined file or a failed registration is shown explicitly rather than
 * buried in the log: the user has to know that a preset they believe exists did
 * not load, and why.
 */
function Diagnostics(props: {
  state: PageState
  t: Translate
}): React.ReactElement | null {
  const { state, t } = props
  const diagnostics = state.snapshot?.diagnostics ?? []
  if (diagnostics.length === 0) return null
  return React.createElement(Notice, {
    level: state.snapshot?.phase === 'degraded' ? 'warning' : 'info',
    title: t('diagnostics.heading'),
    details: diagnostics.map(
      (issue) =>
        `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
          issue.detail === undefined ? '' : `（${issue.detail}）`
        }`,
    ),
  })
}
