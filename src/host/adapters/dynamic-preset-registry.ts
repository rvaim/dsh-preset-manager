/**
 * The runtime adapter: the only place that talks to `ctx.agentPresets`.
 *
 * Three properties of the installed registry drive this implementation, and
 * each one is handled explicitly rather than assumed away:
 *
 *  - `register()` **throws** on a duplicate id. Replacement is therefore
 *    unregister-then-register; an upsert does not exist.
 *  - `register()` **resolves even when activation failed**: the failure appears
 *    on the roster row as `broken`, and `list()` re-audits live trees. A caller
 *    that treats a resolved promise as success reports a lie, so every
 *    registration is followed by a roster read.
 *  - The returned disposer is an idempotent async function owned by the
 *    declaring plugin. It is the only way to withdraw a preset, so this adapter
 *    holds every handle and guarantees each one is called exactly once.
 *
 * Disposal is racing-safe. A registration that settles after `dispose()` began
 * is unregistered immediately instead of being recorded, so a plugin disabled
 * mid-startup leaves no orphan preset behind.
 */
import type {
  PresetDefinition,
  PresetHealth,
  PresetSummary,
} from '../../shared/types.js'
import { cloneDefinition, countPlugins } from '../../domain/preset-model.js'
import type {
  PresetRuntime,
  RegistrationOutcome,
} from '../ports/preset-runtime.js'

/**
 * The slice of the DSH registry service this adapter needs.
 *
 * Declared structurally so the adapter compiles and tests without importing
 * DSH internals, and so the exact methods relied upon are visible in one place.
 */
export interface AgentPresetRegistryLike {
  register(definition: PresetDefinition): Promise<() => Promise<void>>
  list(): Promise<
    {
      id: string
      name?: string
      description?: string
      order?: number
      broken?: string
    }[]
  >
}

/** How the manager recognises a preset it owns. */
export interface ManagedIdRegistry {
  has(id: string): boolean
}

export interface DynamicRegistryOptions {
  readonly registry: AgentPresetRegistryLike
  /** Consulted when classifying a roster row's ownership. */
  readonly managedIds: ManagedIdRegistry
  /**
   * Whether a roster id is declared by a shipped bundle rather than by another
   * plugin. Supplied by the Host wiring, which can see the composition.
   */
  readonly isShippedPreset?: (id: string) => boolean
  readonly warn?: (message: string) => void
}

interface Held {
  readonly dispose: () => Promise<void>
  /**
   * The definition this adapter registered.
   *
   * Retained only for compensation on a failed replacement: the adapter is the
   * one that registered it, so restoring it needs no other authority. It is
   * not a source of truth — the repository is — and it is dropped on withdraw.
   */
  readonly definition: PresetDefinition
  disposed: boolean
}

export class DynamicPresetRegistryAdapter implements PresetRuntime {
  private readonly registry: AgentPresetRegistryLike
  private readonly managedIds: ManagedIdRegistry
  private readonly isShippedPreset: (id: string) => boolean
  private readonly warn: (message: string) => void

  /** Live registrations this adapter owns, keyed by preset id. */
  private readonly held = new Map<string, Held>()
  /** Serializes every register/unregister so two versions never coexist. */
  private chain: Promise<unknown> = Promise.resolve()
  /** Set once disposal starts; every later mutation is refused. */
  private disposing = false
  private disposePromise: Promise<void> | undefined

  constructor(options: DynamicRegistryOptions) {
    this.registry = options.registry
    this.managedIds = options.managedIds
    this.isShippedPreset = options.isShippedPreset ?? (() => false)
    this.warn = options.warn ?? (() => {})
  }

  // ----------------------------------------------------------- registration

  async register(definition: PresetDefinition): Promise<RegistrationOutcome> {
    return this.serialize(async () => {
      if (this.held.has(definition.id)) {
        // A second registration of one id is what the registry refuses, so the
        // old handle is withdrawn first. `replace` exists for the intended path;
        // this guard keeps a mistaken `register` from corrupting state.
        await this.withdraw(definition.id)
      }
      return this.registerNow(definition)
    })
  }

  /**
   * Register without the serialization wrapper.
   *
   * Called only from a path that already holds the chain, which is what keeps
   * the rollback inside `replace` from deadlocking on its own lock.
   */
  private async registerNow(definition: PresetDefinition): Promise<RegistrationOutcome> {
    const dispose = await this.registry.register(definition)

    if (this.disposing) {
      // Disposal began while this registration was in flight. Withdraw it at
      // once so the preset cannot outlive the plugin.
      await this.disposeHandle(dispose)
      throw new Error('preset runtime was shut down during registration')
    }

    this.held.set(definition.id, {
      dispose,
      definition: cloneDefinition(definition),
      disposed: false,
    })
    const broken = await this.readBroken(definition.id)
    return {
      id: definition.id,
      healthy: broken === undefined,
      ...(broken === undefined ? {} : { broken }),
    }
  }

  /**
   * Replace a registered preset.
   *
   * The registry has no replace operation, so this is unregister-then-register
   * with compensation. It is deliberately not described as atomic: between the
   * two calls the preset does not exist, and a new session started in that
   * window would not see it.
   *
   * Compensation restores the previous definition when the new one fails to
   * register or activates broken. Restoring a broken-but-published new version
   * matters as much as a thrown error: a preset the user cannot use is worse
   * than the one that worked.
   */
  async replace(definition: PresetDefinition): Promise<RegistrationOutcome> {
    return this.serialize(async () => {
      const previous = this.held.get(definition.id)
      const previousDefinition = previous?.definition

      await this.withdraw(definition.id)

      let outcome: RegistrationOutcome
      try {
        outcome = await this.registerNow(definition)
      } catch (error) {
        await this.restore(definition.id, previousDefinition, error)
        throw error
      }

      if (!outcome.healthy && previousDefinition !== undefined) {
        const diagnostic = outcome.broken ?? 'activation failed'
        // The new revision published but cannot compose a session. Withdraw it
        // and put back the version that worked, then report the failure.
        await this.withdraw(definition.id)
        await this.restore(definition.id, previousDefinition, diagnostic)
        return outcome
      }

      return outcome
    })
  }

  /** Put a previous definition back, reporting either outcome honestly. */
  private async restore(
    id: string,
    previous: PresetDefinition | undefined,
    cause: unknown,
  ): Promise<void> {
    if (previous === undefined) return
    try {
      const restored = await this.registerNow(previous)
      this.warn(
        restored.healthy
          ? `preset ${id}: new revision failed (${describe(cause)}); previous revision restored`
          : `preset ${id}: new revision failed (${describe(cause)}), and the previous revision is itself broken (${restored.broken ?? 'unknown'})`,
      )
    } catch (restoreError) {
      this.warn(
        `preset ${id}: new revision failed (${describe(cause)}) and the previous revision could not be restored (${describe(restoreError)}); the preset is now unregistered`,
      )
    }
  }

  async unregister(id: string): Promise<void> {
    return this.serialize(async () => {
      await this.withdraw(id)
    })
  }

  /** Unregister one id without taking the lock. Idempotent. */
  private async withdraw(id: string): Promise<void> {
    const entry = this.held.get(id)
    if (entry === undefined) return
    this.held.delete(id)
    await this.disposeHandle(entry.dispose)
  }

  private async disposeHandle(dispose: () => Promise<void>): Promise<void> {
    try {
      await dispose()
    } catch (error) {
      this.warn(`preset disposer failed: ${describe(error)}`)
    }
  }

  // -------------------------------------------------------------- reads

  /** The activation diagnostic of a preset, or undefined when it is healthy. */
  private async readBroken(id: string): Promise<string | undefined> {
    try {
      const rows = await this.registry.list()
      const row = rows.find((candidate) => candidate.id === id)
      if (row === undefined) return `preset ${id} is not published by the registry`
      return row.broken
    } catch (error) {
      // A roster read failure is itself a diagnostic: the preset may be fine,
      // but the manager cannot prove it and must not claim health.
      return `registry roster unreadable: ${describe(error)}`
    }
  }

  async inspect(id: string): Promise<PresetHealth> {
    if (!this.held.has(id)) return 'unchecked'
    const broken = await this.readBroken(id)
    return broken === undefined ? 'healthy' : 'broken'
  }

  holds(id: string): boolean {
    return this.held.has(id)
  }

  heldIds(): readonly string[] {
    return [...this.held.keys()]
  }

  /** The definition this adapter registered for an id, when it holds one. */
  registeredDefinition(id: string): PresetDefinition | undefined {
    const entry = this.held.get(id)
    return entry === undefined ? undefined : cloneDefinition(entry.definition)
  }

  /**
   * Project the registry into the management list.
   *
   * Ownership is decided from evidence rather than from the id alone: a preset
   * this adapter holds is `managed`; one the shipped bundles declare is
   * `builtin`; anything else another plugin registered is `third-party`.
   */
  async roster(): Promise<PresetSummary[]> {
    const rows = await this.registry.list()
    return rows.map((row) => {
      const ownership: PresetSummary['ownership'] = this.held.has(row.id)
        ? 'managed'
        : this.managedIds.has(row.id)
          ? 'managed'
          : this.isShippedPreset(row.id)
            ? 'builtin'
            : 'third-party'
      const registration: PresetSummary['registration'] =
        ownership === 'managed'
          ? this.held.has(row.id)
            ? 'registered'
            : 'not-registered'
          : 'registered'
      return {
        id: row.id,
        ...(row.name === undefined ? {} : { name: row.name }),
        ...(row.description === undefined ? {} : { description: row.description }),
        ...(row.order === undefined ? {} : { order: row.order }),
        ownership,
        registration,
        isDefault: false,
        health: row.broken === undefined ? 'healthy' : 'broken',
        ...(row.broken === undefined ? {} : { broken: row.broken }),
        pluginCount: countPlugins(
          this.held.get(row.id)?.definition.plugins ?? [],
        ),
      } satisfies PresetSummary
    })
  }

  // ------------------------------------------------------------ disposal

  /**
   * Withdraw every registration this adapter holds.
   *
   * Waits for in-flight work so a registration that was already running is
   * either withdrawn by its own path or withdrawn here — never left behind.
   */
  async dispose(): Promise<void> {
    if (this.disposePromise !== undefined) return this.disposePromise
    this.disposing = true
    const run = (async () => {
      // Drain the mutation chain first: an in-flight registration must reach a
      // safe stop before the sweep, or it would re-add an entry after the sweep.
      await this.chain.then(
        () => undefined,
        () => undefined,
      )
      const ids = [...this.held.keys()]
      for (const id of ids) await this.withdraw(id)
    })()
    this.disposePromise = run
    return run
  }

  /** Whether disposal has started, so the application can refuse new work. */
  get isDisposing(): boolean {
    return this.disposing
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    if (this.disposing) {
      return Promise.reject(new Error('preset runtime is shutting down'))
    }
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
