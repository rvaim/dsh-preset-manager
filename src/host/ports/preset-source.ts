/**
 * Port: reading presets that currently exist in the DSH runtime.
 *
 * This is the read side of the runtime, split from {@link PresetRuntime}'s
 * write side so that copying a built-in preset requires no write capability at
 * all, and so an adapter can supply reads without owning registration.
 *
 * Implementations must never mutate a preset they return: the caller treats
 * the result as a snapshot of someone else's declaration.
 */
import type { PresetDefinition, PresetSummary } from '../../shared/types.js'

/** What the manager can learn about a preset it does not own. */
export interface SourcePreset {
  readonly summary: PresetSummary
  readonly definition: PresetDefinition
}

export interface PresetSource {
  /** Every preset the runtime currently publishes, including broken ones. */
  list(): Promise<PresetSummary[]>
  /** One preset's full definition, or undefined when it does not exist. */
  read(id: string): Promise<SourcePreset | undefined>
  /** Ids currently published, with the party that owns each one. */
  knownIds(): Promise<ReadonlyMap<string, 'managed' | 'builtin' | 'third-party'>>
}
