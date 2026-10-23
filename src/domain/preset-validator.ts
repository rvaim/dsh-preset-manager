/**
 * Structural validation of a candidate preset definition.
 *
 * Validation is deliberately split from registration: the manager validates
 * first, and only a definition that passes the hard checks reaches the
 * runtime. A definition the runtime would reject is reported here with a
 * precise path instead of surfacing later as an opaque mount failure.
 *
 * Warnings never block a save. They flag things the user should know about
 * but that are legitimate: an empty plugin list, a shadowed display name.
 */
import type {
  PresetDefinition,
  PresetPluginRow,
  ValidationIssue,
  ValidationReport,
} from '../shared/types.js'
import { isGroupRow, rowLabel } from './preset-model.js'

/** Reserved ids the manager must never claim or overwrite. */
const RESERVED_PREFIXES = ['dsh-internal-', 'cordis:']

/** Ids must be usable as a file name stem and a stable registry key. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

/** A plugin module name: a bare package specifier or a relative path. */
const MODULE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/

function issue(
  code: string,
  message: string,
  path?: string,
  detail?: string,
): ValidationIssue {
  return {
    code,
    message,
    ...(path === undefined ? {} : { path }),
    ...(detail === undefined ? {} : { detail }),
  }
}

/** Validate the preset identity itself. */
export function validatePresetId(id: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (typeof id !== 'string' || id.trim() === '') {
    issues.push(issue('preset.id.empty', '预设 ID 不能为空', 'id'))
    return issues
  }
  if (!ID_PATTERN.test(id)) {
    issues.push(
      issue(
        'preset.id.format',
        '预设 ID 只能包含小写字母、数字、点、下划线和连字符，且必须以字母或数字开头（最长 64 字符）',
        'id',
        id,
      ),
    )
  }
  for (const prefix of RESERVED_PREFIXES) {
    if (id.startsWith(prefix)) {
      issues.push(
        issue('preset.id.reserved', `预设 ID 不得以保留前缀 "${prefix}" 开头`, 'id', id),
      )
    }
  }
  return issues
}

/**
 * Built-in Loader specifiers.
 *
 * `cordis:group` and `cordis:include` are resolved by the Loader itself, never
 * by Node, and a real shipped preset uses `cordis:group` for its nested
 * sections. They must therefore be accepted by name and must never be probed
 * for availability — there is no package to find.
 */
const LOADER_BUILTIN_PATTERN = /^cordis:[a-z][a-z0-9-]*$/u

/** Whether a row names a Loader builtin rather than a package. */
export function isLoaderBuiltin(moduleName: string): boolean {
  return LOADER_BUILTIN_PATTERN.test(moduleName)
}

/** Whether a row names a relative or file specifier resolved beside its base. */
export function isRelativeSpecifier(moduleName: string): boolean {
  return moduleName.startsWith('.') || moduleName.startsWith('file:')
}

/**
 * Check one plugin row.
 *
 * A row must name a module. A group row's `config` must be a nested row list,
 * mirroring what the Loader itself accepts — this is the same rule the
 * runtime applies, so a definition passing here does not fail at mount for a
 * structural reason.
 */
function validateRow(row: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    issues.push(issue('preset.row.shape', '插件行必须是映射（含 name 字段）', path))
    return issues
  }
  const candidate = row as PresetPluginRow
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
    issues.push(issue('preset.row.name', '插件行必须声明 name', `${path}.name`))
  } else if (
    !MODULE_PATTERN.test(candidate.name) &&
    !isLoaderBuiltin(candidate.name) &&
    !isRelativeSpecifier(candidate.name)
  ) {
    issues.push(
      issue(
        'preset.row.name-format',
        '插件 name 必须是合法的包名、cordis: 内置名或相对路径',
        `${path}.name`,
        candidate.name,
      ),
    )
  }
  if (candidate.id !== undefined && typeof candidate.id !== 'string') {
    issues.push(issue('preset.row.id', '插件行的 id 必须是字符串', `${path}.id`))
  }
  if (isGroupRow(candidate)) {
    if (!Array.isArray(candidate.config)) {
      issues.push(
        issue(
          'preset.row.group',
          'group 行的 config 必须是插件行列表',
          `${path}.config`,
        ),
      )
      return issues
    }
    ;(candidate.config as unknown[]).forEach((nested, index) => {
      issues.push(...validateRow(nested, `${path}.config[${index}]`))
    })
  }
  return issues
}

/**
 * Validate a complete definition.
 *
 * @param definition - candidate to check.
 * @param options.knownIds - ids already present in the registry, used to
 *   detect a conflict the caller has not resolved. Omit to skip that check.
 * @param options.ownId - the id the caller is replacing, exempted from the
 *   conflict check.
 */
export function validatePreset(
  definition: unknown,
  options: { knownIds?: ReadonlyMap<string, string>; ownId?: string } = {},
): ValidationReport {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    return {
      ok: false,
      errors: [issue('preset.shape', '预设必须是映射对象', undefined)],
      warnings,
    }
  }
  const candidate = definition as PresetDefinition

  errors.push(...validatePresetId(candidate.id))

  for (const field of ['name', 'description'] as const) {
    const value = candidate[field]
    if (value !== undefined && typeof value !== 'string') {
      errors.push(issue(`preset.${field}`, `${field} 必须是字符串`, field))
    }
  }
  if (candidate.order !== undefined && Number.isFinite(candidate.order) === false) {
    errors.push(issue('preset.order', 'order 必须是数字', 'order'))
  }
  if (candidate.name !== undefined && candidate.name.trim() === '') {
    warnings.push(issue('preset.name.empty', '预设名称为空，将回退显示 ID', 'name'))
  }

  if (!Array.isArray(candidate.plugins)) {
    errors.push(issue('preset.plugins', 'plugins 必须是插件行数组', 'plugins'))
  } else {
    if (candidate.plugins.length === 0) {
      warnings.push(
        issue('preset.plugins.empty', '预设没有任何插件行，启动会话时不会有额外能力'),
      )
    }
    candidate.plugins.forEach((row, index) => {
      errors.push(...validateRow(row, `plugins[${index}]`))
    })

    // Duplicate row ids are legal in Cordis but almost always a copy mistake.
    const seen = new Map<string, number>()
    candidate.plugins.forEach((row, index) => {
      if (typeof row?.id !== 'string' || row.id === '') return
      const previous = seen.get(row.id)
      if (previous !== undefined) {
        warnings.push(
          issue(
            'preset.plugins.duplicate-id',
            `插件行 id "${row.id}" 重复出现，加载器会视为两行独立配置`,
            `plugins[${index}].id`,
            `首次出现于 plugins[${previous}]`,
          ),
        )
        return
      }
      seen.set(row.id, index)
    })
  }

  const knownIds = options.knownIds
  if (knownIds !== undefined && typeof candidate.id === 'string') {
    const owner = knownIds.get(candidate.id)
    if (owner !== undefined && candidate.id !== options.ownId) {
      errors.push(
        issue(
          'preset.conflict',
          `预设 ID "${candidate.id}" 已被占用（归属：${owner}），不能覆盖`,
          'id',
        ),
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** Human-readable label of a row, re-exported for callers formatting issues. */
export { rowLabel }
