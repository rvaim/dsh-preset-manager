/**
 * Client entry: register the settings page and the Remote namespace.
 *
 * Three decisions worth stating:
 *
 *  - The page renders **in** the settings panel's content column, not in an
 *    iframe served by the Host. An iframe would not receive the host's theme
 *    tokens, its light/dark switching, or `ctx.locale`.
 *  - The section is registered **synchronously**, while the Remote namespace is
 *    mounted asynchronously. A page that only appeared after a transport
 *    handshake would turn any hiccup into a missing feature; this way the page
 *    always appears and reports its own state — including the real mount error.
 *  - Locale dictionaries are flattened before registration, because DSH's
 *    locale lookup is a flat `dict[key]` and a nested tree would render every
 *    dotted key as its own name.
 */
import * as React from 'react'
import type { PresetManagerRemoteService } from './api/remote-api.js'
import { PresetManagerStore } from './state/store.js'
import { mountRemoteNamespace } from './state/mount-remote.js'
import { PresetManagerPage } from './pages/PresetManagerPage.js'
import { zh, en } from './locales/index.js'
import { STYLES } from './styles.js'
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
      dictionaries: Record<string, Record<string, string>>,
    ): () => void
    bind(namespace: string): (key: string, params?: Record<string, string | number>) => string
  }
  readonly remote: {
    $mount(contribution: unknown): Promise<() => Promise<void>>
  }
  effect(callback: () => (() => void) | void, label?: string): void
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

  const store = new PresetManagerStore()

  ctx.effect(() => {
    let cancelled = false
    mountRemoteNamespace(
      ctx,
      PRESET_MANAGER_REMOTE,
      (state) => store.attachMount(state),
      () => cancelled,
    )
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

/** Re-exported for the type of the mounted namespace, used by the store. */
export type { PresetManagerRemoteService }
