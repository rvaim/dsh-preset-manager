# DSH preset editor model

This editor follows the installed DSH contracts rather than treating a preset as a single prompt string.

## Authoritative references

These references are distributed with DSH. Package names and document sections
are used here so the references remain useful across installation paths and
operating systems.

- `@deepseek-ai/dsh-agent-preset`, declaration configuration: required `id` and `plugins`; optional `name`, `description`, `order`. A declaration-row ID and the session's preset ID have different meanings.
- `@deepseek-ai/dsh-agent-preset`, the bundled `cordis-composition-reference` skill: nested group entry lists, complete configuration replacement, conditional `disabled`, service isolation and deferred `!!js` evaluation.
- `@deepseek-ai/dsh-persona`, configuration: prefix and suffix are separate templates. `complete` and `includeRuntimeContext` affect assembly and must survive ordinary text edits.
- `@deepseek-ai/dsh-agent-preset-registry`, runtime and Remote APIs: definitions are composed plugin trees; the official read Remote is read-only. This manager uses its own repository and the registry's runtime registration method.
- `@deepseek-ai/dsh-system-prompt`, assembly model: plugin sections, templates, runtime context and tool schemas are separate inputs. A static prefix/suffix editor is not a preview of the final model request.

## Editing contract

1. Preset information includes stable ID, display name, description and roster order. Ordinary saves retain the ID; use Fork to create a new identity.
2. Prompt editing switches prefix and suffix through tabs over the same draft. It recursively locates Persona entries and lets the user select an exact path when several declarations exist. It never merges them or moves them out of their groups.
3. A preset can also contain prompt text in other plugins, for example `plan-mode.config.section`. The Plugins & tools page exposes these complete entries rather than pretending Persona is the entire prompt.
4. The plugin tree supports root and nested additions, group creation, removal and sibling ordering. Every entry exposes its complete YAML, including `config`, `disabled`, `inject`, `intercept`, `isolate` and unknown keys. Conditional expressions remain expressions; parsing never evaluates them.
5. The full YAML page edits the whole preset document. Metadata and the entire plugin tree share the same draft as the structured views. Invalid input stays visible and prevents saving or switching away until corrected or explicitly discarded.
6. A partially entered plugin row counts as unsaved work. Selection changes, mode switches and save cannot silently discard it. Successful save persists and registers the complete definition. Existing Agents retain their prior runtime revision; new Agents use the updated definition.
7. `complete: true` keeps only the prefix in system-prompt rendering. Its suffix can be edited and stored but is visibly described as inactive. The removed replacement-mode switch is not reintroduced; advanced behavior stays in the actual plugin configuration.

## Actions and feedback

- **Fork / 派生** in the viewer creates an independent managed preset with a Host-assigned free ID. It stays on the grid.
- **Copy / 复制** writes the complete share configuration to the clipboard. It does not create a preset or open a window.
- The originating button shows pending, completed or retry feedback. Ordinary action feedback never renders the large page banner. Startup and editor validation failures retain persistent error presentation where appropriate.
- Copy success is reported after the browser write resolves. Scope and activation errors do not masquerade as successful saves.

## Verification boundary

Domain tests cover exact-path nested editing and preservation of expressions/unknown fields. Real Client/Host entry tests cover draft synchronization, persistence, identity protection, Fork/Copy behavior and failed-input recovery. These checks do not establish a visual or keyboard-focus verdict for an unopened browser page.
