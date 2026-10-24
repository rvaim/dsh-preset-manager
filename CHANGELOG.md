# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-10-25

### Added

- Ship `redteam-mode` / 红队模式 as a complete local share document, including
  its independent plugin tree, nested scopes, platform conditions, disabled
  tools and order 10. Preserve that composition instead of deriving it from
  Standard.
- Add Standard Efficient's judgment model to the red-team Persona by addition
  only: an effort ladder (light / standard / deep / critical) with a five-step
  decision chain and a stop-when-delivered threshold, inserted before the first
  original section. The user-supplied Persona stays byte-identical; loading
  fails unless removing the inserted section reproduces it exactly.
- Reuse bundled-preset read-only access, copy/derive operations and persisted
  enablement. Record and verify document and Persona SHA-256 digests.
- Add bounded read-only per-preset diagnostics for registration, activation
  health, composition counts and the current Persona digest.

### Tests

- Verify the complete bundled YAML, offline loading, exact runtime definitions,
  disabled/read/copy/re-enable lifecycle and actual tarball resources.

## [0.4.0] - 2026-10-25

### Added

- Persist enable/disable choices for plugin-provided and managed presets.
  Disabled definitions remain visible, readable, copyable and editable where
  owned; editing or restoring them preserves their disabled state.
- Use the same enablement operation from row switches and the deferred
  `preset_manager_set_enabled` agent tool. Preserve the current DSH default
  until the user chooses a replacement in DSH settings.

### Changed

- Replace the two-column cards with compact, one-preset-per-row lists: aligned
  identity, complete description, actions and enablement controls, with responsive
  wrapping inside each row. Keep the list mounted behind independent dialogs.

### Tests

- Exercise toggle ownership, persistence and restoration, disabled-definition
  editing and copying, request ordering, transport validation and row controls.

## [0.3.4] - 2026-10-24

### Changed

- Replace large import warning panels with visible inline blockers and a single
  collapsed risk/note summary. Native disclosure preserves complete details and
  keyboard operation without occupying the initial viewport.
- Group preset metadata, remove redundant format chrome, put source actions on
  one row and allocate the available dialog height to the sole YAML editor.
- Preserve fixed footer actions and responsive overflow for small windows or
  expanded diagnostic details.

### Tests

- Cover collapsed-by-default diagnostics, complete message preservation, visible
  blockers, empty states and suppression of stale feedback during validation.

## [0.3.3] - 2026-10-24

### Fixed

- Use the original YAML editor as the only import editing and preview surface.
  Remove the separate ID field and duplicate read-only composition editor.
- Resolve conflicts by editing the preset ID in that YAML. Revalidate edited
  text after preview, clear stale diagnostics immediately and confirm the exact
  text that was validated, without a separate identity override.

## [0.3.2] - 2026-10-24

### Fixed

- Clear import previews and notices on close, reopen and source replacement;
  ignore late preview responses after cancellation or newer requests.
- Show ID validation once beside one populated Preset ID input. Revalidate the
  edited ID through the Host without blocking continued typing, and remove the
  duplicate conflict error from the import validator.
- Confirm only the current successfully previewed text and identity. Reset the
  acknowledgement after edits and block confirmation while validation is pending.

### Tests

- Cover import cancellation, request ordering, stale approvals, ID replacement
  and retry, plus actual Gateway preview/confirm of a renamed bundled preset.

## [0.3.1] - 2026-10-24

### Fixed

- Keep import Cancel, Preview and Confirm actions in the dialog footer, outside
  the scrolling content. Remove the nested panel that clipped its own footer
  when long import previews exceeded the dialog height.
- Use the shared CodeMirror YAML editor for pasted/file input and read-only
  composition previews, including syntax highlighting, line numbers, folding
  and indentation guides. Bound both code regions so long documents scroll
  inside the editor, and preserve the empty input hint.

## [0.3.0] - 2026-10-24

### Added

- Ship read-only `standard-efficient` (标准增强 / Standard Efficient) and
  `codex-original` (Codex 原版 / Codex Original). Each activation derives the
  complete composition from the running DSH Standard declaration, changing only
  identity metadata and Persona Prefix, preserving all other configuration.
- Vendor the complete, unmodified OpenAI Codex base prompt at commit
  `970111f6cb62cc02fe36a82ea7d71b37a2889c97`, with SHA-256 provenance, Apache-2.0
  LICENSE and upstream NOTICE. Load local packaged resources only and reject
  checksum mismatches or template delimiters in the upstream original.
- Own bundled registration separately from user data, preserving existing ID
  collisions and cancelling startup/withdrawing registrations on unload.

### Fixed

- Align `engines.dsh` with the current DSH SDK used by the Gateway and entry
  checks, allowing the verified build to activate on the current desktop runtime.

### Tests

- Verify the complete Standard tree, read-only/fork lifecycle, local resource
  integrity and actual unpacked npm tarball contents.

## [0.2.3] - 2026-10-24

### Fixed

- Client readiness now requires the first valid Host snapshot, rather than only
  local namespace installation. Bundle replacement can temporarily withdraw the
  Host Service while the Client namespace already exists. The bounded handshake
  waits only for the exact service-unavailable fault, reuses its initial snapshot
  and preserves explicit retry; method/schema/carrier errors are shown directly.
- Handshake waits belong to the namespace consumer and are cancelled on unload.
- Preserve the original license notices for every dependency bundled into the
  browser artifact; use portable package references in the editor design notes.

### Tests

- Exercise a real Gateway Service withdrawal/late publication, immediate method
  failure and explicit readiness retry in a dependency-restricted Client fiber.

## [0.2.2] - 2026-10-24

### Changed

- Replace plain YAML textareas with a shared CodeMirror editor: syntax colors,
  line numbers, folding, undo history and indentation guides, with theme-derived
  colors and read-only configuration during saves.
- Align plugin controls and tree text, adding continuous ancestor branches and
  last-child connectors.
- Use compact centered editor dialogs and Prefix/Suffix tabs. Fork now belongs
  to the viewer, rather than every grid card.
- Delete, discard and save use independent confirmation dialogs. The parent
  editor footer stays fixed; nested dialogs restore focus only to active owners.

### Fixed

- Protect complete dynamic Persona config expressions as well as individual
  expression fields from misleading literal edits.

### Tests

- Cover actual YAML syntax classes, indentation and blank-line scopes, tree
  connectors/alignment, viewer-only Fork, separate confirmations and dynamic
  configuration protection.

## [0.2.1] - 2026-10-24

### Tests

- Add a read-only connected-browser check that confirms the running Host returns
  full preset documents, reporting field names and composition counts without
  exposing prompt content or modifying data.

## [0.2.0] - 2026-10-24

### Changed

- Use Fork for creating independent presets and Copy for clipboard sharing.
  Pending, completed and retry feedback stays on the originating button with no
  success banner. Reduced-motion preferences are respected.
- Edit the actual DSH structure: preset metadata, both Persona templates,
  path-selected nested Persona declarations and the complete Cordis plugin tree.
- Add/remove plugin entries and groups, move siblings, toggle literal enablement
  and edit complete entry YAML. Preserve scopes, conditional disabled values,
  inject/intercept/isolate, !!js expressions and unknown configuration.
- Full-document YAML includes identity, metadata and all plugin entries. Reject
  accidental identity changes and retain invalid drafts until corrected.
- Document the difference between Persona templates and the assembled runtime
  system prompt; existing complete/runtime-context flags remain untouched by
  ordinary text edits.

### Tests

- Add nested composition mutation, repeated Persona, dynamic-expression and
  local-feedback regressions. Exercise complete YAML metadata synchronization,
  nested plugin persistence and stable-identity protection through the real
  Client/Host entry path.

## [0.1.8] - 2026-10-24

### Changed

- Copy now only creates a duplicate and refreshes the grid. Opening an editor
  requires the user's separate Edit action.
- Export writes the share configuration directly to the clipboard, with success
  reported only after the write resolves. Remove the export-window component.
- Make editing prompt-first: near-viewport dialog dimensions, compact metadata,
  a dominant prompt textarea, and no replacement-mode checkbox. Preserve the
  source's existing composition flags when editing text.
- Synchronize prompt edits into configuration YAML when switching modes; preserve
  invalid YAML input rather than overwriting it on a mode switch.

### Tests

- Cover grid-only copying, direct clipboard success/rejection, the removed
  checkbox, prompt persistence and round-trip editor-mode behavior.

## [0.1.7] - 2026-10-23

### Changed

- Keep the two-column grid mounted as the management home, collapsing only for
  very narrow containers. View and Edit are separate dialogs opened directly
  from card actions; copying opens the new copy's editor without a detail-page hop.
- Use native modal dialogs with contained Escape, browser focus management,
  return focus, independent scrolling and fixed Save/Cancel controls.
- Protect unsaved drafts before closing. Failed saves remain actionable, and
  closing a dialog invalidates late reads. Pending or invalid YAML cannot save.

### Tests

- Assert persistent grid identity, direct editing and separate viewer/editor
  content. Exercise unsaved draft tracking, actual Host save, retained grid
  snapshots and late responses after closing.

## [0.1.6] - 2026-10-23

### Changed

- Follow DSH's native Agent Presets page with two-column cards grouped by
  built-in, custom and third-party presets. Cards show the complete purpose
  description and keep their management actions in the footer; narrow content
  containers use one column.
- Supply the same localized names and short descriptions as DSH for shipped
  presets whose registry metadata omits them. Authored names and descriptions
  take precedence and are preserved when making a copy.
- Replace the source/ID form with a contextual “Copy and edit” action. It copies
  the clicked preset, generates an unused ID and display name, and opens the
  editable copy. Duplicate clicks are ignored while the operation is pending.

### Fixed

- Filled buttons and text selection now pair theme foreground and background
  tokens rather than assuming a fixed white foreground on a theme-dependent
  brand fill. Hover and pressed states preserve the same pairing.
- Card actions remain disabled while a mutation is pending, and icon-only actions
  carry accessible names.

### Tests

- Automatic copy identities are allocated in the Host's serialized creation
  path, so concurrent pages cannot overwrite an existing copy. Explicit clone
  IDs that already exist are refused rather than treated as edits.
- Namespace replacement releases an in-flight copy's busy state. An editor read
  failure returns to the list and reports that the copy was already created.
- Add card source/description/action regressions and full Client/Host checks for
  direct copying, source preservation, repeated copies, concurrent callers,
  duplicate clicks and recovery after editor or namespace failures.

## [0.1.5] - 2026-10-23

### Fixed

- Mounting a namespace does not inject its Service into the mounting plugin.
  The Client now consumes `remote.presetManager` from a child fiber declaring
  that dependency, fixing `cannot get property "remote.presetManager" without inject`.
- Namespace withdrawal clears the page API and snapshot. Each binding has one
  stable API object, and late list responses cannot revive a disposed binding.
- Gateway errors with object-shaped details no longer crash error rendering.
  API-dependent overlays stop rendering while their namespace is unavailable.
- Page styles are rendered with the React page and disposed on unmount.

### Tests

- Reproduce the injection failure from a real plugin fiber rather than an
  unrestricted root Context. Verify the complete packed Client and Host entries,
  including initial list loading, clone/editor/delete, carrier failure/retry,
  disable/enable, late responses and cancellation during activation.
- Add an optional read-only Client Inspect provider, `@rvaim/dsh-preset-manager`,
  exposing version, mount/load status, preset count and mounted page count so
  the connected browser can be verified independently of offline tests.

## [0.1.4] - 2026-10-23

### Fixed

- The settings page could not mount any Host endpoint because the remote method
  `presetManager/remove` collided with `RemoteNamespaceService.remove`, which
  DSH reserves for namespace cleanup. The wire endpoint is now `deletePreset`;
  its descriptor maps to the existing Host `remove` implementation, and the
  Client adapter calls the new endpoint.

### Tests

- Pin Cordis, Gateway and Typert Registry development dependencies to the tested
  runtime. The binding verifier now mounts the complete descriptor set in real
  Client/Host Contexts and exercises RPC, strict input rejection and disposal.
  It reproduces the old endpoint's exact rejection before testing the fix.
- Verify the current build by default, with an explicit dist-directory option
  for checking packed or installed artifacts. Verification no longer silently
  tests a hardcoded desktop profile instead of the release being built.

## [0.1.3] - 2026-10-23

### Fixed

- **Every Remote call failed with `gateway/binding-invalid`.** The gateway
  validates a Remote binding with `typertRemote.service === original`, where
  `original` is the object published under the service key. The face was spread
  into a second object while `service` still pointed at the first one, so the
  identity check failed and the page reported "Host interface not ready" for a
  reason that looked like a transport fault. The binding now attaches to the
  object that is actually provided, and a regression test pins the invariant.
- **The page rendered locale keys instead of text** (`action.import`,
  `common.refresh`, …). DSH's locale service resolves a key with a flat
  `dict[key]` lookup; it does not walk nested objects. The dictionaries are now
  flattened before registration, and a test asserts both languages carry the
  same flat key set with the placeholders the page interpolates.

### Changed

- Complete visual and ergonomic redesign following `/impeccable` Operate mode:
  - Row list layout with clear metadata and status chips instead of uniform card grids.
  - Consistent 16px geometric outline icon system.
  - Clean single-panel container with hairline borders and subtle depth.
  - Action-oriented button labels and helpful error descriptions.
  - Themed selection, code scrollbar, and focus rings.

## [0.1.2] - 2026-10-23

Internal release with initial binding and locale fixes.

## [0.1.1] - 2026-10-23

Internal build used while diagnosing 0.1.2; not published separately.

## [0.1.0] - 2026-10-23

First public release.

### Added

- **Runtime agent-preset registration.** Presets are registered through
  `ctx.agentPresets.register()` and withdrawn through the returned disposer.
  DSH's own configuration files are never read or written for preset data.
- **Settings page** at Settings → Presets (`settings.section`, order 25) with a
  list showing ownership, registration state, and activation health for every
  preset the registry publishes.
- **Copy any readable preset.** Built-in, third-party, and managed presets can
  all be copied. The copy preserves the complete composition: persona, every
  plugin row, groups, `isolate` realms, `disabled` conditions, `!!js`
  expressions, and unknown fields.
- **Persona editor.** Edits `prefix`, `suffix`, and `complete` (defaulting to
  `false`) as a projection over the preset's plugin rows, so other plugins'
  configuration is never touched.
- **Advanced YAML editor.** Shares one draft with the persona form, preserving the
  Cordis entry-list dialect. Switching editors never loses a change.
- **Validation and diff before save.** Structural checks, plugin availability
  checks, and a semantic diff are shown before a save is committed.
- **History and restore.** Every superseded revision is archived and can be
  restored; restoring archives the version it replaces, so it is itself undoable.
- **Versioned share format** (`kind: dsh-agent-preset-share`, `formatVersion: 1`)
  with export to clipboard, YAML download, and a preview area.
- **Import with preview.** Parsing, validation, compatibility checks, and risk
  collection happen before anything is written or registered. Unknown format
  versions are refused before the payload is read.
- **Sensitive-data warnings.** Credential shapes and machine-local absolute paths
  are reported before sharing. They are reported, never redacted.
- **Explicit data cleanup.** A confirmed "clear all plugin data" action writes a
  backup first. Uninstall deliberately keeps the data directory.
- **Startup restore.** Stored presets are re-registered on every launch. One
  unusable file is reported and skipped; it never blocks the others or DSH
  startup.
- **Atomic persistence.** Writes go through a temporary file, are re-parsed to
  prove completeness, then renamed. Corrupt files are quarantined, not deleted.
- **Serialized mutations** with revision-based conflict detection, so two open
  tabs cannot silently overwrite each other.

### Notes

- Verified against DSH V0.2.1-rc.2 on Windows.
- `AgentPresetRegistry` has no replace operation, so replacement is
  unregister-then-register with compensation. This is not atomic, and the
  documentation says so.
- `register()` resolves even when activation fails; health is always read back
  from the registry roster instead of being inferred from the absence of a throw.

[0.1.0]: https://github.com/rvaim/dsh-preset-manager/releases/tag/v0.1.0
