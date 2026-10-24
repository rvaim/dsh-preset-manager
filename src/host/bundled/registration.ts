import { cloneDefinition, parsePluginRows } from '../../domain/preset-model.js'
import type { AgentPresetRegistryLike } from '../adapters/dynamic-preset-registry.js'
import type { AgentPresetDocumentReader } from '../adapters/dsh-preset-source.js'
import type {
  BundledPresetRuntime,
  BundledRegistrationOutcome,
} from '../ports/bundled-presets.js'
import type { PresetDefinition, ValidationIssue } from '../../shared/types.js'
import { BUNDLED_PRESETS } from '../../shared/bundled-presets.js'
import { deriveBundledPresets } from './derive-presets.js'
import { loadBundledResources } from './local-prompts.js'

/** The declarations are the single source of truth; never a second hand-kept list. */
const PRESET_IDS: readonly string[] = BUNDLED_PRESETS.map((preset) => preset.id)

interface Options {
  readonly registry: AgentPresetRegistryLike & AgentPresetDocumentReader
  readonly managedIds: { has(id: string): boolean }
  /** Loader settlement must be awaited outside the declaring Host row's apply. */
  readonly waitUntilReady?: () => Promise<void>
  /** Restored enablement; a disabled bundled preset is derived but not published. */
  readonly isDisabled?: (id: string) => Promise<boolean>
}

/** Read-only bundled presets have a lifetime separate from the user's repository. */
export class BundledPresetRegistration implements BundledPresetRuntime {
  private readonly owned = new Map<string, () => Promise<void>>()
  private readonly pending = new Map<string, Promise<BundledRegistrationOutcome>>()
  private readonly definitions = new Map<string, PresetDefinition>()
  private readonly conflicts = new Set<string>()
  private stopped = false
  private startup?: Promise<ValidationIssue[]>
  private disposal?: Promise<void>
  private cancelWait!: () => void
  private readonly cancelled = new Promise<void>((resolve) => { this.cancelWait = resolve })

  constructor(private readonly options: Options) {}

  get ids(): readonly string[] { return PRESET_IDS }

  owns(id: string): boolean { return this.owned.has(id) }
  holds(id: string): boolean { return this.owned.has(id) }
  /** Whether startup found an existing row that prevents publication. */
  conflicted(id: string): boolean { return this.conflicts.has(id) }
  definition(id: string): PresetDefinition | undefined {
    const definition = this.definitions.get(id)
    return definition === undefined ? undefined : cloneDefinition(definition)
  }

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
    const [document, roster, resources] = await Promise.all([
      registry.readDocument('standard'), registry.list(), loadBundledResources(),
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
    }, resources.prompts).concat(resources.definitions)
    for (const definition of definitions) this.definitions.set(definition.id, cloneDefinition(definition))
    const occupied = new Set(roster.map((row) => row.id))
    const diagnostics: ValidationIssue[] = []
    const disabled = new Set<string>()
    for (const definition of definitions) {
      try {
        if (await this.options.isDisabled?.(definition.id) === true) disabled.add(definition.id)
      } catch (error) {
        diagnostics.push({
          code: 'bundled.enablement-unreadable',
          message: `自带预设「${definition.id}」的启停状态无法读取，本次保持停用`,
          detail: error instanceof Error ? error.message : String(error),
        })
        disabled.add(definition.id)
      }
    }
    for (const definition of definitions) {
      if (this.stopped) break
      if (managedIds.has(definition.id) || occupied.has(definition.id)) {
        this.conflicts.add(definition.id)
        diagnostics.push({
          code: 'bundled.id-conflict',
          message: `自带预设「${definition.id}」与现有预设重名，已保留现有预设`,
        })
        continue
      }
      this.conflicts.delete(definition.id)
      if (disabled.has(definition.id)) continue
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

  async setRegistered(id: string, enabled: boolean): Promise<BundledRegistrationOutcome> {
    // A toggle that arrives while Loader/Standard discovery is still running
    // must observe the settled startup state; otherwise startup could publish
    // a preset after the caller successfully persisted "disabled".
    await this.start()
    const pending = this.pending.get(id)
    if (pending !== undefined) return pending
    const run = this.setRegisteredNow(id, enabled)
    this.pending.set(id, run)
    try {
      return await run
    } finally {
      this.pending.delete(id)
    }
  }

  private async setRegisteredNow(id: string, enabled: boolean): Promise<BundledRegistrationOutcome> {
    if (!PRESET_IDS.includes(id)) {
      return { healthy: false, broken: `unknown bundled preset ${id}` }
    }
    if (this.stopped) {
      return { healthy: false, broken: 'preset manager is shutting down' }
    }
    if (!enabled) {
      const dispose = this.owned.get(id)
      if (dispose === undefined) {
        try {
          const occupied = (await this.options.registry.list()).some((row) => row.id === id)
          if (occupied) {
            this.conflicts.add(id)
            return { healthy: false, conflict: true, broken: `preset ${id} is owned by another declaration` }
          }
          this.conflicts.delete(id)
          return { healthy: true }
        } catch (error) {
          return { healthy: false, broken: describe(error) }
        }
      }
      try {
        await dispose()
        this.owned.delete(id)
        return { healthy: true }
      } catch (error) {
        return { healthy: false, broken: describe(error) }
      }
    }

    if (this.owned.has(id)) return { healthy: true }
    if (this.options.managedIds.has(id)) {
      return { healthy: false, conflict: true, broken: `preset ${id} is owned by another declaration` }
    }
    const definition = this.definitions.get(id)
    if (definition === undefined) {
      return { healthy: false, broken: `bundled preset ${id} is not ready` }
    }
    let dispose: (() => Promise<void>) | undefined
    try {
      const roster = await this.options.registry.list()
      if (roster.some((row) => row.id === id)) {
        return { healthy: false, conflict: true, broken: `preset ${id} is owned by another declaration` }
      }
      dispose = await this.options.registry.register(definition)
      if (this.stopped) {
        await dispose()
        return { healthy: false, broken: 'preset manager is shutting down' }
      }
      this.owned.set(id, dispose)
      this.conflicts.delete(id)
      const rows = await this.options.registry.list()
      const row = rows.find((candidate) => candidate.id === id)
      if (row === undefined || row.broken !== undefined) {
        this.owned.delete(id)
        await dispose()
        return row === undefined
          ? { healthy: false, broken: `preset ${id} was not published` }
          : { healthy: false, broken: row.broken }
      }
      return { healthy: true }
    } catch (error) {
      if (dispose !== undefined) {
        if (this.owned.get(id) === dispose) this.owned.delete(id)
        await dispose().catch(() => undefined)
      }
      if (String(describe(error)).includes('Duplicate')) this.conflicts.add(id)
      return { healthy: false, broken: describe(error) }
    }
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
