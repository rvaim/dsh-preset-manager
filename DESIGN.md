# Preset Manager design

The user-pinned authority is DSH's native Agent Presets settings page: grouped
cards with readable purposes, restrained borders and footer actions. This
plugin remains inside the existing Settings section.

- Use the host system font. Page title 15px/600; card title 15px/600; purpose
  13px with 1.7 line height; metadata and controls 11–12px.
- Use `--dsw-alias-label-primary` and `--dsw-alias-label-secondary` for text;
  `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1` and
  `--dsw-alias-bg-layer-2` for surfaces; `--dsw-alias-border-l1/l2` for edges.
- Filled controls use primary-label fill and base-background text, so both
  sides invert together. Hover/pressed mix those two values. No fixed white
  foreground or brightness filter. Status colors remain semantic host tokens.
- Cards have a 16px radius, 16px content padding and a fine separator above
  footer actions. The grid is two equal columns with 12px gaps and collapses
  only below a 380px content-container width. Descriptions wrap without truncation.
- Groups read Built-in, Custom and Third-party. Healthy registration need not
  repeat on every card; default and failure states remain visible.
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

- The grid stays mounted while a modal is open. Cards open read-only View and
  editable Edit dialogs independently; Edit never requires opening View first.
  Closing returns to the same grid position. Save/Cancel live in a fixed footer;
  save/delete/discard each open an independent confirmation dialog. Browser-native dialog handles
  modal focus; Escape is contained and focus returns to the triggering control.

Verification: source review and automated card + real Client/Host entry checks.
Current browser state can be queried through the plugin's read-only Inspect
provider. Rendered visual comparison across themes and widths requires the
connected settings page; data readiness alone is not visual verification.

- Editor windows are centered and bounded at 1040×720px, fitting smaller viewports;
  confirmation windows are bounded at 440px. Footer controls never morph in place.
- YAML uses a real CodeMirror surface with line numbers, syntax tokens, folding
  and 2-column indentation guides. Do not replace this with a plain textarea.
- Plugin tree controls share a grid alignment; icon/name/package columns and
  ancestor/last-child lines make nesting explicit without relying on whitespace.
