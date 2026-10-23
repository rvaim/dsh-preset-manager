/**
 * Share format, export, import, compatibility, and sensitivity checks.
 *
 * The properties that matter here are semantic fidelity and safety:
 *
 *  - a round-trip must preserve meaning, not merely parse;
 *  - an unknown format version must be refused before the payload is read;
 *  - a preview must never write, register, or evaluate an expression;
 *  - a sensitive finding must be reported, never silently stripped.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PresetDefinition } from '../../shared/types.js'
import {
  buildShareDocument,
  dumpShareText,
  parseBarePreset,
  parseShareText,
  readShareValue,
  SHARE_FORMAT_VERSION,
} from '../../sharing/share-format.js'
import { exportPreset, exportComposition } from '../../sharing/preset-exporter.js'
import { previewImport, suggestFreeId } from '../../sharing/preset-importer.js'
import { findSensitiveData } from '../../sharing/sensitive-data-checker.js'
import { checkCompatibility } from '../../sharing/compatibility-checker.js'
import { canonicalize } from '../../domain/preset-model.js'

const RICH: PresetDefinition = {
  id: 'rich-preset',
  name: '富配置预设',
  description: '包含 Group、isolate、disabled 与 !!js 的完整预设',
  order: 7,
  plugins: [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: {
        prefix: 'You are a coding agent.\n\n中文多行 persona。\n第三行。\n',
        suffix: '',
        complete: false,
      },
    },
    {
      id: 'conditional',
      name: '@deepseek-ai/dsh-skill',
      disabled: { __jsExpr: "ctx.get('profileContext') === undefined" },
      config: { description: '条件启用的 skill' },
    },
    {
      id: 'isolated',
      name: '@deepseek-ai/dsh-tools',
      isolate: { tools: true, shell: 'realm-a' },
      config: { unknownField: { nested: [1, 2, { deep: true }] } },
    },
    {
      id: 'group-one',
      name: 'cordis:group',
      group: true,
      config: [
        { id: 'inner-a', name: '@deepseek-ai/dsh-persona', config: { prefix: 'inner' } },
        { id: 'inner-b', name: '@deepseek-ai/dsh-skill', disabled: true },
      ],
    },
  ],
}

describe('share format', () => {
  it('round-trips a rich definition with semantic identity', () => {
    const text = dumpShareText(RICH)
    const parsed = parseShareText(text)

    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.document.formatVersion, SHARE_FORMAT_VERSION)
    // Canonical equality is the real test: it ignores key order but not meaning.
    assert.equal(canonicalize(parsed.document.preset), canonicalize(RICH))
  })

  it('preserves !!js expressions as inert nodes, never evaluating them', () => {
    const parsed = parseShareText(dumpShareText(RICH))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return

    const row = parsed.document.preset.plugins[1] as { disabled: { __jsExpr: string } }
    // The expression survives verbatim and is still an inert marker object.
    assert.deepEqual(row.disabled, { __jsExpr: "ctx.get('profileContext') === undefined" })
  })

  it('preserves Chinese text and multi-line persona exactly', () => {
    const parsed = parseShareText(dumpShareText(RICH))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return

    const persona = parsed.document.preset.plugins[0] as { config: { prefix: string } }
    assert.equal(persona.config.prefix, RICH.plugins[0]?.config !== undefined
      ? (RICH.plugins[0].config as { prefix: string }).prefix
      : '')
    assert.equal(parsed.document.preset.name, '富配置预设')
  })

  it('preserves groups, isolate, and unknown fields', () => {
    const parsed = parseShareText(dumpShareText(RICH))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return

    const plugins = parsed.document.preset.plugins
    const isolated = plugins[2] as { isolate: Record<string, unknown>; config: { unknownField: unknown } }
    assert.deepEqual(isolated.isolate, { tools: true, shell: 'realm-a' })
    assert.deepEqual(isolated.config.unknownField, { nested: [1, 2, { deep: true }] })

    const group = plugins[3] as { group: boolean; config: unknown[] }
    assert.equal(group.group, true)
    assert.equal(group.config.length, 2)
  })

  it('rejects an unknown format version before reading the payload', () => {
    const text = 'kind: dsh-agent-preset-share\nformatVersion: 99\npreset:\n  id: x\n  plugins: []\n'
    const parsed = parseShareText(text)
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.failure.reason, 'unsupported-version')
  })

  it('rejects a document that is not a share envelope', () => {
    const result = readShareValue({ something: 'else' })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.failure.reason, 'wrong-kind')
  })

  it('rejects invalid YAML with a syntax reason', () => {
    const parsed = parseShareText('kind: [unclosed')
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.failure.reason, 'yaml-syntax')
  })

  it('accepts a bare plugin-row list, as DSH’s own viewer shows', () => {
    const bare = parseBarePreset('- id: a\n  name: "@a/plugin"\n')
    assert.equal(bare.ok, true)
    if (!bare.ok) return
    assert.equal(bare.definition.plugins.length, 1)
  })

  it('builds an envelope that excludes local state', () => {
    const document = buildShareDocument(RICH)
    const text = dumpShareText(RICH)
    // Nothing machine-local may appear in the share text.
    assert.equal(/dsh-preset-manager\//.test(text), false)
    assert.equal(text.includes('revision'), false)
    assert.equal(document.kind, 'dsh-agent-preset-share')
  })
})

describe('export', () => {
  it('does not modify the exported definition', () => {
    const before = canonicalize(RICH)
    exportPreset(RICH)
    exportComposition(RICH)
    assert.equal(canonicalize(RICH), before)
  })

  it('flags secrets and local paths without rewriting them', () => {
    const withSecret: PresetDefinition = {
      id: 'leaky',
      plugins: [
        {
          id: 'x',
          name: '@a/plugin',
          config: {
            apiKey: 'sk-abcdefghijklmnopqrstuvwx',
            home: 'C:\\Users\\someone\\project',
            note: 'Bearer abcdefghijklmnopqrstuvwxyz012345',
          },
        },
      ],
    }
    const result = exportPreset(withSecret)

    assert.equal(result.risks.length >= 3, true)
    const codes = result.risks.map((risk) => risk.code)
    assert.equal(codes.includes('secret.openai'), true)
    assert.equal(codes.includes('path.windows-profile'), true)

    // The value is still present in the exported text: the checker reports, it
    // never redacts what the user authored.
    assert.equal(result.yaml.includes('sk-abcdefghijklmnopqrstuvwx'), true)
  })

  it('reports no findings for a clean preset', () => {
    assert.deepEqual(findSensitiveData(RICH), [])
  })
})

describe('import preview', () => {
  const known = [
    { id: 'standard', ownership: 'builtin' as const },
    { id: 'mine', ownership: 'managed' as const },
  ]
  const resolveAll = (): boolean => true

  it('previews without applying anything', () => {
    const result = previewImport({
      text: dumpShareText(RICH),
      source: 'share',
      knownPresets: known,
      resolveModule: resolveAll,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.preview.definition.id, 'rich-preset')
    assert.equal(result.preview.validation.ok, true)
  })

  it('rejects an unsupported version with a stable code', () => {
    const result = previewImport({
      text: 'kind: dsh-agent-preset-share\nformatVersion: 42\npreset: {id: x, plugins: []}\n',
      source: 'share',
      knownPresets: known,
      resolveModule: resolveAll,
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.issues[0]?.code, 'share.unsupported-version')
  })

  it('refuses an id that collides with a built-in preset', () => {
    const colliding: PresetDefinition = { id: 'standard', plugins: [{ name: '@a/plugin' }] }
    const result = previewImport({
      text: dumpShareText(colliding),
      source: 'share',
      knownPresets: known,
      resolveModule: resolveAll,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.preview.idConflict.conflict, true)
    assert.equal(result.preview.idConflict.existingOwnership, 'builtin')
    assert.equal(result.preview.validation.ok, false)
    // A concrete suggestion is offered rather than a random id.
    assert.equal(result.preview.idConflict.suggestedId, 'standard-copy')
  })

  it('blocks an import whose plugin package is missing', () => {
    const result = previewImport({
      text: dumpShareText({
        id: 'needs-missing',
        plugins: [{ id: 'x', name: '@not/installed' }],
      }),
      source: 'share',
      knownPresets: known,
      resolveModule: (name) => name !== '@not/installed',
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.preview.validation.ok, false)
    assert.equal(
      result.preview.validation.errors.some((issue) => issue.code === 'compat.missing-module'),
      true,
    )
  })

  it('does not treat cordis:group as a missing package', () => {
    const result = previewImport({
      text: dumpShareText({
        id: 'with-group',
        plugins: [
          {
            name: 'cordis:group',
            group: true,
            config: [{ id: 'inner', name: '@a/plugin' }],
          } as never,
        ],
      }),
      source: 'share',
      knownPresets: known,
      resolveModule: (name) => name === '@a/plugin',
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.preview.validation.ok, true)
  })

  it('reports !!js expressions as risks without executing them', () => {
    const result = previewImport({
      text: dumpShareText(RICH),
      source: 'share',
      knownPresets: known,
      resolveModule: resolveAll,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(
      result.preview.risks.some((risk) => risk.code === 'compat.expression'),
      true,
    )
  })

  it('accepts share text saved as a .yml file', () => {
    const result = previewImport({
      text: dumpShareText(RICH),
      source: 'yaml-file',
      knownPresets: known,
      resolveModule: resolveAll,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.preview.definition.id, 'rich-preset')
  })

  it('suggests a deterministic free id', () => {
    const taken = new Set(['x', 'x-copy', 'x-copy-2'])
    assert.equal(suggestFreeId('x', taken), 'x-copy-3')
    assert.equal(suggestFreeId('y', new Set()), 'y-copy')
  })
})

describe('compatibility', () => {
  it('reports every missing module once', () => {
    const report = checkCompatibility(
      {
        id: 'x',
        plugins: [
          { name: '@missing/a' },
          { name: '@missing/a' },
          { name: '@present/b' },
        ],
      },
      (name) => name === '@present/b',
    )
    assert.equal(report.blocked, true)
    assert.deepEqual(report.missingModules, ['@missing/a'])
  })

  it('counts expressions but does not block on them', () => {
    const report = checkCompatibility(RICH, () => true)
    assert.equal(report.blocked, false)
    assert.equal(report.expressionCount, 1)
  })
})
