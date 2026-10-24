/**
 * Host entry point: the plugin's composition root.
 *
 * Everything a reader needs to understand this plugin's lifecycle is in this
 * one function:
 *
 *  - it declares `agentPresets` as a hard dependency, so Cordis keeps the plugin
 *    inactive until the registry exists rather than letting it start half-ready;
 *  - it resolves the plugin-owned data directory through DSH's own Home Path API
 *    (`dshHomePath`, provided by app-boot) and never hardcodes a user directory;
 *  - it registers its Remote descriptors so the settings page can reach it;
 *  - it restores stored presets, then publishes the result as diagnostics;
 *  - it registers **one** disposal effect that withdraws every preset, so the
 *    lifetime of a registration is the lifetime of this plugin row.
 *
 * The disposal effect is deliberately the first thing registered and the last
 * thing to run. Cordis unwinds effects in reverse order, which means the
 * shutdown gate is already closed by the time any other cleanup runs, and no
 * mutation can start while presets are being withdrawn.
 */
import { join } from 'node:path'
import type { ValidationIssue } from '../shared/types.js'
import type { CordisContext } from './adapters/cordis-context.js'
import { FilePresetRepository } from './adapters/file-preset-repository.js'
import {
  DynamicPresetRegistryAdapter,
  type AgentPresetRegistryLike,
} from './adapters/dynamic-preset-registry.js'
import {
  DshPresetSource,
  type AgentPresetDocumentReader,
} from './adapters/dsh-preset-source.js'
import { RegistrationManager } from './lifecycle/registration-manager.js'
import { restoreStoredPresets } from './lifecycle/startup-restore.js'
import { BundledPresetRegistration } from './bundled/registration.js'
import { PresetManagerService } from './application/preset-manager-service.js'
import type { ApplicationDeps } from './application/deps.js'
import { createRemoteFace } from './remote/preset-manager-remote.js'
import {
  PRESET_MANAGER_CONTRIBUTION,
  PRESET_MANAGER_SERVICE,
} from './remote/descriptors.js'

/** Directory this plugin owns under the Harness home. */
const DATA_DIRECTORY_NAME = 'dsh-preset-manager'

/**
 * Preset ids DSH's own bundles declare.
 *
 * Used only to label a preset as `builtin` in the UI. The list is a labelling
 * input, not a gate: a new shipped preset the manager has never heard of is
 * still read-only, because read-only is decided by ownership of the file, not by
 * membership here.
 */
const SHIPPED_PRESET_IDS: readonly string[] = ['standard', 'ptc', 'minimal', 'cordis']

/** Services this plugin cannot work without. */
export const inject = ['agentPresets']

/** The Cordis service keys this plugin reads optionally. */
interface HostServices {
  get(key: string): unknown
}

export interface PresetManagerConfig {
  /**
   * Skip startup restore, for diagnosing a preset that prevents a clean start.
   *
   * The files are left untouched; only registration is skipped.
   */
  readonly skipRestore?: boolean
}

/**
 * Activate the plugin.
 *
 * The function returns after the restore has settled, so the settings page never
 * observes a half-populated manager. A restore failure is captured as a
 * diagnostic rather than thrown: DSH must finish starting even when one custom
 * preset is unusable.
 */
export async function apply(ctx: CordisContext, config: PresetManagerConfig = {}): Promise<void> {
  const services = ctx as unknown as HostServices & CordisContext

  const homePath = resolveHomePath(services)
  const directory = join(homePath, DATA_DIRECTORY_NAME)

  const repository = new FilePresetRepository({
    directory,
    warn: (message) => ctx.logger?.warn?.(message) ?? undefined,
  })

  const registry = (ctx as unknown as {
    agentPresets: AgentPresetRegistryLike & AgentPresetDocumentReader
  }).agentPresets

  const managedIds = new Set<string>()
  const managedIdRegistry = {
    has: (id: string): boolean => managedIds.has(id),
  }
  const loader = services.get('loader') as { await(): Promise<void> } | undefined
  const bundled = new BundledPresetRegistration({
    registry,
    managedIds: managedIdRegistry,
    waitUntilReady: () => loader?.await() ?? Promise.resolve(),
  })

  const isShippedPreset = (id: string): boolean => SHIPPED_PRESET_IDS.includes(id) || bundled.owns(id)

  const runtime = new DynamicPresetRegistryAdapter({
    registry,
    managedIds: managedIdRegistry,
    isShippedPreset,
    warn: (message) => ctx.logger?.warn?.(message) ?? undefined,
  })

  const registrations = new RegistrationManager({
    runtime,
    warn: (message) => ctx.logger?.warn?.(message) ?? undefined,
  })

  const source = new DshPresetSource({
    reader: registry,
    managedIds: managedIdRegistry,
    isShippedPreset,
    defaultId: async () => readDefaultPresetId(services),
  })

  const deps: ApplicationDeps = {
    repository,
    source,
    registrations,
    resolveModule: createModuleResolver(services),
    defaultPresetId: async () => readDefaultPresetId(services),
    isShippedPreset,
    warn: (message) => ctx.logger?.warn?.(message) ?? undefined,
    now: Date.now,
  }

  const service = new PresetManagerService(deps)

  // Expose the Host face so the Remote descriptors can resolve it by key, and
  // so another Host plugin could call the same application service directly.
  const face = createRemoteFace(service)
  provide(services, PRESET_MANAGER_SERVICE, face)

  registerRemoteDescriptors(services, ctx)

  // ---- disposal: registered once, covering every registration this plugin owns
  ctx.effect(() => {
    return () => shutdown(service, registrations, services, bundled)
  }, 'dsh-preset-manager: preset registrations')

  // ---- startup restore
  const diagnostics: ValidationIssue[] = []
  const startBundled = (): void => {
    service.waitForStartup(bundled.start().then((issues) => {
      if (service.currentPhase !== 'stopped') service.markReady([...diagnostics, ...issues])
    }))
  }

  if (config.skipRestore === true) {
    diagnostics.push({
      code: 'startup.skipped',
      message: '已按配置跳过启动恢复；磁盘上的预设没有被删除，本次启动不会注册它们',
    })
    service.markReady(diagnostics)
    await populateManagedIds(repository, managedIds)
    startBundled()
    return
  }

  try {
    await repository.ensure()
    await populateManagedIds(repository, managedIds)
    const outcome = await restoreStoredPresets({
      repository,
      registrations,
      foreignIds: async () => {
        const known = await source.knownIds()
        const map = new Map<string, string>()
        for (const [id, ownership] of known) {
          if (managedIds.has(id)) continue
          map.set(id, ownership === 'builtin' ? 'DSH 内置' : '第三方插件')
        }
        return map
      },
    })
    diagnostics.push(...outcome.diagnostics)
  } catch (error) {
    diagnostics.push({
      code: 'startup.failed',
      message: '启动恢复失败，本次启动没有注册任何自定义预设；磁盘文件未被修改',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  service.markReady(diagnostics)
  startBundled()
}

/**
 * Withdraw everything and release the Host face.
 *
 * Order matters: the gate closes first (so no new mutation can start), then the
 * in-flight work drains, then presets are withdrawn, and only then is the
 * service removed. Cordis may run this more than once during an HMR cycle, so
 * every step is idempotent.
 */
async function shutdown(
  service: PresetManagerService,
  registrations: RegistrationManager,
  services: HostServices,
  bundled: BundledPresetRegistration,
): Promise<void> {
  service.markStopped()
  registrations.beginShutdown()
  try {
    await service.quiesce()
  } catch {
    /* a queued mutation's failure is already reported to its caller */
  }
  try {
    try {
      await bundled.dispose()
    } finally {
      await registrations.shutdown()
    }
  } finally {
    remove(services, PRESET_MANAGER_SERVICE)
  }
}

/**
 * Resolve the Harness home through DSH's own API.
 *
 * `dshHomePath` is published as a Host function by app-boot, and it honours
 * `$DSH_HOME` and the platform default exactly as the rest of DSH does. Falling
 * back to a hardcoded `~/.dsh` is refused on purpose: writing to a directory the
 * running Harness does not consider its home would put user presets somewhere
 * nothing else looks.
 */
function resolveHomePath(services: HostServices): string {
  const homePath = services.get('dshHomePath')
  if (typeof homePath === 'function') {
    const resolved = (homePath as (...segments: string[]) => string)()
    if (typeof resolved === 'string' && resolved !== '') return resolved
  }
  const home = services.get('dshHome')
  if (typeof home === 'string' && home !== '') return home
  throw new Error(
    'dsh-preset-manager: 无法解析 DSH home 路径（dshHomePath 不可用），为避免把预设写到错误位置，已拒绝启动',
  )
}

/**
 * Read DSH's selected default preset.
 *
 * Read-only by design: DSH persists that choice in its own settings, and this
 * plugin must never write it. A missing reader is not an error — the UI simply
 * cannot mark a default.
 */
async function readDefaultPresetId(services: HostServices): Promise<string | undefined> {
  const settings = services.get('settings') as
    | { describe?: (options?: unknown) => { ns?: string; value?: unknown }[] }
    | undefined
  if (settings?.describe === undefined) return undefined
  try {
    const described = settings.describe()
    for (const entry of described) {
      const value = entry.value
      if (typeof value !== 'object' || value === null) continue
      const candidate = value as { selectedDefault?: unknown; default?: unknown }
      if (typeof candidate.selectedDefault === 'string' && candidate.selectedDefault !== '') {
        return candidate.selectedDefault
      }
      if (typeof candidate.default === 'string' && candidate.default !== '') {
        return candidate.default
      }
    }
  } catch {
    // A descriptor read failure only costs the default marker.
  }
  return undefined
}

/**
 * Resolve whether a module is available, without importing it.
 *
 * `createRequire` against the running DSH anchor answers exactly what the Loader
 * would resolve, and importing a preset's plugin merely to test availability
 * would execute third-party code from an unconfirmed import.
 */
function createModuleResolver(services: HostServices): (moduleName: string) => boolean {
  const requireFn = services.get('require')
  if (typeof requireFn === 'function') {
    const resolve = (requireFn as { resolve?: (id: string) => string }).resolve
    if (typeof resolve === 'function') {
      return (moduleName: string): boolean => {
        try {
          resolve(moduleName)
          return true
        } catch {
          return false
        }
      }
    }
  }
  // Without a resolver the check is reported as "unknown", not as "missing": a
  // false "missing" would block a legitimate import.
  return () => true
}

/** Publish the Host face under its service key. */
function provide(services: HostServices, key: string, value: unknown): void {
  const context = services as unknown as {
    provide?: (name: string, value: unknown) => void
    set?: (name: string, value: unknown) => void
  }
  if (typeof context.provide === 'function') {
    context.provide(key, value)
    return
  }
  if (typeof context.set === 'function') context.set(key, value)
}

/** Withdraw the Host face, tolerating an already-removed service. */
function remove(services: HostServices, key: string): void {
  const context = services as unknown as { set?: (name: string, value: unknown) => void }
  try {
    if (typeof context.set === 'function') context.set(key, undefined)
  } catch {
    /* already gone */
  }
}

/** Register the Remote descriptors that expose the Host face to the Client. */
function registerRemoteDescriptors(services: HostServices, ctx: CordisContext): void {
  const typert = services.get('typert') as
    | { register?: (contribution: unknown) => () => Promise<void> }
    | undefined
  if (typert?.register === undefined) {
    ctx.logger?.warn?.(
      'dsh-preset-manager: typert 服务不可用，设置页将无法调用 Host 接口',
    )
    return
  }
  typert.register(PRESET_MANAGER_CONTRIBUTION)
}

/** Populate the ownership set from the store, before anything is registered. */
async function populateManagedIds(
  repository: FilePresetRepository,
  target: Set<string>,
): Promise<void> {
  target.clear()
  for (const entry of await repository.list()) target.add(entry.definition.id)
}
