/**
 * Reading presets the manager does not own.
 *
 * The registry exposes an owner-level method for this: `list()` gives display
 * metadata and health, and the Remote-facing `readDocument()` returns a preset's
 * child plugin list as entry-list YAML. The YAML is the authoritative
 * composition — it is what the declaring plugin's own config held — so this
 * adapter parses it with the same dialect the manager dumps with, and a copy of
 * a built-in preset therefore preserves `!!js` nodes, groups, `isolate` realms
 * and every unknown field.
 *
 * Nothing here is writable: a built-in or third-party preset can be read and
 * copied, never modified in place.
 */
import type {
  PresetDefinition,
  PresetSummary,
} from '../../shared/types.js'
import { countPlugins, parsePluginRows } from '../../domain/preset-model.js'
import type { PresetSource, SourcePreset } from '../ports/preset-source.js'

/**
 * The registry surface this adapter needs.
 *
 * `readDocument` is the method DSH itself exposes to the web UI for viewing a
 * preset's composition, which makes it the stable way for a plugin to read one
 * too — as opposed to reaching into the registry's private definition map.
 */
export interface AgentPresetDocumentReader {
  list(): Promise<
    {
      id: string
      name?: string
      description?: string
      order?: number
      broken?: string
    }[]
  >
  readDocument(agentPreset: string): Promise<{
    agentPreset: string
    content: string
    name?: string
    description?: string
  }>
}

export interface DshPresetSourceOptions {
  readonly reader: AgentPresetDocumentReader
  /** Ids the manager owns, so its own presets are classified correctly. */
  readonly managedIds: { has(id: string): boolean }
  /** Whether an id is declared by a shipped bundle. */
  readonly isShippedPreset: (id: string) => boolean
  /** The id DSH currently selects, resolved lazily to avoid a stale read. */
  readonly defaultId: () => Promise<string | undefined>
}

export class DshPresetSource implements PresetSource {
  private readonly reader: AgentPresetDocumentReader
  private readonly managedIds: { has(id: string): boolean }
  private readonly isShippedPreset: (id: string) => boolean
  private readonly defaultId: () => Promise<string | undefined>

  constructor(options: DshPresetSourceOptions) {
    this.reader = options.reader
    this.managedIds = options.managedIds
    this.isShippedPreset = options.isShippedPreset
    this.defaultId = options.defaultId
  }

  async list(): Promise<PresetSummary[]> {
    const [rows, defaultId] = await Promise.all([
      this.reader.list(),
      this.defaultId().catch(() => undefined),
    ])
    return rows.map((row) => {
      const ownership: PresetSummary['ownership'] = this.managedIds.has(row.id)
        ? 'managed'
        : this.isShippedPreset(row.id)
          ? 'builtin'
          : 'third-party'
      return {
        id: row.id,
        ...(row.name === undefined ? {} : { name: row.name }),
        ...(row.description === undefined ? {} : { description: row.description }),
        ...(row.order === undefined ? {} : { order: row.order }),
        ownership,
        registration: 'registered',
        isDefault: row.id === defaultId,
        health: row.broken === undefined ? 'healthy' : 'broken',
        ...(row.broken === undefined ? {} : { broken: row.broken }),
        // The document is not read for the list: one list call must stay one
        // round trip per preset, and the count is not worth N parses.
        pluginCount: 0,
      } satisfies PresetSummary
    })
  }

  async read(id: string): Promise<SourcePreset | undefined> {
    let document: Awaited<ReturnType<AgentPresetDocumentReader['readDocument']>>
    try {
      document = await this.reader.readDocument(id)
    } catch {
      // The registry throws `agent-preset/not-found` for an unknown id, which is
      // a normal answer to "does this exist", not an error to propagate.
      return undefined
    }

    let plugins: PresetDefinition['plugins']
    try {
      plugins = parsePluginRows(document.content)
    } catch {
      // A preset whose declared composition cannot be parsed is still visible in
      // the roster; it simply cannot be copied. Reporting it as absent would
      // wrongly imply the id does not exist.
      return undefined
    }

    const summaries = await this.list().catch(() => [] as PresetSummary[])
    const summary =
      summaries.find((candidate) => candidate.id === id) ??
      ({
        id,
        ownership: this.managedIds.has(id)
          ? 'managed'
          : this.isShippedPreset(id)
            ? 'builtin'
            : 'third-party',
        registration: 'registered',
        isDefault: false,
        health: 'unchecked',
        pluginCount: countPlugins(plugins),
      } satisfies PresetSummary)

    const definition: PresetDefinition = {
      id,
      ...(document.name === undefined ? {} : { name: document.name }),
      ...(document.description === undefined ? {} : { description: document.description }),
      plugins,
    }

    return {
      summary: { ...summary, pluginCount: countPlugins(plugins) },
      definition,
    }
  }

  async knownIds(): Promise<ReadonlyMap<string, 'managed' | 'builtin' | 'third-party'>> {
    const rows = await this.reader.list()
    return new Map(
      rows.map((row) => [
        row.id,
        this.managedIds.has(row.id)
          ? ('managed' as const)
          : this.isShippedPreset(row.id)
            ? ('builtin' as const)
            : ('third-party' as const),
      ]),
    )
  }
}
