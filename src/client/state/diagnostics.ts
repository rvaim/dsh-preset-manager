/** Bounded, read-only browser diagnostics for verifying the installed page. */
import type { Context } from '@deepseek-ai/cordis'
import { parsePresetDocument } from '../../domain/preset-model.js'
import { listCompositionRows } from '../../domain/composition-editor.js'
import type { PresetManagerStore } from './store.js'

interface InspectProvider {
  readonly manifest: {
    readonly id: string
    readonly description: string
    readonly methods: readonly {
      readonly name: string
      readonly description: string
      readonly inputSchema: object
      readonly outputSchema: object
    }[]
  }
  query(method: string): object
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cordisInspect: { register(provider: InspectProvider): () => void }
  }
}

export function registerDiagnostics(
  host: Pick<Context, 'inject'>,
  store: PresetManagerStore,
  version: string,
): void {
  // Diagnostics are optional; a profile without the inspector still gets the page.
  host.inject(['cordisInspect'], (ctx) => {
    ctx.effect(() => ctx.cordisInspect.register({
      manifest: {
        id: '@rvaim/dsh-preset-manager',
        description: 'Read-only state of the installed Agent Preset Manager in the connected browser.',
        methods: [{
          name: 'getStatus',
          description: 'Return version, namespace readiness, list loading state, preset count and mounted page count. Does not change presets or UI.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          outputSchema: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              mountStatus: { type: 'string' },
              loadStatus: { type: 'string' },
              phase: { type: 'string' },
              presetCount: { type: 'number' },
              mountedPages: { type: 'number' },
              mountError: { type: 'string' },
              notice: { type: 'string' },
            },
            required: ['version', 'mountStatus', 'loadStatus', 'presetCount', 'mountedPages'],
            additionalProperties: false,
          },
        }, {
          name: 'getAppearance',
          description: 'Read current theme colors and this plugin’s rendered buttons and card descriptions without changing theme or UI.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          outputSchema: { type: 'object' },
        }, {
          name: 'getDocumentModel',
          description: 'Read one built-in preset through the running Host and report only document fields and composition counts. Does not modify data or reveal prompt text.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          outputSchema: { type: 'object' },
        }],
      },
      query(method) {
        if (method === 'getDocumentModel') {
          const presets = store.getState().snapshot?.presets ?? []
          const preset = presets.find((entry) => entry.ownership === 'builtin') ?? presets[0]
          if (!preset) return { available: false }
          return store.apiForPanel.renderYaml(preset.id).then((text) => {
            const document = parsePresetDocument(text)
            const entries = listCompositionRows(document)
            return { available: true, format: 'preset-document', id: document.id,
              fields: Object.keys(document), entries: entries.length,
              groups: entries.filter((entry) => entry.row.group === true).length,
              personaPaths: entries.filter((entry) => entry.row.name === '@deepseek-ai/dsh-persona').map((entry) => entry.path),
            }
          })
        }
        if (method === 'getAppearance') {
          const page = document.querySelector('.dshpm')
          const root = getComputedStyle(page ?? document.body)
          const tokens = Object.fromEntries([
            '--dsw-alias-bg-base', '--dsw-alias-label-primary',
            '--dsw-alias-brand-primary', '--dsw-alias-label-secondary',
          ].map((key) => [key, root.getPropertyValue(key).trim()]))
          return {
            tokens,
            rendered: page !== null,
            viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
            dialogs: Array.from(page?.querySelectorAll<HTMLDialogElement>('.dshpm-dialog[open]') ?? []).map((dialog) => {
              const bounds = dialog.getBoundingClientRect()
              return { width: bounds.width, height: bounds.height, variant: dialog.className }
            }),
            yamlEditors: Array.from(page?.querySelectorAll('.dshpm-code-editor') ?? []).map((editor) => ({
              numberedLines: editor.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length,
              syntaxSpans: editor.querySelectorAll('.cm-line span[class]').length,
              indentLines: editor.querySelectorAll('.dshpm-code-indent').length,
              readOnly: editor.querySelector('.cm-content')?.getAttribute('aria-readonly'),
            })),
            treeGuides: page?.querySelectorAll('.dshpm-tree-guide, .dshpm-tree-stem, .dshpm-tree-connector').length ?? 0,
            gridColumns: page?.querySelector('.dshpm-preset-grid') ? getComputedStyle(page.querySelector('.dshpm-preset-grid')!).gridTemplateColumns : null,
            openDialogs: Array.from(page?.querySelectorAll('.dshpm-dialog[open] .dshpm-dialog-title') ?? []).map((title) => title.textContent),
            buttons: Array.from(page?.querySelectorAll<HTMLButtonElement>('.dshpm-btn') ?? []).slice(0, 20).map((button) => {
              const style = getComputedStyle(button)
              return { label: button.textContent?.trim() || button.getAttribute('aria-label'),
                foreground: style.color, background: style.backgroundColor, disabled: button.disabled }
            }),
            cards: Array.from(page?.querySelectorAll<HTMLElement>('.dshpm-preset-card') ?? []).map((card) => ({
              id: card.dataset.presetId,
              description: card.querySelector('.dshpm-preset-description')?.textContent,
            })),
          }
        }
        if (method !== 'getStatus') throw new Error(`Unknown preset-manager diagnostic: ${method}`)
        const state = store.getState()
        return {
          version,
          mountStatus: state.mount.status,
          loadStatus: state.status,
          presetCount: state.snapshot?.presets.length ?? 0,
          mountedPages: store.mountedPages,
          ...(state.snapshot === undefined ? {} : { phase: state.snapshot.phase }),
          ...(state.mount.error === undefined ? {} : { mountError: state.mount.error }),
          ...(state.notice === undefined ? {} : { notice: state.notice.message }),
        }
      },
    }), 'dsh-preset-manager: read-only diagnostics')
  })
}
