/**
 * The Remote namespace mount, with the failure made visible.
 *
 * `ctx.remote.$mount()` installs the `presetManager` namespace the page calls.
 * It can fail for reasons the page cannot guess — a descriptor the gateway
 * rejects, a namespace that already exists, a transport that is not up yet — and
 * a silent `.catch()` turns all of them into the same useless screen.
 *
 * This module keeps the last failure as text so the page can show the actual
 * reason instead of "not ready", which is the difference between a bug report
 * and a dead end.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ManagerSnapshot } from '../../shared/types.js'
import type { PresetManagerRemoteService } from '../api/remote-api.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    'remote.presetManager': PresetManagerRemoteService
  }
}

/** What the page needs to know about the mount. */
export interface MountState {
  readonly status: 'mounting' | 'ready' | 'failed'
  /** The mount failure, verbatim, when status is `failed`. */
  readonly error?: string
  /** The namespace service once mounted. */
  readonly service?: PresetManagerRemoteService
  readonly snapshot?: ManagerSnapshot
  readonly retry?: () => void
}

export interface RemoteHost extends Pick<Context, 'inject'> {
  readonly remote: {
    $mount(contribution: unknown): Promise<() => Promise<void>>
  }
  readonly logger?: { warn(message: string): void }
}

/**
 * Mount the descriptors and report exactly what happened.
 *
 * The owner mounts descriptors before creating the namespace consumer. The
 * consumer is a child fiber with its own declared dependency; declaring that
 * dependency on the owner itself would prevent the mount from ever starting.
 *
 * @param host - the Client context providing `remote` and a logger.
 * @param contribution - the descriptor set this package owns.
 * @param onChange - called with every state change, including the final one.
 * @param isCancelled - lets a torn-down plugin ignore a late settlement.
 */
export function mountRemoteNamespace(
  host: RemoteHost,
  contribution: unknown,
  onChange: (state: MountState) => void,
  isCancelled: () => boolean,
): void {
  onChange({ status: 'mounting' })

  const settle = (state: MountState): void => {
    if (isCancelled()) return
    if (state.status === 'failed') {
      // Log as well as report: the page may not be open when this happens, and
      // the browser console is where a developer looks first.
      host.logger?.warn(`dsh-preset-manager: ${state.error ?? 'mount failed'}`)
    }
    onChange(state)
  }

  void host.remote
    .$mount(contribution)
    .then(() => {
      if (isCancelled()) return
      // `remote` and `remote.presetManager` are independent Cordis services.
      // The owner mounts the namespace; only a child that declares the new
      // dependency may read it. Cordis withdraws/recreates this consumer when
      // the namespace changes, without making the owner wait for its own mount.
      return host.inject(['remote.presetManager'], (ctx) => {
        if (isCancelled()) return
        ctx.effect(() => {
          const service = ctx['remote.presetManager']
          let active = true
          let epoch = 0
          let timer: ReturnType<typeof setTimeout> | undefined
          let wake: (() => void) | undefined
          const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => {
            wake = resolve
            timer = setTimeout(() => { timer = undefined; wake = undefined; resolve() }, milliseconds)
          })
          const start = (): void => {
            if (!active || isCancelled()) return
            const request = ++epoch
            settle({ status: 'mounting' })
            void (async () => {
              // Namespace admission is local. Only a valid Host snapshot proves
              // that the owning Host fiber has finished (re)activation. The
              // exact unavailable fault is expected during a bundle replacement;
              // schema/method/carrier faults are never hidden by this handshake.
              for (let attempt = 0; attempt < 8; attempt += 1) {
                if (!active || isCancelled() || request !== epoch) return
                const result = await service.snapshot()
                if (!active || isCancelled() || request !== epoch) return
                if (result.ok) {
                  settle({ status: 'ready', service, snapshot: result.value })
                  return
                }
                if (result.error.code !== 'gateway/service-unavailable' || attempt === 7) throw result.error
                await pause(Math.min(75 * 2 ** attempt, 750))
              }
            })().catch((error: unknown) => {
              if (active && !isCancelled() && request === epoch) settle({ status: 'failed', error: describeMountError(error), retry: start })
            })
          }
          start()
          return () => {
            active = false
            epoch += 1
            clearTimeout(timer)
            wake?.()
            settle({ status: 'mounting' })
          }
        })
      })
    })
    .catch((error: unknown) => {
      settle({ status: 'failed', error: describeMountError(error) })
    })
}

/**
 * Render a mount failure with the details the gateway attaches.
 *
 * A `RemoteError` carries a `code` and `details`; both matter, because the
 * gateway distinguishes "namespace already exists" from "definition rejected"
 * by code, and the message alone often repeats the endpoint without the cause.
 */
function describeMountError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as {
      message?: unknown
      code?: unknown
      details?: unknown
    }
    const message = typeof record.message === 'string' ? record.message : String(error)
    const code = typeof record.code === 'string' ? record.code : undefined
    const details =
      record.details !== undefined && record.details !== null
        ? safeJson(record.details)
        : undefined
    const parts = [code === undefined ? message : `${code}: ${message}`]
    if (details !== undefined) parts.push(details)
    return parts.join(' — ')
  }
  return String(error)
}

function safeJson(value: unknown): string | undefined {
  try {
    const text = JSON.stringify(value)
    return text === '{}' ? undefined : text
  } catch {
    return undefined
  }
}
