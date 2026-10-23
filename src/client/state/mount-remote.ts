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
import type { PresetManagerRemoteService } from '../api/remote-api.js'

/** What the page needs to know about the mount. */
export interface MountState {
  readonly status: 'mounting' | 'ready' | 'failed'
  /** The mount failure, verbatim, when status is `failed`. */
  readonly error?: string
  /** The namespace service once mounted. */
  readonly service?: PresetManagerRemoteService
}

export interface RemoteHost {
  readonly remote: {
    $mount(contribution: unknown): Promise<() => Promise<void>>
  }
  readonly logger?: { warn(message: string): void }
}

/**
 * Mount the descriptors and report exactly what happened.
 *
 * A mount that resolves but installs no namespace is treated as a failure: that
 * combination means the contribution was accepted and then not exposed, which is
 * a real defect and must not be reported as ready.
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
      const mounted = (host.remote as unknown as {
        presetManager?: PresetManagerRemoteService
      }).presetManager
      if (mounted === undefined) {
        settle({
          status: 'failed',
          error:
            '$mount 已成功返回，但 ctx.remote.presetManager 未被安装。' +
            '这通常意味着 descriptor 未通过 gateway 校验。',
        })
        return
      }
      settle({ status: 'ready', service: mounted })
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
