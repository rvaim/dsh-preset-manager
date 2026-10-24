/**
 * Read and lifecycle access to the presets shipped by this plugin.
 *
 * These definitions are derived from the running DSH Standard preset rather
 * than stored in the user's preset directory. Keeping a source-only face
 * separate from the registration controls lets read/copy/export continue to
 * work while a bundled preset is disabled.
 */
import type { PresetDefinition } from '../../shared/types.js'

export interface BundledPresetSource {
  /** Every id this build can provide, whether currently registered or not. */
  readonly ids: readonly string[]
  /** True while this plugin currently holds the id's registration. */
  holds(id: string): boolean
  /** True when another declaration owns the id, so this plugin must not claim it. */
  conflicted(id: string): boolean
  /** The derived definition, including for a disabled bundled preset. */
  definition(id: string): PresetDefinition | undefined
}

export interface BundledRegistrationOutcome {
  readonly healthy: boolean
  readonly broken?: string
  /** True when another owner appeared for the id before it could be enabled. */
  readonly conflict?: boolean
}

export interface BundledPresetRuntime extends BundledPresetSource {
  /**
   * Publish or withdraw one bundled preset.
   *
   * The caller persists the enabled state only after this succeeds. A broken
   * activation is withdrawn before it is reported, so a failed enable cannot
   * leave a half-active preset behind.
   */
  setRegistered(id: string, enabled: boolean): Promise<BundledRegistrationOutcome>
}
