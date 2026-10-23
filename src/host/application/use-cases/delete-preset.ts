/**
 * Delete a preset this plugin owns.
 *
 * Three refusals precede the deletion, because each one is a real way to lose
 * something the user did not mean to lose:
 *
 *  - a preset the manager does not own is not the manager's to delete,
 *  - a preset DSH currently selects as its default is refused unless the risk is
 *    acknowledged, since the manager may not repair DSH's own setting,
 *  - the definition is archived to history before the current file is removed,
 *    so the deletion stays recoverable.
 */
import type { MutationResult } from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import type { ApplicationDeps } from '../deps.js'

export interface DeleteRequest {
  readonly id: string
  /** The user was told the DSH-default consequence and accepted it. */
  readonly acknowledgedDefaultRisk?: boolean
}

export async function deletePreset(
  deps: ApplicationDeps,
  request: DeleteRequest,
): Promise<MutationResult> {
  const stored = await deps.repository.get(request.id)
  if (stored === undefined) {
    throw new ManagerError(
      ManagerErrorCode.presetNotOwned,
      `预设 "${request.id}" 不是本插件管理的预设，无法删除`,
      [
        {
          code: 'preset.ownership',
          message: '内置预设与其他插件注册的预设只能查看和复制，不能修改或删除',
        },
      ],
    )
  }

  const defaultId = await deps.defaultPresetId().catch(() => undefined)
  if (defaultId === request.id && request.acknowledgedDefaultRisk !== true) {
    throw new ManagerError(
      ManagerErrorCode.invalidInput,
      `预设 "${request.id}" 当前是 DSH 的默认预设；删除前需要确认风险`,
      [
        {
          code: 'preset.default-risk',
          message:
            '本插件不允许修改 DSH 自身的默认预设设置。删除后新会话可能引用一个已不存在的预设，需要你在 DSH 设置中改回内置预设。',
        },
      ],
    )
  }

  // Withdraw from the runtime first: a failure here must not leave the file
  // gone while the registry still publishes the preset.
  await deps.registrations.unregister(request.id)
  await deps.repository.delete(request.id)

  return {
    ok: true,
    applied: true,
    errors: [],
    warnings: [
      {
        code: 'preset.deleted',
        message: '预设已删除，最后一份配置保留在历史版本中，可随时恢复',
      },
    ],
  }
}
