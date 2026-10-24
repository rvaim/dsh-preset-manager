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
  PresetSummary,
  PresetDiff,
  ValidationReport,
} from '../../shared/types.js'
import type { PresetManagerApi } from '../api/remote-api.js'
import { createApi, RemoteInvocationError } from '../api/remote-api.js'
import type { MountState } from './mount-remote.js'
import { dumpPresetDocument } from '../../domain/preset-model.js'

/** A user-facing notice: the outcome of an operation, or a load failure. */
export type EditorMode = 'persona' | 'plugins' | 'yaml'

export interface Notice {
  readonly localAction?: { readonly kind: 'fork' | 'copy' | 'toggle'; readonly id: string }
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
  | { readonly kind: 'editor'; readonly id: string; readonly mode: EditorMode }
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
  readonly parsingYaml: boolean
  readonly compositionError: string | undefined
  readonly validation: ValidationReport | undefined
  readonly diff: PresetDiff | undefined
  readonly preview: ImportPreview | undefined
  readonly previewingImport: boolean
  readonly busy: boolean
  readonly togglingId: string | undefined
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
  parsingYaml: false,
  compositionError: undefined,
  validation: undefined,
  diff: undefined,
  preview: undefined,
  previewingImport: false,
  busy: false,
  togglingId: undefined,
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
  private pageCount = 0
  private viewRequest = 0
  private yamlRequest = 0
  private importRequest = 0
  private importApproval: { text: string; source: 'share' | 'yaml-file'; id: string } | undefined
  private initialYaml = ''

  get hasUnsavedChanges(): boolean {
    return this.state.view.kind === 'editor' && this.state.draft !== undefined &&
      (JSON.stringify(this.state.draft) !== JSON.stringify(this.state.detail?.definition) ||
        this.state.yamlText !== this.initialYaml || this.state.yamlError !== undefined || this.state.compositionError !== undefined)
  }

  get mountedPages(): number {
    return this.pageCount
  }

  retainPage(): () => void {
    this.pageCount += 1
    let active = true
    return () => {
      if (!active) return
      active = false
      this.pageCount -= 1
    }
  }

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
    this.set({ busy: false, togglingId: undefined })
    this.clearPreview()
    if (state.status !== 'ready' || state.service === undefined) {
      this.apiProvider = undefined
      this.viewRequest += 1
      this.yamlRequest += 1
      this.set({ mount: state, status: 'idle', snapshot: undefined, notice: undefined, busy: false, parsingYaml: false, view: { kind: 'list' } })
      return
    }
    const api = createApi(state.service)
    this.apiProvider = () => api
    if (state.snapshot) {
      this.set({ mount: state, status: 'ready', snapshot: state.snapshot, notice: undefined })
    } else {
      this.set({ mount: state })
      void this.load()
    }
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
    if (this.state.mount.status === 'failed' && this.state.mount.retry) { this.state.mount.retry(); return }
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
    const api = this.api
    try {
      const snapshot = await api.snapshot()
      if (this.apiProvider?.() !== api) return
      this.set({ status: 'ready', snapshot, notice: undefined })
    } catch (error) {
      if (this.apiProvider?.() !== api) return
      this.set({ status: 'failed', notice: describeFailure(error) })
    }
  }

  /** Re-read the list without flashing the loading state. */
  async refresh(): Promise<boolean> {
    if (this.apiProvider === undefined) return false
    const api = this.api
    try {
      const snapshot = await api.snapshot()
      if (this.apiProvider?.() !== api) return false
      this.set({ status: 'ready', snapshot })
      return true
    } catch (error) {
      if (this.apiProvider?.() !== api) return false
      this.set({ notice: describeFailure(error) })
      return false
    }
  }

  // ------------------------------------------------------------ navigation

  async openDetail(id: string): Promise<void> {
    const request = ++this.viewRequest
    const api = this.api
    this.set({ view: { kind: 'detail', id }, detail: undefined, notice: undefined })
    try {
      const detail = await api.detail(id)
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ detail })
    } catch (error) {
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ view: { kind: 'list' }, notice: describeFailure(error) })
    }
  }

  /** Open the editing dialog directly from a card, without a detail-page hop. */
  async openEditor(id: string, mode: EditorMode): Promise<void> {
    const request = ++this.viewRequest
    const api = this.api
    this.yamlRequest += 1
    this.set({
      view: { kind: 'editor', id, mode }, detail: undefined, draft: undefined,
      draftRevision: undefined, yamlText: '', yamlError: undefined, parsingYaml: false, compositionError: undefined,
      validation: undefined, diff: undefined, notice: undefined,
    })
    try {
      const [detail, yaml] = await Promise.all([api.detail(id), api.renderYaml(id)])
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      if (!detail.editable) throw new Error('内置与第三方预设只读，请使用「复制并编辑」。')
      this.initialYaml = yaml
      this.set({ detail, draft: detail.definition, draftRevision: detail.revision, yamlText: yaml })
    } catch (error) {
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ view: { kind: 'list' }, notice: describeFailure(error) })
    }
  }

  /** Switch the editor mode, keeping the single shared draft untouched. */
  setEditorMode(mode: EditorMode): void {
    const view = this.state.view
    if (view.kind !== 'editor' || this.state.busy || this.state.parsingYaml || this.state.yamlError !== undefined || this.state.compositionError !== undefined || this.state.validation?.ok === false) return
    this.set({ view: { kind: 'editor', id: view.id, mode },
      ...(mode === 'yaml' && this.state.draft ? { yamlText: dumpPresetDocument(this.state.draft) } : {}) })
  }

  async openHistory(id: string): Promise<void> {
    const request = ++this.viewRequest
    const api = this.api
    this.set({ view: { kind: 'history', id }, history: [], notice: undefined })
    try {
      const history = await api.history(id)
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ history })
    } catch (error) {
      if (request !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ view: { kind: 'list' }, notice: describeFailure(error) })
    }
  }

  backToList(): void {
    this.viewRequest += 1
    this.yamlRequest += 1
    this.initialYaml = ''
    this.set({
      view: { kind: 'list' }, detail: undefined, draft: undefined,
      draftRevision: undefined, yamlText: '', yamlError: undefined, parsingYaml: false, compositionError: undefined,
      validation: undefined, diff: undefined, preview: undefined, notice: undefined,
    })
  }

  // ------------------------------------------------------------- draft edit

  setCompositionError(error: string | undefined): void {
    this.set({ compositionError: error })
  }

  /** Replace the shared draft, as the structured editors do on every keystroke. */
  setDraft(definition: PresetDefinition): void {
    if (this.state.busy) return
    this.set({ draft: definition,
      validation: this.state.view.kind === 'editor' && this.state.view.mode === 'yaml' && this.state.validation?.ok === false
        ? this.state.validation : undefined,
      diff: undefined })
  }

  /** Replace the shared draft from the YAML editor, reporting parse problems. */
  async setYaml(text: string): Promise<void> {
    if (this.state.busy) return
    const request = ++this.yamlRequest
    const view = this.viewRequest
    this.set({ yamlText: text, parsingYaml: true })
    const draft = this.state.draft
    if (draft === undefined) return
    const api = this.api
    try {
      const parsed = await api.parseYaml(draft.id, text)
      if (request !== this.yamlRequest || view !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ ...(parsed.validation.ok ? { draft: parsed.definition } : {}), yamlError: undefined, parsingYaml: false, validation: parsed.validation, diff: undefined })
    } catch (error) {
      if (request !== this.yamlRequest || view !== this.viewRequest || this.apiProvider?.() !== api) return
      this.set({ yamlError: messageOf(error), parsingYaml: false, validation: undefined })
    }
  }

  /** Validate and diff the current draft before saving. */
  async prepareSave(): Promise<boolean> {
    const { draft, detail } = this.state
    if (draft === undefined || this.state.busy || this.state.parsingYaml) return false
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

  /** Commit the editing dialog's draft, keeping it open on a refused save. */
  async save(): Promise<boolean> {
    const { draft, draftRevision, view } = this.state
    if (!draft || this.state.busy || this.state.parsingYaml || this.state.yamlError || this.state.compositionError !== undefined || this.state.validation?.ok === false) return false
    const api = this.api
    const request = this.viewRequest
    this.set({ busy: true, notice: undefined })
    try {
      const result = await api.save({ definition: draft,
        ...(draftRevision === undefined ? {} : { expectedRevision: draftRevision }) })
      if (this.apiProvider?.() !== api || request !== this.viewRequest) return false
      if (!result.ok || !result.applied) {
        this.set({ busy: false, notice: { level: 'error', message: result.errors.map(formatIssue).join('\n') || '保存未完成，请重试。' } })
        return false
      }
      const refreshed = await this.refresh()
      const refreshFailure = this.state.notice
      if (this.apiProvider?.() !== api || request !== this.viewRequest) return false
      if (view.kind === 'editor') await this.openEditor(view.id, view.mode)
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false })
      if (!refreshed) {
        this.notice({ level: 'warning', message: `保存已完成，但列表刷新失败。关闭弹窗后点击刷新重试。${refreshFailure?.message ?? ''}` })
        return false
      }
      return this.state.draft?.id === draft.id
    } catch (error) {
      if (this.apiProvider?.() !== api || request !== this.viewRequest) return false
      this.set({ busy: false, notice: describeFailure(error) })
      return false
    }
  }

  // -------------------------------------------------------------- commands

  /** Toggle only the selected preset and report failures beside its row. */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    if (this.state.busy || this.state.mount.status !== 'ready' || !this.apiProvider) return false
    const api = this.api
    const localAction = { kind: 'toggle' as const, id }
    this.set({ busy: true, togglingId: id, notice: undefined })
    try {
      const result = await api.setEnabled({ id, enabled })
      if (this.apiProvider?.() !== api) return false
      if (!result.ok || !result.applied) throw new Error(result.errors.map(formatIssue).join('\n') || '启停状态未能更新，请重试。')
      const refreshed = await this.refresh()
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, togglingId: undefined,
        notice: refreshed ? undefined : { localAction, level: 'warning', message: '启停状态已保存，但列表刷新失败，请点击刷新。' },
      })
      return true
    } catch (error) {
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, togglingId: undefined, notice: { ...describeFailure(error), localAction } })
      return false
    }
  }

  /** Copy the selected card without a redundant source/ID form. */
  async duplicate(source: PresetSummary, copySuffix: string): Promise<boolean> {
    if (this.state.busy || this.state.mount.status !== 'ready') return false
    const api = this.api
    const name = `${source.name || source.id} ${copySuffix}`

    this.set({ busy: true, notice: undefined })
    try {
      const result = await api.clone({
        sourceId: source.id, name,
        ...(source.description === undefined ? {} : { description: source.description }),
      })
      if (this.apiProvider?.() !== api) return false
      if (!result.ok || !result.applied) {
        this.set({ busy: false, notice: { localAction: { kind: 'fork', id: source.id },
          level: 'error', title: '派生失败',
          message: result.errors.map(formatIssue).join('\n') || '副本未完成注册，请重试。',
        } })
        return false
      }
      const created = result.preset
      if (created === undefined) throw new Error('副本已提交，但 Host 未返回新预设信息，请刷新列表。')
      const refreshed = await this.refresh()
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false })
      if (!refreshed) {
        this.notice({ localAction: { kind: 'fork', id: source.id }, level: 'warning', message: `已派生为「${created.name ?? created.id}」，列表刷新失败，请点击刷新。` })
        return true
      }
      this.notice({ localAction: { kind: 'fork', id: source.id }, level: 'success', message: `已派生为「${created.name ?? name}」` })
      return true
    } catch (error) {
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, notice: { ...describeFailure(error), localAction: { kind: 'fork', id: source.id } } })
      return false
    }
  }

  /** Export directly to the caller's clipboard without opening another view. */
  async copyConfiguration(id: string, writeText: (text: string) => Promise<void>): Promise<boolean> {
    if (this.state.busy || this.state.mount.status !== 'ready') return false
    const api = this.api
    this.set({ busy: true, notice: undefined })
    try {
      const exported = await api.exportPreset(id)
      if (this.apiProvider?.() !== api) return false
      await writeText(exported.yaml)
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, notice: { localAction: { kind: 'copy', id },
        level: exported.risks.length === 0 ? 'success' : 'warning',
        message: '配置已复制到剪贴板',
        ...(exported.risks.length === 0 ? {} : { details: exported.risks.map(formatIssue) }),
      } })
      return true
    } catch (error) {
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, notice: { localAction: { kind: 'copy', id }, level: 'error', title: '复制配置失败',
        message: `无法复制配置，请检查剪贴板权限后重试。${messageOf(error)}` } })
      return false
    }
  }

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

  /** Validate the current import identity without freezing the editable input. */
  async previewImport(text: string, source: 'share' | 'yaml-file', id?: string): Promise<boolean> {
    if (this.state.busy) return false
    const request = ++this.importRequest
    this.importApproval = undefined
    this.set({ previewingImport: true, notice: undefined })
    let api: PresetManagerApi | undefined
    try {
      api = this.api
      const preview = await api.previewImport({ text, source, ...(id === undefined ? {} : { id }) })
      if (request !== this.importRequest || this.apiProvider?.() !== api) return false
      this.importApproval = { text, source, id: preview.definition.id }
      this.set({ previewingImport: false, preview })
      return true
    } catch (error) {
      if (request !== this.importRequest || (api !== undefined && this.apiProvider?.() !== api)) return false
      this.set({ previewingImport: false, preview: undefined, notice: describeFailure(error) })
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
    const approved = this.importApproval
    const preview = this.state.preview
    if (this.state.busy || this.state.previewingImport || !preview?.validation.ok || !approved ||
      options.text !== approved.text || options.source !== approved.source ||
      (options.id ?? preview.definition.id) !== approved.id ||
      (options.name !== undefined && options.name !== preview.definition.name) || !options.acknowledgedRisks) return false
    const api = this.api
    const request = this.importRequest
    this.set({ busy: true, notice: undefined })
    try {
      await api.importPreset(options)
      if (this.apiProvider?.() !== api) return false
      if (request !== this.importRequest) { this.set({ busy: false }); return false }
      await this.refresh()
      if (this.apiProvider?.() !== api) return false
      if (request !== this.importRequest) { this.set({ busy: false }); return false }
      this.importApproval = undefined
      this.set({ busy: false, preview: undefined, previewingImport: false })
      this.notice({ level: 'success', message: '预设已导入并注册' })
      return true
    } catch (error) {
      if (this.apiProvider?.() !== api) return false
      this.set({ busy: false, ...(request === this.importRequest ? { notice: describeFailure(error) } : {}) })
      return false
    }
  }

  clearPreview(): void {
    this.importRequest += 1
    this.importApproval = undefined
    this.set({ preview: undefined, previewingImport: false, notice: undefined })
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
