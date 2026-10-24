import { parsePluginRows } from '../../domain/preset-model.js'
import type { AgentPresetRegistryLike } from '../adapters/dynamic-preset-registry.js'
import type { AgentPresetDocumentReader } from '../adapters/dsh-preset-source.js'
import type { ValidationIssue } from '../../shared/types.js'
import { deriveBundledPresets } from './derive-presets.js'
import { loadBundledPrompts } from './local-prompts.js'

interface Options {
  readonly registry: AgentPresetRegistryLike & AgentPresetDocumentReader
  readonly managedIds: { has(id: string): boolean }
  /** Loader settlement must be awaited outside the declaring Host row's apply. */
  readonly waitUntilReady?: () => Promise<void>
}

/** Read-only bundled presets have a lifetime separate from the user's repository. */
export class BundledPresetRegistration {
  private readonly owned = new Map<string, () => Promise<void>>()
  private stopped = false
  private startup?: Promise<ValidationIssue[]>
  private disposal?: Promise<void>
  private cancelWait!: () => void
  private readonly cancelled = new Promise<void>((resolve) => { this.cancelWait = resolve })

  constructor(private readonly options: Options) {}

  owns(id: string): boolean { return this.owned.has(id) }

  start(): Promise<ValidationIssue[]> {
    return this.startup ??= this.initialize().catch((error: unknown) => this.stopped ? [] : [{
      code: 'bundled.registration-failed',
      message: '插件自带预设未能注册；自定义预设不受影响',
      detail: error instanceof Error ? error.message : String(error),
    }])
  }

  private async initialize(): Promise<ValidationIssue[]> {
    // Cancellation releases shutdown even if Loader is awaiting this row's
    // disposal. Do not make activation wait on its own Host tree settlement.
    await Promise.race([Promise.resolve().then(() => this.options.waitUntilReady?.()), this.cancelled])
    if (this.stopped) return []
    const { registry, managedIds } = this.options
    const [document, roster, prompts] = await Promise.all([
      registry.readDocument('standard'), registry.list(), loadBundledPrompts(),
    ])
    if (this.stopped) return []
    const standard = roster.find((row) => row.id === 'standard')
    if (standard === undefined || document.agentPreset !== 'standard') throw new Error('DSH Standard is unavailable')
    if (standard.broken !== undefined) throw new Error(`DSH Standard is broken: ${standard.broken}`)
    const definitions = deriveBundledPresets({
      id: 'standard',
      ...(document.name === undefined ? {} : { name: document.name }),
      ...(document.description === undefined ? {} : { description: document.description }),
      ...(standard.order === undefined ? {} : { order: standard.order }),
      plugins: parsePluginRows(document.content),
    }, prompts)
    const occupied = new Set(roster.map((row) => row.id))
    const diagnostics: ValidationIssue[] = []
    for (const definition of definitions) {
      if (this.stopped) break
      if (managedIds.has(definition.id) || occupied.has(definition.id)) {
        diagnostics.push({
          code: 'bundled.id-conflict',
          message: `自带预设「${definition.id}」与现有预设重名，已保留现有预设`,
        })
        continue
      }
      try {
        const dispose = await registry.register(definition)
        if (this.stopped) await dispose()
        else this.owned.set(definition.id, dispose)
      } catch (error) {
        diagnostics.push({
          code: 'bundled.registration-failed',
          message: `自带预设「${definition.id}」注册失败`,
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (!this.stopped) {
      const active = await registry.list()
      for (const row of active) {
        if (!this.owns(row.id) || row.broken === undefined) continue
        diagnostics.push({ code: 'bundled.registration-failed', message: `自带预设「${row.id}」激活异常`, detail: row.broken })
      }
    }
    return this.stopped ? [] : diagnostics
  }

  dispose(): Promise<void> {
    this.stopped = true
    this.cancelWait()
    return this.disposal ??= (async () => {
      await this.startup
      const disposers = [...this.owned.values()].reverse()
      this.owned.clear()
      const settled = await Promise.allSettled(disposers.map((dispose) => dispose()))
      const errors = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (errors.length > 0) throw new AggregateError(errors.map((result) => result.reason), 'could not withdraw bundled presets')
    })()
  }
}
