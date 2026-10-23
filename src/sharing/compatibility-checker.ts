/**
 * Compatibility checks for an imported preset.
 *
 * A share file can name plugin packages this installation does not carry. The
 * manager reports that precisely and never installs anything on the user's
 * behalf: resolving a missing module silently would mean the Harness mounting
 * a package the user never chose.
 *
 * Resolution is answered by the Host adapter, because only the Host knows the
 * real module resolution anchors. This module owns only the interpretation.
 */
import type { PresetDefinition, ValidationIssue } from '../shared/types.js'
import { collectExpressions, flattenPlugins } from '../domain/preset-model.js'
import { isLoaderBuiltin, isRelativeSpecifier } from '../domain/preset-validator.js'

/** Answer whether a module specifier resolves in this installation. */
export type ModuleResolver = (moduleName: string) => boolean

/** Result of the compatibility pass. */
export interface CompatibilityReport {
  readonly issues: readonly ValidationIssue[]
  /** True when a hard blocker makes mounting impossible. */
  readonly blocked: boolean
  readonly missingModules: readonly string[]
  readonly expressionCount: number
}

/**
 * Check every named module of a definition against the resolver.
 *
 * A missing module is a blocker: the DSH registry mounts a preset's rows
 * eagerly, so an unresolvable row rejects the whole activation. Reporting it
 * before registration is what keeps a bad import from appearing as a mystery
 * "broken" preset afterwards.
 */
export function checkCompatibility(
  definition: PresetDefinition,
  resolve: ModuleResolver,
): CompatibilityReport {
  const issues: ValidationIssue[] = []
  const missing = new Set<string>()

  flattenPlugins(definition.plugins).forEach(({ row }, index) => {
    if (typeof row.name !== 'string' || row.name === '') return
    // Loader builtins are resolved by the Loader itself, so there is no package
    // to find. Relative specifiers resolve against the preset's own base URL and
    // are meaningful only to their author, so they are reported separately
    // rather than probed here.
    if (isLoaderBuiltin(row.name)) return
    if (isRelativeSpecifier(row.name)) {
      issues.push({
        code: 'compat.relative-module',
        message: `插件 "${row.name}" 使用相对路径，导入后可能无法解析`,
        path: `plugins[${index}].name`,
      })
      return
    }
    if (resolve(row.name)) return
    missing.add(row.name)
  })

  for (const moduleName of missing) {
    issues.push({
      code: 'compat.missing-module',
      message: `当前 DSH 安装中找不到插件包 "${moduleName}"，导入后该预设将无法激活`,
      detail: moduleName,
    })
  }

  const expressions = collectExpressions(definition)
  for (const item of expressions) {
    issues.push({
      code: 'compat.expression',
      message: '预设包含 !!js 表达式；导入时不会执行，仅在用户确认并激活后由 DSH 加载器求值',
      path: item.path,
      detail: item.expression,
    })
  }

  return {
    issues,
    blocked: missing.size > 0,
    missingModules: [...missing],
    expressionCount: expressions.length,
  }
}
