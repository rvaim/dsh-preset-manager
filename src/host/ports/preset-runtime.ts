/**
 * Port: registering presets in the live DSH registry.
 *
 * The adapter behind this port owns registration handles and nothing else — it
 * never touches a file. That split is what makes the compensation logic in the
 * application layer meaningful: the repository is the authority on what should
 * be registered, and the runtime is asked to match it.
 *
 * The DSH registry as installed has three properties that shape this port:
 *
 *  - `register()` throws on a duplicate id, so replacement is
 *    unregister-then-register, never upsert.
 *  - `register()` resolves even when activation failed; the failure surfaces on
 *    the returned roster row as `broken`. A caller therefore cannot treat a
 *    resolved promise as health.
 *  - `list()` re-audits live trees, so reading it is the health check.
 */
import type { PresetDefinition, PresetHealth, PresetSummary } from '../../shared/types.js'

/** Result of registering one definition. */
export interface RegistrationOutcome {
  readonly id: string
  /** True only when the definition is published and healthy. */
  readonly healthy: boolean
  /** Activation diagnostic when the row is published but broken. */
  readonly broken?: string
}

export interface PresetRuntime {
  /**
   * Register a definition and report its real state.
   *
   * Resolves with `healthy: false` rather than throwing when the registry
   * published the preset but its activation failed, because that is a state the
   * user must see and can retry.
   *
   * @throws when the registry refuses the registration outright, such as a
   *   duplicate id or an unavailable service.
   */
  register(definition: PresetDefinition): Promise<RegistrationOutcome>

  /**
   * Replace a previously registered preset.
   *
   * Implemented as unregister-then-register with compensation: when the new
   * definition fails, the previous one is registered again before the failure
   * is reported. This is not atomic, and the outcome states that explicitly.
   */
  replace(definition: PresetDefinition): Promise<RegistrationOutcome>

  /** Unregister a preset, tolerating one that is already gone. */
  unregister(id: string): Promise<void>

  /** Current health of a live registration. */
  inspect(id: string): Promise<PresetHealth>

  /** Whether this adapter currently holds a registration for the id. */
  holds(id: string): boolean

  /** Ids this adapter holds. */
  heldIds(): readonly string[]

  /** Read the roster of every preset known to the registry, with health. */
  roster(): Promise<PresetSummary[]>

  /**
   * Stop accepting work and unregister everything this adapter holds.
   *
   * Idempotent, and safe to call while a registration is in flight: a
   * registration that completes after disposal is unregistered immediately, so
   * no orphan survives the plugin.
   */
  dispose(): Promise<void>
}

/** Resolve whether a preset id is the DSH-selected default. */
export interface DefaultPresetReader {
  /** The id DSH would compose for a new session, when known. */
  current(): Promise<string | undefined>
}
