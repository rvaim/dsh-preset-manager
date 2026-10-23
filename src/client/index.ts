/**
 * Client entry: register the settings page and the Remote namespace.
 *
 * Three decisions worth stating:
 *
 *  - The page renders **in** the settings panel's content column, not in an
 *    iframe served by the Host. An iframe would not receive the host's theme
 *    tokens, its light/dark switching, or `ctx.locale`.
 *  - The section is registered **synchronously**, while the Remote namespace is
 *    mounted asynchronously. A page that only appears once a transport handshake
 *    finished would make any transport hiccup look like a missing feature; this
 *    way the page always appears and reports its own loading or error state.
 *  - Styles are one `<style>` element owned by this plugin's effect, so disabling
 *    the plugin removes them. They reference only `--dsw-alias-*` tokens, so a
 *    renamed token degrades appearance rather than breaking rendering.
 */
import * as React from 'react'
import type { PresetManagerApi, PresetManagerRemoteService } from './api/remote-api.js'
import { createApi } from './api/remote-api.js'
import { PresetManagerStore } from './state/store.js'
import { PresetManagerPage } from './pages/PresetManagerPage.js'
import { zh } from './locales/zh.js'
import { en } from './locales/en.js'
import { PRESET_MANAGER_REMOTE } from '../host/remote/descriptors.js'

/**
 * The Client services this page needs.
 *
 * `remote.presetManager` is deliberately **not** listed: this plugin's own
 * `ctx.remote.$mount()` creates that namespace. Declaring it would make the
 * plugin wait for a service it is itself responsible for, so it would park
 * forever and the settings page would never appear.
 */
export const inject = ['slots', 'locale', 'remote']

/** Locale namespace owned by this plugin. */
const LOCALE_NS = 'dshPresetManager'

/** Slot id inside the settings navigation. */
const SECTION_ID = 'dsh-preset-manager'

/**
 * The subset of the Client Cordis context this plugin uses.
 *
 * Declared rather than imported because the Client packages are not dependencies
 * a bundle may import; this also documents exactly which capabilities the page
 * relies on.
 */
interface ClientContext {
  readonly logger?: { warn(message: string): void }
  readonly slots: {
    inject(key: string, callback: () => () => void): () => void
    register(
      options: {
        name: string
        id: string
        order?: number
        label?: string | (() => string)
        locale?: string
        inject?: () => unknown
      },
      component: unknown,
    ): () => void
  }
  readonly locale: {
    register(
      namespace: string,
      dictionaries: Record<string, Record<string, unknown>>,
    ): () => void
    bind(namespace: string): (key: string) => string
  }
  readonly remote: {
    /** Mount this package's Remote descriptors; resolves once the proxy exists. */
    $mount(contribution: unknown): Promise<() => Promise<void>>
  }
  effect(callback: () => (() => void) | void, label?: string): void
}

/**
 * A Remote proxy that is not mounted yet.
 *
 * Every call rejects with one actionable message instead of hanging or throwing
 * a TypeError, so a page opened before the mount settled shows "the Host
 * interface is not ready" rather than an empty table.
 */
function unavailableRemote(): PresetManagerRemoteService {
  const fail = async (): Promise<never> => {
    throw new Error('预设管理器的 Host 接口尚未就绪，请稍后重试')
  }
  return new Proxy({} as PresetManagerRemoteService, {
    get: () => fail,
  })
}

/**
 * Activate the Client half.
 *
 * The store is created per activation, not as a module singleton: a module-level
 * store would survive a disable/enable cycle and keep serving stale data, and
 * would hold the previous namespace service after an HMR replacement.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, { zh, en }),
    'dsh-preset-manager: locale dictionaries',
  )

  // The store reads its API through a getter, so it can be constructed before
  // the namespace exists and picks up the real proxy the moment it does.
  let api: PresetManagerApi | undefined
  const store = new PresetManagerStore(() => {
    if (api === undefined) throw new Error('预设管理器的 Host 接口尚未就绪')
    return api
  })

  ctx.effect(() => {
    let cancelled = false
    void ctx.remote
      .$mount(PRESET_MANAGER_REMOTE)
      .then(() => {
        if (cancelled) return
        const mounted = (ctx.remote as unknown as {
          presetManager?: PresetManagerRemoteService
        }).presetManager
        if (mounted === undefined) {
          ctx.logger?.warn('dsh-preset-manager: $mount 已返回，但未安装 presetManager 命名空间')
          return
        }
        api = createApi(mounted)
        // The page may already be open; reload so it stops showing its
        // "not ready" state.
        void store.load()
      })
      .catch((error: unknown) => {
        if (cancelled) return
        ctx.logger?.warn(
          `dsh-preset-manager: Remote 接口挂载失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
    return () => {
      cancelled = true
    }
  }, 'dsh-preset-manager: remote namespace')

  ctx.effect(
    () => {
      const style = document.createElement('style')
      style.dataset.dshPresetManager = 'true'
      style.textContent = STYLES
      document.head.append(style)
      return () => style.remove()
    },
    'dsh-preset-manager: page styles',
  )

  // Subscribe through a hook so React sees one stable snapshot source.
  function useStore(): ReturnType<PresetManagerStore['getState']> {
    return React.useSyncExternalStore(store.subscribe, store.getState, store.getState)
  }

  function Page(): React.ReactElement {
    return React.createElement(PresetManagerPage, {
      store,
      useStore,
      t: ctx.locale.bind(LOCALE_NS),
    })
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        // After Plugins (15) and the shipped presets page (20), so the manager
        // sits beside the thing it extends rather than above unrelated settings.
        order: 25,
        label: () => ctx.locale.bind(LOCALE_NS)('nav'),
        locale: LOCALE_NS,
      },
      Page,
    ),
  )
}

/**
 * Page styles.
 *
 * Every color is a `--dsw-alias-*` token. Spacing and type follow the host's
 * settings pages so the section reads as part of one application.
 */
const STYLES = `
.dshpm { display: flex; flex-direction: column; gap: 16px; color: var(--dsw-alias-label-primary); }
.dshpm-header { display: flex; flex-direction: column; gap: 4px; }
.dshpm-title { font-size: 16px; font-weight: 600; margin: 0; }
.dshpm-subtitle { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }
.dshpm-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dshpm-spacer { flex: 1 1 auto; }
.dshpm button {
  font: inherit; font-size: 12px; color: inherit; background: transparent;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  padding: 5px 10px; cursor: pointer; min-height: 28px;
}
.dshpm button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dshpm button:disabled { opacity: .5; cursor: not-allowed; }
.dshpm button.dshpm-primary {
  background: var(--dsw-alias-brand-primary);
  color: #fff; border-color: transparent; font-weight: 500;
}
.dshpm button.dshpm-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dshpm :is(button, input, textarea, select):focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px;
}
.dshpm input[type=text], .dshpm textarea, .dshpm select {
  box-sizing: border-box; width: 100%; font: inherit; font-size: 12px; color: inherit;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 6px 8px;
}
.dshpm textarea { min-height: 120px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.5; }
.dshpm textarea.dshpm-code { min-height: 320px; }
.dshpm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dshpm-table th {
  text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary);
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); white-space: nowrap;
}
.dshpm-table td { padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: top; }
.dshpm-table tr:last-child td { border-bottom: none; }
.dshpm-name { display: flex; flex-direction: column; gap: 2px; }
.dshpm-name strong { font-weight: 500; }
.dshpm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dshpm-badges { display: flex; flex-wrap: wrap; gap: 4px; }
.dshpm-badge {
  display: inline-flex; align-items: center; font-size: 11px; line-height: 16px;
  padding: 0 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); white-space: nowrap;
}
.dshpm-badge.dshpm-ok { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); }
.dshpm-badge.dshpm-warn { color: var(--dsw-alias-state-warn-primary); border-color: var(--dsw-alias-state-warn-primary); }
.dshpm-badge.dshpm-err { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.dshpm-badge.dshpm-idle { color: var(--dsw-alias-state-idle-primary); border-color: var(--dsw-alias-state-idle-primary); }
.dshpm-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.dshpm-notice { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 10px 12px; font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
.dshpm-notice.dshpm-success { border-color: var(--dsw-alias-state-success-primary); }
.dshpm-notice.dshpm-error { border-color: var(--dsw-alias-state-error-primary); }
.dshpm-notice.dshpm-warning { border-color: var(--dsw-alias-state-warn-primary); }
.dshpm-notice-head { display: flex; align-items: flex-start; gap: 8px; }
.dshpm-notice-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.dshpm-details { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.dshpm-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: var(--dsw-alias-bg-layer-1); }
.dshpm-field { display: flex; flex-direction: column; gap: 4px; }
.dshpm-label { font-size: 12px; font-weight: 500; }
.dshpm-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dshpm-row { display: flex; flex-wrap: wrap; gap: 12px; }
.dshpm-row > .dshpm-field { flex: 1 1 220px; min-width: 0; }
.dshpm-section-title { font-size: 13px; font-weight: 600; margin: 0; }
.dshpm-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshpm-error-text { color: var(--dsw-alias-state-error-primary); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dshpm-tabs { display: flex; gap: 6px; }
.dshpm-tabs button[aria-pressed=true] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-brand-primary); }
.dshpm-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; overflow-wrap: anywhere; }
.dshpm-preauth { min-height: 160px; }
.dshpm-inline { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dshpm-checkbox { width: auto; }
`
