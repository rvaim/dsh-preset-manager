/**
 * Import a preset from share text or a YAML file.
 *
 * The two phases are the point of this module:
 *
 *  - `preview` parses, validates, checks module compatibility and collects
 *    risks — and touches neither the file system nor the runtime. Nothing is
 *    registered before the user confirms, which is what makes "preview" mean
 *    what it says.
 *  - `import` re-derives the definition from the same text and applies it
 *    through the ordinary save path, so a confirmation cannot be replayed
 *    against different content.
 */
import type {
  ImportPreview,
  MutationResult,
  ValidationIssue,
} from '../../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../../shared/errors.js'
import {
  previewImport,
  type ImportSource,
} from '../../../sharing/preset-importer.js'
import type { ApplicationDeps } from '../deps.js'
import { applyDefinition } from './apply-definition.js'

export interface PreviewRequest {
  readonly text: string
  readonly source: ImportSource
}

export interface ImportRequest extends PreviewRequest {
  readonly id?: string
  readonly name?: string
  readonly acknowledgedRisks: boolean
}

function toIssues(issues: readonly ValidationIssue[]): {
  code: string
  message: string
  path?: string
  detail?: string
}[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    ...(issue.path === undefined ? {} : { path: issue.path }),
    ...(issue.detail === undefined ? {} : { detail: issue.detail }),
  }))
}

async function knownPresets(
  deps: ApplicationDeps,
): Promise<{ id: string; ownership: 'managed' | 'builtin' | 'third-party' }[]> {
  const stored = await deps.repository.list()
  const seen = new Map<string, 'managed' | 'builtin' | 'third-party'>()
  for (const entry of stored) seen.set(entry.definition.id, 'managed')
  const runtime = await deps.source.knownIds().catch(() => new Map())
  for (const [id, ownership] of runtime) {
    if (!seen.has(id)) seen.set(id, ownership)
  }
  return [...seen.entries()].map(([id, ownership]) => ({ id, ownership }))
}

async function buildPreview(
  deps: ApplicationDeps,
  request: PreviewRequest & { id?: string; name?: string },
): Promise<ImportPreview> {
  const result = previewImport({
    text: request.text,
    source: request.source,
    ...(request.id === undefined ? {} : { id: request.id }),
    ...(request.name === undefined ? {} : { name: request.name }),
    knownPresets: await knownPresets(deps),
    resolveModule: deps.resolveModule,
  })
  if (!result.ok) {
    throw new ManagerError(
      ManagerErrorCode.shareMalformed,
      '这段内容无法识别为可导入的 Agent 预设',
      toIssues(result.issues),
    )
  }
  return result.preview
}

/** Parse and describe an import without applying it. */
export async function previewImportUseCase(
  deps: ApplicationDeps,
  request: PreviewRequest,
): Promise<ImportPreview> {
  return buildPreview(deps, request)
}

/** Apply a confirmed import. */
export async function importPresetUseCase(
  deps: ApplicationDeps,
  request: ImportRequest,
): Promise<MutationResult> {
  if (!request.acknowledgedRisks) {
    throw new ManagerError(
      ManagerErrorCode.invalidInput,
      '请先阅读并确认导入风险提示',
    )
  }

  const preview = await buildPreview(deps, request)
  if (!preview.validation.ok) {
    throw new ManagerError(
      ManagerErrorCode.presetInvalid,
      '导入的预设未通过校验',
      toIssues(preview.validation.errors),
    )
  }

  return applyDefinition(deps, preview.definition, { reason: 'import' })
}
