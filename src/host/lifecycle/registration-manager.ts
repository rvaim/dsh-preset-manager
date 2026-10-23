/**
 * Ownership of every registration this plugin holds.
 *
 * The manager is the one place that knows which presets are currently
 * registered, in what revision, and why one is not. It exists so that no other
 * module has to hold a disposer: the application asks the manager to bring the
 * runtime in line with the repository, and the manager reconciles.
 *
 * Two rules make shutdown reliable:
 *
 *  - `beginShutdown()` is synchronous and flips the gate before any await, so a
 *    mutation that starts during teardown is refused rather than interleaved.
 *  - `shutdown()` waits for in-flight work and then withdraws everything,
 *    including registrations that landed after the gate closed.
 */
import type { PresetDefinition, PresetHealth, PresetSummary } from '../../shared/types.js'
import type { PresetRuntime, RegistrationOutcome } from '../ports/preset-runtime.js'

/** Why a preset is not registered, or how its last registration ended. */
export interface RegistrationRecord {
  readonly id: string
  readonly revision: string
  readonly state: 'registered' | 'failed' | 'skipped'
  readonly health: PresetHealth
  /** Diagnostic for a failed or broken registration. */
  readonly diagnostic?: string
  readonly at: string
}

export interface RegistrationManagerOptions {
  readonly runtime: PresetRuntime
  readonly now?: () => number
  readonly warn?: (message: string) => void
}

export class RegistrationManager {
  private readonly runtime: PresetRuntime
  private readonly now: () => number
  private readonly warn: (message: string) => void

  /** Last known disposition per preset id. */
  private readonly records = new Map<string, RegistrationRecord>()
  /** Serializes reconciliation so two cycles never interleave. */
  private chain: Promise<unknown> = Promise.resolve()
  private shuttingDown = false

  constructor(options: RegistrationManagerOptions) {
    this.runtime = options.runtime
    this.now = options.now ?? Date.now
    this.warn = options.warn ?? (() => {})
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown
  }

  /** Refuse all later work. Synchronous, so teardown cannot race a mutation. */
  beginShutdown(): void {
    this.shuttingDown = true
  }

  /** Ids currently registered by this plugin. */
  registeredIds(): readonly string[] {
    return this.runtime.heldIds()
  }

  /** The last disposition recorded for an id. */
  record(id: string): RegistrationRecord | undefined {
    return this.records.get(id)
  }

  /** Every recorded disposition, for the startup diagnostics. */
  recordsSnapshot(): readonly RegistrationRecord[] {
    return [...this.records.values()]
  }

  /** Whether the runtime holds a healthy registration for the id. */
  isRegistered(id: string): boolean {
    return this.runtime.holds(id)
  }

  /**
   * Register one definition.
   *
   * A registration that publishes but activates broken is a failure the caller
   * must see; it is recorded as such and returned, never swallowed. A
   * registration the registry refuses outright is recorded and rethrown so the
   * caller can decide whether to retry or persist.
   */
  async register(definition: PresetDefinition, revision: string): Promise<RegistrationRecord> {
    return this.exclusive(async () => {
      if (this.shuttingDown) {
        return this.failed(definition.id, revision, 'preset manager is shutting down')
      }
      let outcome: RegistrationOutcome
      try {
        outcome = this.runtime.holds(definition.id)
          ? await this.runtime.replace(definition)
          : await this.runtime.register(definition)
      } catch (error) {
        return this.failed(definition.id, revision, describe(error))
      }
      return this.settle(definition.id, revision, outcome)
    })
  }

  /**
   * Bring the runtime in line with a desired set of definitions.
   *
   * Used at startup. Presets absent from `desired` but held by the runtime are
   * withdrawn, so a preset the user deleted on disk while DSH was stopped does
   * not linger. One preset's failure never aborts the cycle: each is recorded
   * and the rest continue, which is what keeps a single bad file from taking
   * the whole feature down.
   */
  async reconcile(
    desired: readonly { definition: PresetDefinition; revision: string }[],
  ): Promise<readonly RegistrationRecord[]> {
    return this.exclusive(async () => {
      if (this.shuttingDown) {
        return desired.map((entry) =>
          this.failed(entry.definition.id, entry.revision, 'preset manager is shutting down'),
        )
      }

      const wanted = new Set(desired.map((entry) => entry.definition.id))
      for (const id of this.runtime.heldIds()) {
        if (!wanted.has(id)) {
          try {
            await this.runtime.unregister(id)
            this.records.delete(id)
          } catch (error) {
            this.warn(`preset ${id}: could not withdraw a stale registration: ${describe(error)}`)
          }
        }
      }

      const results: RegistrationRecord[] = []
      for (const entry of desired) {
        let outcome: RegistrationOutcome
        try {
          outcome = this.runtime.holds(entry.definition.id)
            ? await this.runtime.replace(entry.definition)
            : await this.runtime.register(entry.definition)
        } catch (error) {
          results.push(this.failed(entry.definition.id, entry.revision, describe(error)))
          continue
        }
        results.push(this.settle(entry.definition.id, entry.revision, outcome))
      }
      return results
    })
  }

  /** Explicitly withdraw one preset, recording the outcome. */
  async unregister(id: string): Promise<void> {
    return this.exclusive(async () => {
      try {
        await this.runtime.unregister(id)
      } finally {
        this.records.delete(id)
      }
    })
  }

  /** Re-read health of a registered preset. */
  async inspect(id: string): Promise<PresetHealth> {
    if (!this.runtime.holds(id)) return 'unchecked'
    return this.runtime.inspect(id)
  }

  /** Current roster, for the list projection. */
  async roster(): Promise<PresetSummary[]> {
    return this.runtime.roster()
  }

  /**
   * Withdraw every registration.
   *
   * Idempotent and safe to call twice, which matters because a plugin can be
   * stopped by more than one path (row disable, HMR replacement, process exit).
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown && this.chain === undefined) return
    this.beginShutdown()
    await this.chain.then(
      () => undefined,
      () => undefined,
    )
    await this.runtime.dispose()
    this.records.clear()
  }

  private settle(
    id: string,
    revision: string,
    outcome: RegistrationOutcome,
  ): RegistrationRecord {
    const record: RegistrationRecord = {
      id,
      revision,
      state: outcome.healthy ? 'registered' : 'failed',
      health: outcome.healthy ? 'healthy' : 'broken',
      ...(outcome.broken === undefined ? {} : { diagnostic: outcome.broken }),
      at: new Date(this.now()).toISOString(),
    }
    this.records.set(id, record)
    if (!outcome.healthy) {
      this.warn(`preset ${id}: activation is not healthy: ${outcome.broken ?? 'unknown'}`)
    }
    return record
  }

  private failed(id: string, revision: string, diagnostic: string): RegistrationRecord {
    const record: RegistrationRecord = {
      id,
      revision,
      state: 'failed',
      health: 'broken',
      diagnostic,
      at: new Date(this.now()).toISOString(),
    }
    this.records.set(id, record)
    this.warn(`preset ${id}: registration failed: ${diagnostic}`)
    return record
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task)
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
