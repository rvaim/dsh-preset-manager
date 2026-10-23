/**
 * Stable machine-readable error codes shared by Host and Client.
 *
 * The Client localizes by code, so a code must never be reused for a
 * different cause and must stay stable across releases.
 */
export const ManagerErrorCode = {
  /** The manager has not finished restoring, or has been stopped. */
  notReady: 'manager/not-ready',
  /** The manager is shutting down and refuses new mutations. */
  stopping: 'manager/stopping',
  /** Another mutation holds the serialization lock. */
  busy: 'manager/busy',
  /** The requested preset id does not exist in the registry. */
  presetNotFound: 'preset/not-found',
  /** The requested preset exists but is not owned by this plugin. */
  presetNotOwned: 'preset/not-owned',
  /** The candidate definition failed validation. */
  presetInvalid: 'preset/invalid',
  /** The candidate id already exists and belongs to someone else. */
  presetConflict: 'preset/conflict',
  /** The definition was changed by someone else since it was read. */
  revisionConflict: 'preset/revision-conflict',
  /** Runtime registration failed; the previous revision was restored. */
  registrationFailed: 'preset/registration-failed',
  /** Runtime registration reported a broken activation. */
  activationBroken: 'preset/activation-broken',
  /** The share text is not a recognized share document. */
  shareMalformed: 'share/malformed',
  /** The share document declares an unsupported format version. */
  shareUnsupportedVersion: 'share/unsupported-version',
  /** The share document is structurally incomplete. */
  shareIncomplete: 'share/incomplete',
  /** The read or write of a plugin-owned file failed. */
  storageFailure: 'storage/failure',
  /** A persisted file could not be parsed and was quarantined. */
  storageCorrupt: 'storage/corrupt',
  /** The operation was rejected because the caller sent invalid input. */
  invalidInput: 'input/invalid',
} as const

export type ManagerErrorCode =
  (typeof ManagerErrorCode)[keyof typeof ManagerErrorCode]

/** A domain failure carrying a stable code plus optional diagnostics. */
export class ManagerError extends Error {
  readonly code: ManagerErrorCode
  readonly details: readonly { code: string; message: string; path?: string; detail?: string }[]

  constructor(
    code: ManagerErrorCode,
    message: string,
    details: readonly { code: string; message: string; path?: string; detail?: string }[] = [],
  ) {
    super(message)
    this.name = 'ManagerError'
    this.code = code
    this.details = details
  }
}

/** Project any thrown value into a wire-safe failure. */
export function toFailure(error: unknown): {
  code: string
  message: string
  details?: readonly { code: string; message: string; path?: string; detail?: string }[]
} {
  if (error instanceof ManagerError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details.length === 0 ? {} : { details: error.details }),
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { code: 'internal/error', message }
}
