/**
 * A faithful stand-in for DSH's `AgentPresetRegistry`.
 *
 * The fake reproduces the three behaviours the adapter depends on, because a
 * looser fake would let a broken adapter pass:
 *
 *  - `register()` throws on a duplicate id.
 *  - `register()` resolves even when the definition is unusable; the failure
 *    appears on the roster row as `broken`.
 *  - The disposer is idempotent and removes the row.
 *
 * A definition is treated as unusable when a row names a module the fake was
 * told is missing, which mirrors what an unresolvable import does in the real
 * registry.
 */
import type { AgentPresetRegistryLike } from '../../../host/adapters/dynamic-preset-registry.js'
import type { PresetDefinition } from '../../../shared/types.js'

interface Row {
  id: string
  name?: string
  description?: string
  order?: number
  broken?: string
  definition: PresetDefinition
  disposals: number
}

export interface FakeRegistryOptions {
  /** Module names that do not resolve, making a preset activate broken. */
  readonly missingModules?: readonly string[]
  /** Make `list()` reject, to exercise the "cannot prove health" path. */
  readonly failList?: () => boolean
}

export class FakeAgentPresetRegistry implements AgentPresetRegistryLike {
  private readonly rows = new Map<string, Row>()
  private readonly missing: Set<string>
  private readonly failList: () => boolean

  /** Every registration attempt, in order, for assertions. */
  readonly attempts: { id: string; at: number }[] = []
  /** Number of times each id's disposer actually ran. */
  readonly disposalCounts = new Map<string, number>()

  constructor(options: FakeRegistryOptions = {}) {
    this.missing = new Set(options.missingModules ?? [])
    this.failList = options.failList ?? (() => false)
  }

  /** Seed a preset declared by someone else, such as a shipped bundle. */
  seed(definition: PresetDefinition, broken?: string): void {
    this.rows.set(definition.id, {
      id: definition.id,
      ...(definition.name === undefined ? {} : { name: definition.name }),
      ...(definition.description === undefined ? {} : { description: definition.description }),
      ...(definition.order === undefined ? {} : { order: definition.order }),
      ...(broken === undefined ? {} : { broken }),
      definition,
      disposals: 0,
    })
  }

  /** Ids currently published. */
  ids(): string[] {
    return [...this.rows.keys()]
  }

  async register(definition: PresetDefinition): Promise<() => Promise<void>> {
    this.attempts.push({ id: definition.id, at: Date.now() })
    if (this.rows.has(definition.id)) {
      throw new Error(`Duplicate agent preset: ${definition.id}`)
    }

    // Activation is evaluated now, and a failure is recorded rather than thrown,
    // exactly like the real registry.
    const broken = this.activationProblem(definition)
    const row: Row = {
      id: definition.id,
      ...(definition.name === undefined ? {} : { name: definition.name }),
      ...(definition.description === undefined ? {} : { description: definition.description }),
      ...(definition.order === undefined ? {} : { order: definition.order }),
      ...(broken === undefined ? {} : { broken }),
      definition,
      disposals: 0,
    }
    this.rows.set(definition.id, row)

    let disposed = false
    return async () => {
      if (disposed) return
      disposed = true
      row.disposals += 1
      this.disposalCounts.set(definition.id, row.disposals)
      // Only remove the row if it is still this registration's row, so a
      // replaced id is not removed by a stale disposer.
      if (this.rows.get(definition.id) === row) this.rows.delete(definition.id)
    }
  }

  private activationProblem(definition: PresetDefinition): string | undefined {
    const problems: string[] = []
    const visit = (rows: readonly unknown[]): void => {
      for (const raw of rows) {
        if (typeof raw !== 'object' || raw === null) continue
        const row = raw as { name?: unknown; group?: unknown; config?: unknown }
        if (typeof row.name === 'string' && this.missing.has(row.name)) {
          problems.push(`failed to import: cannot find module ${row.name}`)
        }
        if (row.group === true && Array.isArray(row.config)) visit(row.config)
      }
    }
    visit(definition.plugins)
    return problems.length === 0 ? undefined : problems.join('\n')
  }

  async list(): Promise<
    { id: string; name?: string; description?: string; order?: number; broken?: string }[]
  > {
    if (this.failList()) throw new Error('registry roster unavailable')
    return [...this.rows.values()]
      .map((row) => ({
        id: row.id,
        ...(row.name === undefined ? {} : { name: row.name }),
        ...(row.description === undefined ? {} : { description: row.description }),
        ...(row.order === undefined ? {} : { order: row.order }),
        ...(row.broken === undefined ? {} : { broken: row.broken }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  /** The document reader shape, mirroring DSH's `readDocument`. */
  async readDocument(agentPreset: string): Promise<{
    agentPreset: string
    content: string
    name?: string
    description?: string
  }> {
    const row = this.rows.get(agentPreset)
    if (row === undefined) throw new Error(`Unknown agent preset: ${agentPreset}`)
    const { dumpPluginRows } = await import('../../../domain/preset-model.js')
    return {
      agentPreset,
      content: dumpPluginRows(row.definition.plugins),
      ...(row.name === undefined ? {} : { name: row.name }),
      ...(row.description === undefined ? {} : { description: row.description }),
    }
  }
}
