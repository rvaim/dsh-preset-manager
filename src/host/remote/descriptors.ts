/**
 * The Typert Remote descriptors for the preset manager.
 *
 * DSH reaches a Host service through generated Remote descriptors: the Host
 * registers them with `ctx.typert.register()`, and the Client mounts the same
 * set with `ctx.remote.$mount()` to obtain a typed proxy. Both halves import
 * this module, so an endpoint cannot exist on only one side.
 *
 * Two constraints from the installed runtime shape what is here:
 *
 *  - The Client **rejects a non-strict codec** on any parameter
 *    (`requireStrictInputs`), so every parameter declares a strict codec. The
 *    codecs are implemented inline rather than generated: they validate the
 *    wire shape and pass values through, which is exactly what a Remote boundary
 *    needs and avoids depending on a schema library the host profile may not
 *    expose to a third-party bundle.
 *  - A descriptor id and endpoint must be unique across the whole process, so
 *    every id is prefixed with the package name.
 */
/**
 * The descriptor shapes, declared locally.
 *
 * The real declarations live in `@deepseek-ai/dsh-typert-protocol`, which is a
 * peer of the DSH installation rather than a package this bundle may depend on.
 * Declaring only the fields used here keeps the bundle free of a runtime
 * dependency while still type-checking the contribution it hands to
 * `ctx.typert.register()`.
 */
interface StrictCodec {
  readonly mode: 'strict'
  readonly typeSymbol: string
  readonly create: () => { parse(value: unknown): unknown }
}

interface InvocationParameter {
  readonly name: string
  readonly wire: string
  readonly source: 'json'
  readonly codec: StrictCodec
  readonly acceptsUndefined?: true
}

interface InvocationDescriptor {
  readonly id: string
  readonly service: string
  readonly namespace: string
  readonly method: string
  readonly implementation?: string
  readonly invocation: { readonly kind: 'direct' }
  readonly parameters: readonly InvocationParameter[]
  readonly result: StrictCodec
}

interface TypertContribution {
  readonly package: string
  readonly face: 'host' | 'client'
  readonly schemas: readonly unknown[]
  readonly model: {
    readonly services: readonly unknown[]
    readonly events: readonly unknown[]
    readonly objects: readonly unknown[]
  }
  readonly invocations: readonly InvocationDescriptor[]
}

/**
 * Package identity of every contribution and descriptor id.
 *
 * This is the published npm name: descriptor ids must be unique across the whole
 * process, so they are namespaced by the package that owns them.
 */
export const PRESET_MANAGER_PACKAGE = '@rvaim/dsh-preset-manager'

/** Service key, Remote namespace, and Typert service key — one name. */
export const PRESET_MANAGER_SERVICE = 'presetManager'
export const PRESET_MANAGER_NAMESPACE = 'presetManager'

/**
 * A strict codec that validates the value's JSON shape and passes it through.
 *
 * `check` receives the wire value and throws a message describing the problem;
 * the gateway converts that throw into `gateway/input-invalid` naming the field,
 * so a client that sends the wrong shape gets a precise diagnostic instead of a
 * business-level failure.
 */
function jsonCodec(name: string, check: (value: unknown) => string | undefined): StrictCodec {
  return {
    mode: 'strict',
    typeSymbol: `${PRESET_MANAGER_PACKAGE}#${name}`,
    create: () => ({
      parse(value: unknown): unknown {
        const problem = check(value)
        if (problem !== undefined) throw new TypeError(problem)
        return value
      },
    }),
  }
}

const isRecord = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringCodec = (name: string) =>
  jsonCodec(name, (value) => (typeof value === 'string' ? undefined : 'expected a string'))

const booleanCodec = (name: string) =>
  jsonCodec(name, (value) => (typeof value === 'boolean' ? undefined : 'expected a boolean'))

/** A plain JSON object with no class instance and no cycle. */
const recordCodec = (name: string) =>
  jsonCodec(name, (value) => (isRecord(value) ? undefined : 'expected an object'))

/** An optional string: the wire omits it rather than sending `null`. */
const optionalStringCodec = (name: string) =>
  jsonCodec(name, (value) =>
    value === undefined || typeof value === 'string' ? undefined : 'expected a string or undefined',
  )

const optionalBooleanCodec = (name: string) =>
  jsonCodec(name, (value) =>
    value === undefined || typeof value === 'boolean'
      ? undefined
      : 'expected a boolean or undefined',
  )

/** Return shape of every endpoint; the gateway re-validates it as JSON. */
const anyResult = jsonCodec('Result', (value) =>
  value === undefined || isRecord(value) || Array.isArray(value)
    ? undefined
    : 'expected a JSON value',
)

function method(
  name: string,
  parameters: readonly InvocationParameter[],
  implementation?: string,
): InvocationDescriptor {
  return {
    id: `${PRESET_MANAGER_PACKAGE}#${PRESET_MANAGER_NAMESPACE}/${name}`,
    service: PRESET_MANAGER_SERVICE,
    namespace: PRESET_MANAGER_NAMESPACE,
    method: name,
    ...(implementation === undefined ? {} : { implementation }),
    invocation: { kind: 'direct' },
    parameters,
    result: anyResult,
  }
}

function jsonParameter(
  name: string,
  codec: StrictCodec,
  optional = false,
): InvocationParameter {
  return {
    name,
    wire: name,
    source: 'json',
    codec,
    ...(optional ? { acceptsUndefined: true as const } : {}),
  }
}

/**
 * Every endpoint the settings page may call.
 *
 * Parameter order matches the Host method signature exactly: the gateway
 * reflects the descriptor's wire fields onto positional arguments.
 */
export const PRESET_MANAGER_DESCRIPTORS: readonly InvocationDescriptor[] = Object.freeze([
  method('snapshot', []),
  method('cloneSources', []),
  method('detail', [jsonParameter('id', stringCodec('PresetId'))]),
  method('history', [jsonParameter('id', stringCodec('PresetId'))]),
  method('setEnabled', [
    jsonParameter('id', stringCodec('PresetId')),
    jsonParameter('enabled', booleanCodec('PresetEnabled')),
  ]),

  method('clone', [
    jsonParameter('sourceId', stringCodec('PresetId')),
    jsonParameter('newId', optionalStringCodec('OptionalPresetId'), true),
    jsonParameter('name', optionalStringCodec('OptionalName'), true),
    jsonParameter('description', optionalStringCodec('OptionalDescription'), true),
  ]),

  method('save', [
    jsonParameter('definition', recordCodec('PresetDefinition')),
    jsonParameter('expectedRevision', optionalStringCodec('OptionalRevision'), true),
  ]),

  // `remove` belongs to DSH's RemoteNamespaceService lifecycle. Export a
  // domain-specific wire name and let Gateway dispatch to the existing face.
  method('deletePreset', [
    jsonParameter('id', stringCodec('PresetId')),
    jsonParameter('acknowledgedDefaultRisk', optionalBooleanCodec('OptionalFlag'), true),
  ], 'remove'),

  method('restore', [
    jsonParameter('id', stringCodec('PresetId')),
    jsonParameter('revision', stringCodec('Revision')),
    jsonParameter('expectedRevision', optionalStringCodec('OptionalRevision'), true),
  ]),

  method('validate', [jsonParameter('definition', recordCodec('PresetDefinition'))]),

  method('diff', [
    jsonParameter('before', recordCodec('PresetDefinition')),
    jsonParameter('after', recordCodec('PresetDefinition')),
  ]),

  method('renderYaml', [jsonParameter('id', stringCodec('PresetId'))]),
  method('parseYaml', [
    jsonParameter('id', stringCodec('PresetId')),
    jsonParameter('yaml', stringCodec('YamlText')),
  ]),
  method('exportPreset', [jsonParameter('id', stringCodec('PresetId'))]),
  method('shareText', [jsonParameter('id', stringCodec('PresetId'))]),

  method('previewImport', [
    jsonParameter('text', stringCodec('ImportText')),
    jsonParameter('source', stringCodec('ImportSource')),
    jsonParameter('id', optionalStringCodec('OptionalPresetId'), true),
  ]),

  method('importPreset', [
    jsonParameter('text', stringCodec('ImportText')),
    jsonParameter('source', stringCodec('ImportSource')),
    jsonParameter('id', optionalStringCodec('OptionalPresetId'), true),
    jsonParameter('name', optionalStringCodec('OptionalName'), true),
    jsonParameter('acknowledgedRisks', booleanCodec('Acknowledged')),
  ]),

  method('purge', [jsonParameter('confirmation', stringCodec('Confirmation'))]),
])

/**
 * The Host contribution registered with `ctx.typert.register()`.
 *
 * `schemas` is empty because the descriptors carry their own codecs; the model
 * is empty because reflection is a documentation surface, not a runtime
 * requirement, and declaring an inaccurate one would be worse than none.
 */
export const PRESET_MANAGER_CONTRIBUTION: TypertContribution = Object.freeze({
  package: PRESET_MANAGER_PACKAGE,
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: PRESET_MANAGER_DESCRIPTORS,
})

/** The Client contribution mounted with `ctx.remote.$mount()`. */
export const PRESET_MANAGER_REMOTE = Object.freeze({
  package: PRESET_MANAGER_PACKAGE,
  descriptors: PRESET_MANAGER_DESCRIPTORS,
})
