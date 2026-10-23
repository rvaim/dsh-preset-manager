/**
 * The explicit dependency set every use case receives.
 *
 * Passing one named object rather than seven positional parameters is what
 * keeps the use cases testable against fakes and keeps the wiring in one place.
 */
import type { PresetRepository } from '../ports/preset-repository.js'
import type { PresetSource } from '../ports/preset-source.js'
import type { RegistrationManager } from '../lifecycle/registration-manager.js'
import type { PresetDefinition, ValidationIssue } from '../../shared/types.js'
import { isLoaderBuiltin, isRelativeSpecifier } from '../../domain/preset-validator.js'

export interface ApplicationDeps {
  readonly repository: PresetRepository
  readonly source: PresetSource
  readonly registrations: RegistrationManager
  /** Whether a module specifier resolves in this installation. */
  readonly resolveModule: (moduleName: string) => boolean
  /** The preset DSH selects for a new session. */
  readonly defaultPresetId: () => Promise<string | undefined>
  /** Whether an id is declared by a shipped bundle. */
  readonly isShippedPreset: (id: string) => boolean
  readonly warn: (message: string) => void
  readonly now: () => number
}

/** How a preset's ownership is described in a conflict message. */
const OWNER_LABEL: Record<'managed' | 'builtin' | 'third-party', string> = {
  managed: '本插件',
  builtin: 'DSH 内置',
  'third-party': '第三方插件',
}

/**
 * Every id claimed by anyone, labelled with its owner.
 *
 * Built from the repository first so a stored preset is never mislabelled by a
 * runtime row that has not registered yet.
 */
export async function ownershipMap(deps: ApplicationDeps): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const entry of await deps.repository.list()) {
    map.set(entry.definition.id, OWNER_LABEL.managed)
  }
  const known = await deps.source.knownIds().catch(() => new Map<string, 'managed' | 'builtin' | 'third-party'>())
  for (const [id, ownership] of known) {
    if (map.has(id)) continue
    map.set(id, OWNER_LABEL[ownership] ?? '第三方插件')
  }
  return map
}

/**
 * Structural check of every named module in a definition.
 *
 * A module this installation cannot resolve makes the whole preset fail to
 * mount, because the registry mounts rows eagerly. Reporting it before
 * registration turns an opaque "broken" preset into a precise message.
 *
 * Two kinds of name are exempt because they are not packages at all:
 * Loader builtins (`cordis:group`, `cordis:include`) are resolved by the Loader,
 * and relative specifiers resolve beside the preset's own base URL.
 */
export function checkModules(
  definition: PresetDefinition,
  resolve: (moduleName: string) => boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const visit = (rows: readonly unknown[], path: string): void => {
    rows.forEach((row, index) => {
      if (typeof row !== 'object' || row === null) return
      const candidate = row as { name?: unknown; group?: unknown; config?: unknown }
      if (typeof candidate.name === 'string' && candidate.name !== '') {
        if (!isLoaderBuiltin(candidate.name) && !isRelativeSpecifier(candidate.name)) {
          if (!resolve(candidate.name)) {
            issues.push({
              code: 'compat.missing-module',
              message: `当前 DSH 安装中找不到插件包 "${candidate.name}"`,
              path: `${path}[${index}].name`,
              detail: candidate.name,
            })
          }
        }
      }
      if (candidate.group === true && Array.isArray(candidate.config)) {
        visit(candidate.config, `${path}[${index}].config`)
      }
    })
  }
  if (Array.isArray(definition.plugins)) visit(definition.plugins, 'plugins')
  return issues
}
