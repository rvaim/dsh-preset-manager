/**
 * Persist and enact one preset enablement change.
 *
 * The runtime is changed first, then the metadata file. If the metadata write
 * fails, the runtime change is compensated so a startup cannot disagree with
 * what the user now sees. Disabling a preset never edits the definition file or
 * removes history.
 */
import type { MutationResult, PresetSummary } from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import { isBundledPreset, type ApplicationDeps } from '../deps.js'
import { listPresets } from './list-presets.js'

export interface SetEnabledRequest {
  readonly id: string
  readonly enabled: boolean
}

export async function setEnabled(
  deps: ApplicationDeps,
  request: SetEnabledRequest,
): Promise<MutationResult> {
  const stored = await deps.repository.get(request.id)
  const bundled = isBundledPreset(deps, request.id)
  const conflict = deps.bundled.ids.includes(request.id) && deps.bundled.conflicted(request.id)
  if (bundled && stored === undefined && deps.bundled.definition(request.id) === undefined) {
    throw new ManagerError(
      ManagerErrorCode.notReady,
      `自带预设 "${request.id}" 尚未完成加载，请稍后重试`,
    )
  }

  if (stored === undefined && !bundled) {
    if (conflict) {
      throw new ManagerError(
        ManagerErrorCode.presetConflict,
        `预设 ID「${request.id}」已被其他声明占用，无法启停自带预设`,
      )
    }
    const known = await deps.source.knownIds().catch(
      () => new Map<string, 'managed' | 'builtin' | 'third-party'>(),
    )
    const ownership = known.get(request.id)
    if (ownership === undefined) {
      throw new ManagerError(ManagerErrorCode.presetNotFound, `找不到预设：${request.id}`)
    }
    throw new ManagerError(
      ManagerErrorCode.presetNotOwned,
      `预设 "${request.id}" 不受本插件控制，无法启停`,
      [{
        code: 'preset.ownership',
        message: 'DSH 官方预设和其他插件注册的预设只能查看或复制。',
      }],
    )
  }
  if (!request.enabled) {
    const defaultId = await deps.defaultPresetId().catch(() => undefined)
    if (defaultId === request.id) {
      throw new ManagerError(
        ManagerErrorCode.invalidInput,
        `预设 "${request.id}" 当前是 DSH 的默认预设；请先在 DSH 设置中更换默认预设`,
        [{
          code: 'preset.default-enabled',
          message: '本插件不会修改 DSH 的默认预设设置。',
        }],
      )
    }
  }

  let wasDisabled: boolean
  try {
    wasDisabled = await deps.repository.isPresetDisabled(request.id)
  } catch (error) {
    throw new ManagerError(
      ManagerErrorCode.storageFailure,
      `无法读取预设 "${request.id}" 的启停状态`,
      [{
        code: 'preset.enablement-storage',
        message: error instanceof Error ? error.message : String(error),
      }],
    )
  }
  if (stored !== undefined) {
    await setManaged(deps, request.id, request.enabled)
  } else {
    await setBundled(deps, request.id, request.enabled)
  }

  try {
    await deps.repository.setPresetDisabled(request.id, !request.enabled)
  } catch (error) {
    await compensate(deps, request.id, stored !== undefined, wasDisabled, error)
    throw new ManagerError(
      ManagerErrorCode.storageFailure,
      `预设 "${request.id}" 的启停状态未能保存，运行状态已恢复`,
      [{
        code: 'preset.enablement-storage',
        message: error instanceof Error ? error.message : String(error),
      }],
    )
  }

  return {
    ok: true,
    applied: true,
    preset: await summaryOf(deps, request.id, request.enabled),
    errors: [],
    warnings: [],
  }
}

async function setManaged(
  deps: ApplicationDeps,
  id: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    await deps.registrations.unregister(id)
    return
  }
  const stored = await deps.repository.get(id)
  if (stored === undefined) {
    throw new ManagerError(ManagerErrorCode.presetNotFound, `找不到预设：${id}`)
  }
  const record = deps.registrations.isRegistered(id)
    ? deps.registrations.record(id) ?? await deps.registrations.register(stored.definition, stored.revision)
    : await deps.registrations.register(stored.definition, stored.revision)
  if (record.state !== 'registered') {
    await deps.registrations.unregister(id).catch(() => undefined)
    throw new ManagerError(
      ManagerErrorCode.activationBroken,
      `预设 "${id}" 无法启用`,
      [{ code: 'preset.activation', message: record.diagnostic ?? '未提供诊断信息' }],
    )
  }
}

async function setBundled(
  deps: ApplicationDeps,
  id: string,
  enabled: boolean,
): Promise<void> {
  const outcome = await deps.bundled.setRegistered(id, enabled)
  if (outcome.conflict) {
    throw new ManagerError(
      ManagerErrorCode.presetConflict,
      `预设 ID「${id}」已被其他声明占用，无法启用自带预设`,
    )
  }
  if (!outcome.healthy) {
    throw new ManagerError(
      enabled ? ManagerErrorCode.activationBroken : ManagerErrorCode.registrationFailed,
      enabled ? `自带预设 "${id}" 无法启用` : `自带预设 "${id}" 无法停用`,
      [{ code: 'preset.activation', message: outcome.broken ?? '未提供诊断信息' }],
    )
  }
}

async function compensate(
  deps: ApplicationDeps,
  id: string,
  managed: boolean,
  wasDisabled: boolean,
  cause: unknown,
): Promise<void> {
  try {
    if (managed) {
      await setManaged(deps, id, !wasDisabled)
    } else {
      await setBundled(deps, id, !wasDisabled)
    }
  } catch (error) {
    deps.warn(
      `preset ${id}: could not restore runtime state after enablement persistence failed: ${
        error instanceof Error ? error.message : String(error)
      } (original: ${cause instanceof Error ? cause.message : String(cause)})`,
    )
  }
}

async function summaryOf(
  deps: ApplicationDeps,
  id: string,
  enabled: boolean,
): Promise<PresetSummary> {
  const snapshot = await listPresets(deps, {
    phase: 'ready',
    diagnostics: [],
    busy: true,
  })
  const found = snapshot.presets.find((row) => row.id === id)
  if (found !== undefined) return found
  return {
    id,
    ownership: deps.bundled.ids.includes(id) ? 'builtin' : 'managed',
    canToggle: true,
    ...(enabled ? {} : { enabled: false }),
    registration: enabled ? 'registered' : 'not-registered',
    isDefault: false,
    health: 'unchecked',
    pluginCount: 0,
  }
}
