# Preset management surface

Mode: Operate. The surface lives in DSH Settings and manages runtime presets.

## Direction contract

THESIS: Match the user's native Agent Presets screenshots: a reader must understand what a preset does before copying or editing it.

OWN-WORLD: Inherit DSH typography, semantic theme tokens, fine borders and native card spacing. Foreground/background pairs must switch together across light and dark themes. No independent brand palette.

STORY: Read built-in purposes; Fork the chosen preset and stay on the grid; Copy writes to clipboard; open Edit only when explicitly requested. Import, export, history and data management remain available.

FIRST VIEWPORT: Page heading and short task introduction; compact import/refresh actions; Built-in heading and two-column cards with name, default marker, ID and full description. Custom cards follow. The grid stays mounted behind independent View/Edit native dialogs, opened directly from card actions. Closing restores the same grid seat. At very narrow container widths the grid becomes one column and footer actions wrap.

FORM: User-pinned native DSH card layout, inherited from the supplied screenshots. Fork creates a duplicate with Host-assigned identity; Copy only writes clipboard. Both actions report progress/completion in their own button, with no success banner. Editing is a separate explicit action. Its compact centered workspace covers metadata, both prompt templates, nested plugins/groups and full document YAML, preserving real DSH composition semantics and exposing no replacement-mode switch. No source-picker form. Seed: none (user-pinned native reference; launcher unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

REFINEMENT: YAML is a CodeMirror editor with syntax colors, line numbers and
indent guides; tree nesting has connector lines and fixed text/icon alignment.
Fork belongs in View. Prefix/Suffix share one tabbed editor area. Delete,
discard and save confirmations are separate native dialogs, never footer swaps.
