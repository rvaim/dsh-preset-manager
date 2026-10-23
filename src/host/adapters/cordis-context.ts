/**
 * The slice of the Cordis `Context` this plugin actually uses.
 *
 * `cordis` is a peer of the DSH installation rather than a package a third-party
 * bundle may depend on, so the plugin declares the members it touches. Declaring
 * them — instead of `any` — keeps the plugin typed and documents precisely which
 * framework capabilities it relies on.
 */
export interface CordisContext {
  /** Logger facade. `warn` is the only level this plugin uses. */
  readonly logger?: {
    warn(message: string): void
    info?(message: string): void
    error?(message: string): void
  }
  /**
   * Register a cleanup effect owned by this plugin's fiber.
   *
   * The callback runs on activation and returns its teardown, which Cordis
   * invokes — awaiting it — when the row is disabled, unloaded, or replaced.
   */
  effect(
    execute: () => (() => void | Promise<void>) | void,
    label?: string,
  ): void
  /** Resolve an optional service by key. */
  get(key: string): unknown
  /** Publish a service under a key. */
  provide(name: string, value: unknown): void
}
