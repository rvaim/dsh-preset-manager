/**
 * Importing a preset from share text or a bare YAML file.
 *
 * Import is a two-phase operation by design. `previewImport` parses, checks and
 * reports without touching disk or the runtime, so nothing is activated before
 * the user confirms. Only `ImportPresetUseCase` — which consumes a preview —
 * persists and registers.
 *
 * No `!!js` expression is ever evaluated here. The parser produces inert nodes;
 * evaluation belongs to the DSH Loader inside the runtime, after confirmation.
 */
import type {
  ImportPreview,
  PresetDefinition,
  ValidationIssue,
} from '../shared/types.js'
import {
  canonicalize,
  collectExpressions,
  dumpPluginRows,
} from '../domain/preset-model.js'
import { revisionOf } from '../domain/preset-revision.js'
import { validatePreset } from '../domain/preset-validator.js'
import { checkCompatibility, type ModuleResolver } from './compatibility-checker.js'
import { parseBarePreset, parseShareText, SHARE_FORMAT_VERSION } from './share-format.js'
import { sensitiveWarnings } from './sensitive-data-checker.js'

/** How the text arrived, which selects the accepted document shapes. */
export type ImportSource = 'share' | 'yaml-file'

/** Names already in the registry, with their ownership, for conflict checks. */
export interface KnownPreset {
  readonly id: string
  readonly ownership: 'managed' | 'builtin' | 'third-party'
}

export interface ImportRequest {
  readonly text: string
  readonly source: ImportSource
  /** Id the user wants; overrides the document's own id when given. */
  readonly id?: string
  readonly name?: string
  readonly knownPresets: readonly KnownPreset[]
  readonly resolveModule: ModuleResolver
}

export type ImportResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; issues: readonly ValidationIssue[] }

/** Turn a share-format failure into a precise, code-stable issue list. */
function shareFailureIssues(failure: import('./share-format.js').ShareParseFailure): ValidationIssue[] {
  switch (failure.reason) {
    case 'yaml-syntax':
      return [
        {
          code: 'share.yaml-syntax',
          message: 'YAML 语法错误，无法解析',
          detail: failure.message,
        },
      ]
    case 'not-a-mapping':
      return [
        {
          code: 'share.not-a-mapping',
          message: '分享文本必须是 YAML 映射（含 kind、formatVersion、preset 三个字段）',
        },
      ]
    case 'wrong-kind':
      return [
        {
          code: 'share.wrong-kind',
          message: '这不是 Agent 预设分享文本：kind 字段不匹配',
          detail: `期望 "dsh-agent-preset-share"，实际 "${String(failure.kind)}"`,
        },
      ]
    case 'missing-version':
      return [
        {
          code: 'share.missing-version',
          message: '分享文本缺少 formatVersion 字段，无法确定格式版本',
        },
      ]
    case 'unsupported-version':
      return [
        {
          code: 'share.unsupported-version',
          message: `不支持的分享格式版本：${String(failure.version)}（本版本仅支持 ${SHARE_FORMAT_VERSION}）`,
          detail: String(failure.version),
        },
      ]
    case 'missing-preset':
      return [{ code: 'share.missing-preset', message: '分享文本缺少 preset 字段' }]
    case 'preset-not-a-mapping':
      return [{ code: 'share.preset-shape', message: 'preset 字段必须是一个预设映射' }]
  }
}

/**
 * Suggest an unused id derived from a taken one.
 *
 * Kept deterministic (`-2`, `-3`, …) rather than random, so re-importing the
 * same file twice produces the same suggestion and the user is not surprised.
 */
export function suggestFreeId(
  wanted: string,
  taken: ReadonlySet<string>,
  limit = 50,
): string {
  const base = wanted.replace(/-copy(?:-\d+)?$/u, '')
  const first = `${base}-copy`
  if (!taken.has(first)) return first
  for (let suffix = 2; suffix <= limit; suffix += 1) {
    const candidate = `${first}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${first}-${Date.now().toString(36)}`
}

/**
 * Parse, check and describe an import without applying it.
 *
 * The returned preview is exactly what the UI shows for confirmation, and the
 * definition inside it is what `ImportPresetUseCase` persists — so the thing
 * the user approved and the thing that gets registered cannot diverge.
 */
export function previewImport(request: ImportRequest): ImportResult {
  const text = request.text.trim()
  if (text === '') {
    return {
      ok: false,
      issues: [{ code: 'share.empty', message: '分享文本为空' }],
    }
  }

  let definition: PresetDefinition
  let formatVersion: number
  if (request.source === 'share') {
    const parsed = parseShareText(text)
    if (!parsed.ok) return { ok: false, issues: shareFailureIssues(parsed.failure) }
    definition = parsed.document.preset
    formatVersion = parsed.document.formatVersion
  } else {
    // A YAML file may legitimately be a share document; try the envelope first
    // so a user who saved share text as `.yml` still imports cleanly.
    const enveloped = parseShareText(text)
    if (enveloped.ok) {
      definition = enveloped.document.preset
      formatVersion = enveloped.document.formatVersion
    } else {
      const bare = parseBarePreset(text)
      if (!bare.ok) {
        return {
          ok: false,
          issues: [
            { code: 'import.parse', message: '无法解析该 YAML 文件', detail: bare.message },
            ...shareFailureIssues(enveloped.failure),
          ],
        }
      }
      definition = bare.definition
      formatVersion = SHARE_FORMAT_VERSION
    }
  }

  if (typeof definition !== 'object' || definition === null || !Array.isArray(definition.plugins)) {
    return {
      ok: false,
      issues: [
        {
          code: 'import.no-plugins',
          message: '预设缺少 plugins 插件行列表',
        },
      ],
    }
  }

  // The id may come from the document, or be supplied by the user during
  // conflict resolution. Either way it is validated as part of the definition.
  const wantedId = request.id ?? definition.id
  const candidate: PresetDefinition = {
    ...definition,
    id: wantedId,
    ...(request.name === undefined ? {} : { name: request.name }),
  }

  const taken = new Set(request.knownPresets.map((entry) => entry.id))
  const ownershipOf = new Map(request.knownPresets.map((entry) => [entry.id, entry.ownership]))
  const validation = validatePreset(candidate, { knownIds: new Map(
    [...ownershipOf.entries()].map(([id, ownership]) => [
      id,
      ownership === 'managed' ? '本插件' : ownership === 'builtin' ? 'DSH 内置' : '第三方插件',
    ]),
  ) })

  const compatibility = checkCompatibility(candidate, request.resolveModule)
  const sensitive = sensitiveWarnings(candidate)

  const collision = ownershipOf.get(wantedId)
  const idConflict = {
    conflict: collision !== undefined,
    ...(collision === undefined ? {} : { existingOwnership: collision }),
    ...(collision === undefined ? {} : { suggestedId: suggestFreeId(wantedId, taken) }),
  }

  // Hard blockers are promoted into the validation errors so a caller that only
  // reads `validation.ok` cannot miss them.
  const errors = [...validation.errors]
  if (compatibility.blocked) {
    for (const issue of compatibility.issues) {
      if (issue.code === 'compat.missing-module') errors.push(issue)
    }
  }

  const risks: ValidationIssue[] = [
    ...compatibility.issues.filter((issue) => issue.code !== 'compat.missing-module'),
    ...sensitive,
  ]

  return {
    ok: true,
    preview: {
      document: {
        kind: 'dsh-agent-preset-share',
        formatVersion,
        preset: candidate,
      },
      definition: candidate,
      validation: {
        ok: errors.length === 0,
        errors,
        warnings: validation.warnings,
      },
      risks,
      idConflict,
      yaml: dumpPluginRows(candidate.plugins),
    },
  }
}

/**
 * A stable fingerprint of an approved preview.
 *
 * The import use case re-derives the definition from the same text and compares
 * this value, so a user who edited the text between preview and confirm acts on
 * the text they actually approved.
 */
export function previewFingerprint(preview: ImportPreview): string {
  return revisionOf(preview.definition)
}

/** Expressions an imported preset carries, for the UI's risk list. */
export function expressionSummary(definition: PresetDefinition): string[] {
  return collectExpressions(definition).map((item) => `${item.path}: ${item.expression}`)
}

/** Canonical form used for tests that assert semantic round-trip identity. */
export function semanticForm(definition: PresetDefinition): string {
  return canonicalize(definition)
}
