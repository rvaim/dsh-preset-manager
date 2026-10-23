/**
 * The settings page's single state owner.
 *
 * One store, written as a plain observable, rather than component-local state
 * scattered across the tree. The reason is the editor: the Persona form and the
 * YAML editor must share one draft, and a reload must replace that draft without
 * either form holding a private copy that silently diverges.
 *
 * Every mutation follows the same shape — mark busy, call the API, reload the
 * snapshot, record the outcome — so the page's list is always derived from what
 * the Host reports, never from an optimistic local guess.
 *
 * The store also owns the Remote mount state. That is what lets the page say
 * "the Host interface is not ready, and here is why" instead of showing a dead
 * list behind an unexplained error.
 */
import type {
  HistoryEntry,
  ImportPreview,
  ManagerSnapshot,
  PresetDefinition,
  PresetDetail,
  PresetDiff,
  ValidationReport,
} from '../../shared/types.js'
import type { PresetManagerApi } from '../api/remote-api.js'
import { createApi, RemoteInvocationError } from '../api/remote-api.js'
import type { MountState } from './mount-remote.js'

/** A user-facing notice: the outcome of an operation, or a load failure. */
export interface Notice {
  readonly level: 'info' | 'success' | 'warning' | 'error'
  readonly title?: string
  readonly message: string
  /** Detail lines, such as validation issues. */
  readonly details?: readonly string[]
}

/** Which pane the page is showing. */
export type PageView =
  | { readonly kind: 'list' }
  | { readonly kind: 'detail'; readonly id: string }
  | { readonly kind: 'editor'; readonly id: string; readonly mode: 'persona' | 'yaml' }
  | { readonly kind: 'history'; readonly id: string }

export interface PageState {
  /** Whether the Remote namespace is available, and why not. */
  readonly mount: MountState
  readonly status: 'idle' | 'loading' | 'ready' | 'failed'
  readonly snapshot: ManagerSnapshot | undefined
  readonly view: PageView
  readonly detail: PresetDetail | undefined
  readonly history: readonly HistoryEntry[]
  /**
   * The working draft.
   *
   * Shared by the Persona and YAML editors by construction; switching editors
   * only changes how it is displayed, never what it contains.
   */
  readonly draft: PresetDefinition | undefined
  readonly draftRevision: string | undefined
  readonly yamlText: string
  readonly yamlError: string | undefined
  readonly validation: ValidationReport | undefined
  readonly diff: PresetDiff | undefined
  readonly preview: ImportPreview | undefined
  readonly busy: boolean
  readonly notice: Notice | undefined
}

const INITIAL: PageState = {
  mount: { status: 'mounting' },
  status: 'idle',
  snapshot: undefined,
  view: { kind: 'list' },
  detail: undefined,
  history: [],
  draft: undefined,
  draftRevision: undefined,
  yamlText: '',
  yamlError: undefined,
  validation: undefined,
  diff: undefined,
  preview: undefined,
  busy: false,
  notice: undefined,
}

type Listener = () => void

export class PresetManagerStore {
  /**
   * Resolves the API lazily.
   *
   * The page mounts before the Remote namespace exists, so the store takes a
   * provider: an early call fails with an actionable message, and a later call
   * uses the real proxy without the store having to be recreated.
   */
  private apiProvider: (() => PresetManagerApi) | undefined
  private state: PageState = INITIAL
  private readonly listeners = new Set<Listener>()

  constructor(apiProvider?: () => PresetManagerApi) {
    this.apiProvider = apiProvider
  }

  // ------------------------------------------------------------ observable

  getState = (): PageState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(patch: Partial<PageState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  private notice(notice: Notice | undefined): void {
    this.set({ notice })
  }

  // ------------------------------------------------------------------ mount

  /**
   * Record the Remote mount outcome.
   *
   * A ready mount installs the API and loads the list; a failed mount keeps the
   * reason so the page can show it verbatim rather than a generic failure.
   */
  attachMount(state: MountState): void {
    this.set({ mount: state })
    if (state.status !== 'ready' || state.service === undefined) return
    const service = state.service
    this.apiProvider = () => createApi(service)
    void this.load()
  }

  private get api(): PresetManagerApi {
    if (this.apiProvider === undefined) {
      throw new Error('Host 接口尚未就绪')
    }
    return this.apiProvider()
  }

  /** The API for panels that call it directly (export, data management). */
  get apiForPanel(): PresetManagerApi {
    return this.api
  }

  // --------------------------------------------------------------- loading

  async load(): Promise<void> {
    if (this.apiProvider === undefined) {
      this.set({
        status: 'failed',
        notice: {
          level: 'error',
          title: 'Host 接口尚未就绪',
          message:
            this.state.mount.status === 'failed'
              ? this.state.mount.error ?? '挂载失败，未提供原因'
              : '正在挂载运行时接口，请稍候。',
        },
      })
      return
    }
    this.set({ status: 'loading' })
    try {
      const snapshot = await this.api.snapshot()
      this.set({ status: 'ready', snapshot, notice: undefined })
    } catch (error) {
      this.set({ status: 'failed', notice: describeFailure(error) })
    }
  }

  /** Re-read the list without flashing the loading state. */
  async refresh(): Promise<void> {
    if (this.apiProvider === undefined) return
    try {
      const snapshot = await this.api.snapshot()
      this.set({ status: 'ready', snapshot })
    } catch (error) {
      this.set({ notice: describeFailure(error) })
    }
  }

  // ------------------------------------------------------------ navigation

  async openDetail(id: string): Promise<void> {
    this.set({ view: { kind: 'detail', id }, detail: undefined, notice: undefined })
    try {
      const detail = await this.api.detail(id)
      this.set({ detail })
    } catch (error) {
      this.set({ notice: describeFailure(error) })
    }
  }

  /** Open the editor with a copy of the stored definition as the draft. */
  async openEditor(id: string, mode: 'persona' | 'yaml'): Promise<void> {
    this.set({
      view: { kind: 'editor', id, mode },
      detail: undefined,
      draft: undefined,
      draftRevision: undefined,
      yamlText: '',
      yamlError: undefined,
      validation: undefined,
      diff: undefined,
      notice: undefined,
    })
    try {
      const detail = await this.api.detail(id)
      const yaml = await this.api.renderYaml(id)
      this.set({
        detail,
        draft: detail.definition,
        draftRevision: detail.revision,
        yamlText: yaml,
      })
    } catch (error) {
      this.set({ notice: describeFailure(error) })
    }
  }

  /** Switch the editor mode, keeping the single shared draft untouched. */
  setEditorMode(mode: 'persona' | 'yaml'): void {
    const view = this.state.view
    if (view.kind !== 'editor') return
    this.set({ view: { kind: 'editor', id: view.id, mode } })
  }

  async openHistory(id: string): Promise<void> {
    this.set({ view: { kind: 'history', id }, history: [], notice: undefined })
    try {
      const history = await this.api.history(id)
      this.set({ history })
    } catch (error) {
      this.set({ notice: describeFailure(error) })
    }
  }

  backToList(): void {
    this.set({
      view: { kind: 'list' },
      detail: undefined,
      draft: undefined,
      draftRevision: undefined,
      yamlText: '',
      yamlError: undefined,
      validation: undefined,
      diff: undefined,
      preview: undefined,
      notice: undefined,
    })
    void this.refresh()
  }

  // ------------------------------------------------------------- draft edit

  /** Replace the shared draft, as the Persona form does on every keystroke. */
  setDraft(definition: PresetDefinition): void {
    this.set({ draft: definition, validation: undefined, diff: undefined })
  }

  /** Replace the shared draft from the YAML editor, reporting parse problems. */
  async setYaml(text: string): Promise<void> {
    this.set({ yamlText: text })
    const draft = this.state.draft
    if (draft === undefined) return
    try {
      const parsed = await this.api.parseYaml(draft.id, text)
      this.set({
        draft: parsed.definition,
        yamlError: undefined,
        validation: parsed.validation,
        diff: undefined,
      })
    } catch (error) {
      // A YAML syntax error must not discard the last good draft: the user is
      // mid-edit and needs the text they typed to stay in the box.
      this.set({ yamlError: messageOf(error), validation: undefined })
    }
  }

  /** Validate and diff the current draft before saving. */
  async prepareSave(): Promise<boolean> {
    const { draft, detail } = this.state
    if (draft === undefined) return false
    this.set({ busy: true, notice: undefined })
    try {
      const [validation, diff] = await Promise.all([
        this.api.validate(draft),
        detail === undefined
          ? Promise.resolve(undefined)
          : this.api.diff(detail.definition, draft),
      ])
      this.set({ busy: false, validation, diff })
      if (!validation.ok) {
        this.notice({
          level: 'error',
          title: '配置校验未通过，尚未保存',
          message: '',
          details: validation.errors.map(formatIssue),
        })
        return false
      }
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  /** Commit the draft. */
  async save(): Promise<boolean> {
    const { draft, draftRevision } = this.state
    if (draft === undefined) return false
    this.set({ busy: true, notice: undefined })
    try {
      await this.api.save({
        definition: draft,
        ...(draftRevision === undefined ? {} : { expectedRevision: draftRevision }),
      })
      await this.refresh()
      this.set({ busy: false })
      this.notice({
        level: 'success',
        message: `已保存并注册「${draft.name ?? draft.id}」`,
      })
      // Re-read the editor state so the revision the next save compares against
      // is the one the Host now holds.
      const view = this.state.view
      if (view.kind === 'editor') await this.openEditor(view.id, view.mode)
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  // -------------------------------------------------------------- commands

  async clone(request: {
    sourceId: string
    newId: string
    name?: string
  }): Promise<boolean> {
    this.set({ busy: true, notice: undefined })
    try {
      const result = await this.api.clone(request)
      await this.refresh()
      this.set({ busy: false })
      this.notice({
        level: 'success',
        message: `已复制为「${result.preset?.name ?? request.newId}」`,
      })
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  async remove(id: string, acknowledgedDefaultRisk = false): Promise<boolean> {
    this.set({ busy: true, notice: undefined })
    try {
      await this.api.remove({ id, acknowledgedDefaultRisk })
      await this.refresh()
      this.set({ busy: false, view: { kind: 'list' }, detail: undefined })
      this.notice({
        level: 'success',
        message: '预设已删除，可在历史版本中恢复',
      })
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  async restoreRevision(id: string, revision: string): Promise<boolean> {
    this.set({ busy: true, notice: undefined })
    try {
      await this.api.restore({ id, revision })
      await this.refresh()
      this.set({ busy: false })
      this.notice({ level: 'success', message: '已恢复该版本' })
      await this.openHistory(id)
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  // --------------------------------------------------------------- import

  /** Parse share text into a preview; nothing is applied yet. */
  async previewImport(text: string, source: 'share' | 'yaml-file'): Promise<boolean> {
    this.set({ busy: true, notice: undefined, preview: undefined })
    try {
      const preview = await this.api.previewImport({ text, source })
      this.set({ busy: false, preview })
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  /** Apply the previewed import after the user confirms. */
  async confirmImport(options: {
    text: string
    source: 'share' | 'yaml-file'
    id?: string
    name?: string
    acknowledgedRisks: boolean
  }): Promise<boolean> {
    this.set({ busy: true, notice: undefined })
    try {
      await this.api.importPreset(options)
      await this.refresh()
      this.set({ busy: false, preview: undefined })
      this.notice({ level: 'success', message: '预设已导入并注册' })
      return true
    } catch (error) {
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  clearPreview(): void {
    this.set({ preview: undefined })
  }

  dismissNotice(): void {
    this.notice(undefined)
  }
}

/** Render one validation issue as a single display line. */
export function formatIssue(issue: {
  code: string
  message: string
  path?: string
  detail?: string
}): string {
  const location = issue.path === undefined ? '' : `${issue.path}: `
  const detail = issue.detail === undefined ? '' : `（${issue.detail}）`
  return `${location}${issue.message}${detail}`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Turn a caught value into a notice.
 *
 * A Remote failure keeps its Host message and detail lines; anything else is
 * reported verbatim, because inventing a friendlier message would hide the one
 * piece of information that helps.
 */
export function describeFailure(error: unknown): Notice {
  if (error instanceof RemoteInvocationError) {
    return {
      level: 'error',
      title: '操作失败',
      message: error.message,
      ...(error.details.length === 0
        ? {}
        : { details: error.details.map((issue) => formatIssue(issue)) }),
    }
  }
  return { level: 'error', title: '操作失败', message: messageOf(error) }
}
