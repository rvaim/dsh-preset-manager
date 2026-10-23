# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
