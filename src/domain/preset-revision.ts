/**
 * Revision hashing for preset definitions.
 *
 * Split out of the preset model deliberately: hashing needs `node:crypto`, and
 * the model is loaded by the browser too (the Persona editor rewrites config on
 * a draft). Keeping the two apart means one pure module the Client can bundle
 * and one Host-only module that owns the digest.
 *
 * A revision is a content hash, so it changes exactly when the definition's
 * meaning changes — which is what conflict detection and history indexing need.
 */
import { createHash } from 'node:crypto'
import type { PresetDefinition } from '../shared/types.js'
import { canonicalize } from './preset-model.js'

/**
 * Content hash of a preset's effective content.
 *
 * The id participates so two presets with identical rows but different
 * identities stay distinguishable, and the metadata participates so a rename
 * alone produces a new revision.
 */
export function revisionOf(definition: PresetDefinition): string {
  return createHash('sha256')
    .update(
      canonicalize({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        order: definition.order,
        plugins: definition.plugins,
      }),
    )
    .digest('hex')
}

/** Deep equality of two definitions, ignoring authoring order. */
export function sameDefinition(
  left: PresetDefinition,
  right: PresetDefinition,
): boolean {
  return revisionOf(left) === revisionOf(right)
}
