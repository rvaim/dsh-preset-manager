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
    "subtitle": "Manage presets, prompts and plugin compositions. Fork creates a copy; Copy writes to the clipboard."
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
    "default": "DSH default",
    "disabled": "Disabled"
  },
  "toggle": {
    "enableLabel": "Enable {name}",
    "disableLabel": "Disable {name}",
    "defaultHint": "Choose another DSH default preset before disabling this one."
  },
  "ownership": {
    "managed": "This plugin",
    "builtin": "Built-in",
    "thirdParty": "Third-party"
  },
  "list": {
    "heading": "Presets",
    "summary": "{total} presets · {managed} custom",
    "emptyTitle": "No custom presets yet",
    "emptyBody": "Copy an existing preset as a starting point, or import a shared configuration. Built-in presets are never modified.",
    "emptyActionClone": "Copy a preset",
    "emptyActionImport": "Import a preset",
    "columnPreset": "Preset",
    "columnState": "State",
    "columnPlugins": "Plugins",
    "columnActions": "Actions",
    "loadFailedTitle": "Could not read the preset list",
    "loadFailedBody": "The Host interface did not respond. Confirm the plugin is enabled, then retry.",
    "builtinGroup": "Built-in",
    "customGroup": "Custom",
    "thirdPartyGroup": "Third-party",
    "customHint": "Fork an independent preset from View, or import a file. Custom presets can be edited directly.",
    "noDescription": "No description yet. Add one when editing this preset."
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
    "purge": "Clear data",
    "viewConfig": "View",
    "fork": "Fork",
    "copy": "Copy"
  },
  "editor": {
    "heading": "Edit preset",
    "tabPersona": "Prompt",
    "tabYaml": "Full YAML",
    "sharedDraft": "Both editors share one draft; switching keeps your changes.",
    "name": "Name",
    "description": "Description",
    "prefix": "Prefix prompt",
    "suffix": "Suffix prompt",
    "noPersonaRow": "No Persona entry exists. Entering a prefix or suffix adds one.",
    "yamlHeading": "Complete preset document: metadata and plugin composition",
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
    "saveSucceeded": "Saved and registered \"{name}\"",
    "unsavedWarning": "You have unsaved changes. Discard them?",
    "keepEditing": "Keep editing",
    "discardChanges": "Discard and close",
    "prompt": "Prompt",
    "promptPlaceholder": "Edit this preset’s prompt here.",
    "tabPlugins": "Plugins & tools",
    "order": "Order",
    "stableId": "Stable preset ID; ordinary saves keep its identity",
    "personaEntry": "Select persona entry",
    "personaScope": "Edit Persona templates here. Other prompt sections come from plugins.",
    "otherPromptSections": "Other prompt sections & plugin configuration",
    "dynamicTemplate": "This is a dynamic expression. Edit it in the plugin entry or full YAML.",
    "suffixInactive": "This configuration uses only the prefix as its system prompt. The suffix can be saved but is not rendered.",
    "prefixTab": "Prefix",
    "suffixTab": "Suffix",
    "discardTitle": "Discard unsaved changes",
    "saveTitle": "Confirm save",
    "saveBody": "Save changes to \"{name}\"? New sessions use the updated preset; existing sessions retain their current revision.",
    "backToEdit": "Back to editing",
    "changeSummary": "Metadata: {metadata}. Plugins: {added} added, {changed} changed, {removed} removed."
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
    "succeeded": "Copied as \"{name}\"",
    "copySuffix": "copy"
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
    "copyShare": "Export to clipboard",
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
    "idConflictBody": "This ID is already in use. Edit the preset id directly in the YAML above.",
    "newIdLabel": "Preset ID",
    "risksTitle": "Risks and compatibility",
    "diagnosticsSummary": "Risks and notes · {count}",
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
  },
  "builtin": {
    "standard-efficient": {
      "name": "Standard Efficient",
      "description": "An adaptive, efficient coding agent based on DSH Standard."
    },
    "codex-original": {
      "name": "Codex Original",
      "description": "An experimental preset using the unmodified public base prompt from OpenAI Codex."
    },
    "redteam-mode": {
      "name": "Red Team Mode",
      "description": "Red-team exercise mode: intent normalization, 25 domain-routing rules, deterministic output slots, and output self-checks."
    },
    "standard": {
      "name": "Standard mode",
      "description": "Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed."
    },
    "ptc": {
      "name": "PTC mode",
      "description": "Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results."
    },
    "minimal": {
      "name": "Minimal mode",
      "description": "The agent uses a terminal and image reading, with context compaction. Useful for testing and comparing its basic performance."
    },
    "cordis": {
      "name": "Creator mode",
      "description": "Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode."
    }
  },
  "feedback": {
    "forking": "Forking",
    "forked": "Forked",
    "forkHint": "Create an independent copy of this preset",
    "copying": "Copying",
    "copyHint": "Copy the complete share configuration to the clipboard"
  },
  "composition": {
    "package": "Plugin package",
    "addPlugin": "Add plugin",
    "addGroup": "Add group",
    "group": "Group",
    "disabled": "Disabled",
    "conditional": "Conditional",
    "empty": "Add plugins or groups to compose this preset.",
    "moveUp": "Move up",
    "moveDown": "Move down",
    "enable": "Enable",
    "disable": "Disable",
    "remove": "Remove entry",
    "entryHint": "Edit the complete entry YAML, preserving config, disabled, inject, intercept, isolate and unknown fields. A group’s config is its child entry list.",
    "entryYaml": "Selected plugin entry YAML",
    "oneEntry": "This area must contain exactly one plugin or group entry.",
    "root": "Root",
    "addTarget": "Add to: {target}"
  }
}
