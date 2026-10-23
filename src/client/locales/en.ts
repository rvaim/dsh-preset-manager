/**
 * EN dictionary for the preset manager settings page.
 *
 * Authored as a tree for readability;  flattens it into the
 * flat key map DSH's locale service actually reads. `locale/en.json`
 * mirrors this content for plugin-manager display metadata.
 */
export const en: Record<string, unknown> = {
  "meta": {
    "title": "Agent Preset Manager",
    "description": "Register and manage agent presets at runtime without editing any DSH configuration file"
  },
  "nav": "Presets",
  "page": {
    "title": "Agent Preset Manager",
    "subtitle": "Presets register through the runtime API; DSH configuration files stay untouched."
  },
  "common": {
    "loading": "Reading presets…",
    "working": "Working…",
    "cancel": "Cancel",
    "close": "Close",
    "save": "Save",
    "refresh": "Refresh",
    "back": "Back to list",
    "retry": "Retry",
    "dismiss": "Dismiss",
    "confirm": "Confirm",
    "copy": "Copy",
    "copied": "Copied",
    "none": "None",
    "unnamed": "Unnamed preset"
  },
  "phase": {
    "starting": "Starting",
    "ready": "Ready",
    "degraded": "Some presets did not load",
    "stopping": "Stopping",
    "stopped": "Stopped"
  },
  "state": {
    "registered": "Registered",
    "notRegistered": "Not registered",
    "registering": "Registering",
    "failed": "Registration failed",
    "healthy": "Healthy",
    "broken": "Activation failed",
    "unchecked": "Unchecked",
    "default": "DSH default"
  },
  "ownership": {
    "managed": "This plugin",
    "builtin": "Built-in",
    "thirdParty": "Third-party"
  },
  "list": {
    "heading": "Presets",
    "summary": "{total} presets, {managed} managed by this plugin",
    "emptyTitle": "No custom presets yet",
    "emptyBody": "Copy an existing preset as a starting point, or import a shared configuration. Built-in presets are never modified.",
    "emptyActionClone": "Copy a preset",
    "emptyActionImport": "Import a preset",
    "columnPreset": "Preset",
    "columnState": "State",
    "columnPlugins": "Plugins",
    "columnActions": "Actions",
    "loadFailedTitle": "Could not read the preset list",
    "loadFailedBody": "The Host interface did not respond. Confirm the plugin is enabled, then retry."
  },
  "detail": {
    "backToList": "Back to list",
    "compositionHeading": "Plugin composition",
    "compositionHint": "The complete plugin rows this preset declares, shown read-only.",
    "revisionLabel": "Revision",
    "rowCount": "{count} rows",
    "readOnlyNote": "Built-in and third-party presets can be viewed and copied only.",
    "dataLocation": "Data directory",
    "defaultWarning": "This preset is DSH's current default. Set DSH back to a built-in preset before deleting it, or a new session will reference a preset that no longer exists."
  },
  "action": {
    "view": "View",
    "clone": "Copy",
    "edit": "Edit",
    "editPersona": "Edit Persona",
    "editYaml": "Edit YAML",
    "history": "History",
    "export": "Export",
    "delete": "Delete",
    "restore": "Restore this version",
    "import": "Import",
    "confirmImport": "Confirm import",
    "previewImport": "Preview import",
    "purge": "Clear data"
  },
  "editor": {
    "heading": "Edit preset",
    "tabPersona": "Persona",
    "tabYaml": "Advanced YAML",
    "sharedDraft": "Both editors share one draft; switching keeps your changes.",
    "name": "Name",
    "description": "Description",
    "prefix": "Prefix",
    "suffix": "Suffix",
    "complete": "Replace the built-in prompt",
    "completeHint": "Off by default: the persona adds to the built-in prompt instead of replacing it.",
    "noPersonaRow": "This preset has no persona row. Filling any field adds one.",
    "yamlHeading": "Plugin composition",
    "yamlHint": "Preserves the DSH YAML dialect, !!js expressions, and unknown fields.",
    "yamlErrorTitle": "YAML could not be parsed",
    "validateAndDiff": "Validate and diff",
    "saveAndRegister": "Save and register",
    "diffHeading": "Changes about to be saved",
    "diffMetadata": "Metadata",
    "diffAdded": "Added",
    "diffRemoved": "Removed",
    "diffChanged": "Changed",
    "diffUnchanged": "{count} unchanged",
    "noChanges": "No change detected.",
    "validateFailedTitle": "Validation failed; nothing was saved",
    "saveSucceeded": "Saved and registered \"{name}\""
  },
  "clone": {
    "heading": "Copy preset",
    "source": "Source preset",
    "newId": "New preset ID",
    "newIdHint": "Lowercase letters, digits, dots, underscores, hyphens; must start with a letter or digit.",
    "newIdInvalid": "That ID is not valid",
    "newIdTaken": "That ID is already taken",
    "name": "Display name",
    "nameHint": "Leave empty to use \"<source name> copy\".",
    "submit": "Create copy",
    "succeeded": "Copied as \"{name}\""
  },
  "history": {
    "heading": "History",
    "hint": "Restoring registers that revision as current. The current one is archived first, so restoring is itself undoable.",
    "emptyTitle": "No history yet",
    "emptyBody": "Previous versions appear here after you save a change.",
    "columnSavedAt": "Saved at",
    "columnPreset": "Revision",
    "columnPlugins": "Plugins",
    "columnOrigin": "Origin",
    "reasonCreate": "Created",
    "reasonSave": "Saved",
    "reasonImport": "Imported",
    "reasonRestore": "Restored",
    "restored": "Revision restored"
  },
  "share": {
    "heading": "Export and share",
    "risksTitle": "Review before sharing",
    "risksHint": "The following may contain secrets or local paths. The plugin reports them and never rewrites your preset.",
    "noRisks": "No obvious secrets or local paths detected.",
    "copyShare": "Copy share text",
    "download": "Download YAML",
    "manualHeading": "Share text",
    "manualHint": "Select and copy here if the button failed.",
    "copySucceeded": "Copied to clipboard",
    "copyFailedTitle": "Copy failed",
    "copyFailedBody": "The browser denied clipboard access. Select the text below and copy it manually.",
    "downloadStarted": "Download started"
  },
  "import": {
    "heading": "Import preset",
    "pasteLabel": "Paste share text or YAML",
    "readClipboard": "Read clipboard",
    "pickFile": "Choose file",
    "clipboardFailed": "Could not read the clipboard; paste the text manually.",
    "nothingApplied": "Preview writes no file and registers no preset.",
    "previewHeading": "Import preview",
    "idConflictTitle": "ID already in use",
    "idConflictBody": "That ID exists. Use the suggested ID below or another free one.",
    "newIdLabel": "Use this ID instead",
    "risksTitle": "Risks and compatibility",
    "warningsTitle": "Notes",
    "errorsTitle": "Cannot import",
    "compositionHeading": "Composition that would be imported",
    "acknowledge": "I have read the above and confirm the import",
    "blockedHint": "Blocking problems remain; resolve them to continue.",
    "succeeded": "Preset imported and registered",
    "emptyText": "Paste something first"
  },
  "remove": {
    "heading": "Delete preset",
    "body": "Delete \"{name}\"? The final revision stays in history and can be restored.",
    "confirm": "Delete",
    "defaultRiskTitle": "This is DSH's default preset",
    "defaultRiskBody": "This plugin never changes DSH's own default-preset setting. After deletion a new session may reference a preset that no longer exists; set DSH back to a built-in preset.",
    "defaultRiskConfirm": "I understand; delete anyway",
    "succeeded": "Preset deleted; it can be restored from history"
  },
  "data": {
    "heading": "Plugin data",
    "locationLabel": "Data directory",
    "managedCount": "{count} presets managed by this plugin",
    "keepNote": "Disabling or uninstalling the plugin does not delete these files. Clear them explicitly below when you want to.",
    "purgeHeading": "Clear all plugin data",
    "purgeWarning": "Deletes every preset, history entry, and metadata file under this plugin's directory. It cannot be undone, but a backup is written first.",
    "purgeInstruction": "Type {phrase} to confirm",
    "purgeSucceeded": "Plugin data cleared",
    "purgeButton": "Clear all data"
  },
  "defaultNote": {
    "heading": "About the default preset",
    "body": "This plugin never modifies the default preset DSH persists. Use DSH's own selector to pick a preset registered here; if you make one the default, set it back to a built-in preset before deleting it."
  },
  "diagnostics": {
    "heading": "Diagnostics",
    "copy": "Copy diagnostics",
    "quarantined": "A preset file could not be parsed and was quarantined"
  },
  "error": {
    "notReadyTitle": "Host interface not ready",
    "notReadyBody": "The plugin is still mounting its runtime interface. If this persists, reload the page.",
    "genericTitle": "Operation failed",
    "revisionConflict": "This preset changed in another tab. Reload it before saving.",
    "notFound": "That preset no longer exists."
  }
}
