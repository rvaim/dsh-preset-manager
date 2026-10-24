# Preset Manager design

The visual authority is DSH's native settings vocabulary. The management
surface uses compact horizontal rows, one preset per row, with readable
purposes and aligned actions. It remains inside the existing Settings section.

- Use the host system font. Page title 15px/600; row title 13px/600; purpose
  12px with 1.6 line height; metadata and controls 10.5–12px.
- Use `--dsw-alias-label-primary` and `--dsw-alias-label-secondary` for text;
  `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1` and
  `--dsw-alias-bg-layer-2` for surfaces; `--dsw-alias-border-l1/l2` for edges.
- Filled controls use primary-label fill and base-background text, so both
  sides invert together. Hover/pressed mix those two values. No fixed white
  foreground or brightness filter. Status colors remain semantic host tokens.
- Each group is one list with fine row separators and 12px row padding. Names
  and IDs align left, full descriptions occupy the middle, and actions/switches
  align right. Narrow containers stack text or wrap actions within the same row;
  never return to a multi-column card grid. Descriptions are not truncated.
- Groups read Built-in, Custom and Third-party. Healthy registration need not
  repeat on every row; default and failure states remain visible.
- Fork / 派生 lives in the read-only viewer and creates an independent preset. Copy / 复制
  writes the share configuration to the clipboard. These are separate actions.
- Feedback stays on the originating control: spinner while pending, check/label
  after success, retry on failure. No top-of-page banner for these actions.
- The editor follows DSH's real metadata + plugin-tree structure: name,
  description, order and stable identity; Persona prefix and suffix; nested
  plugins/groups; complete preset YAML. Prefix is not the entire system prompt.
- Prefix and suffix use tabs in the same editing area, including nested Persona
  declarations selected by exact path. Other plugin prompt sections are edited
  in their entries. Preserve complete/includeRuntimeContext and all unknown keys;
  complete=true clearly states that suffix is stored but inactive.
- The plugin tree supports add/remove/group/sibling order and literal enablement.
  Conditional disabled expressions stay intact. Complete row YAML exposes
  config/inject/intercept/isolate/unknown fields without evaluating !!js.
- Invalid entry/full-document input remains visible, is treated as unsaved work,
  and blocks save or navigation until corrected or explicitly discarded.
- Buttons carry keyboard focus, disabled and pressed states; icon-only actions
  have accessible names. Footers wrap at narrow widths and coarse-pointer
  controls use at least 40px height.

- The list stays mounted while a modal is open. Rows open read-only View and
  editable Edit dialogs independently; Edit never requires opening View first.
  Closing returns to the same list position. Save/Cancel live in a fixed footer;
  save/delete/discard each open an independent confirmation dialog. Browser-native dialog handles
  modal focus; Escape is contained and focus returns to the triggering control.

Verification: source review and automated row + real Client/Host entry checks.
Current browser state can be queried through the plugin's read-only Inspect
provider. Rendered visual comparison across themes and widths requires the
connected settings page; data readiness alone is not visual verification.

- Editor windows are centered and bounded at 1040×720px, fitting smaller viewports;
  confirmation windows are bounded at 440px. Footer controls never morph in place.
- YAML uses a real CodeMirror surface with line numbers, syntax tokens, folding
  and 2-column indentation guides. Do not replace this with a plain textarea.
- Plugin tree controls share a grid alignment; icon/name/package columns and
  ancestor/last-child lines make nesting explicit without relying on whitespace.

- Import has one YAML editor for editing and preview. IDs are edited in that
  document; do not add a separate identity input or duplicate code preview.
- Keep import blockers visible as compact inline text. Group nonblocking risks
  and notes behind one collapsed count summary using native details/summary.
- Prioritize the editor's available height: source actions share a row, metadata
  stays compact, and warning descriptions do not become large bordered panels.

- Enablement switches appear only on plugin-provided and managed presets. The
  switch state persists; disabled rows remain viewable and manageable. Native
  and third-party presets stay read-only. Change the DSH default before disabling
  its row. Pending/error feedback belongs to the clicked row.
