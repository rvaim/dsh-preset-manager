/**
 * Page styles.
 *
 * Colors follow the host's semantic tokens. Filled controls pair the primary
 * label with the base background as their inverse foreground in both themes.
 *
 * The visual language is the host's own: a quiet settings surface where the
 * preset list is the content and the chrome recedes. Depth comes from a single
 * hairline border and a soft raised fill, not from stacked shadows or nested
 * cards.
 */
export const STYLES = `
.dshpm {
  --dshpm-radius: 10px;
  --dshpm-radius-sm: 7px;
  --dshpm-gap: 16px;
  display: flex;
  flex-direction: column;
  gap: var(--dshpm-gap);
  container-type: inline-size;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}

/* ---- page header -------------------------------------------------------- */
.dshpm-head { display: flex; align-items: flex-start; gap: 12px; }
.dshpm-head-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dshpm-title { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.dshpm-subtitle { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshpm-head-actions { margin-left: auto; display: flex; gap: 8px; flex: none; }

/* ---- controls ----------------------------------------------------------- */
.dshpm-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dshpm-radius-sm);
  padding: 0 11px;
  appearance: none;
  min-height: 32px;
  height: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.dshpm-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dshpm-btn:active:not(:disabled) { background: var(--dsw-alias-bg-layer-1); }
.dshpm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dshpm-btn--primary {
  background: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
}
.dshpm-btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 88%, var(--dsw-alias-bg-base));
  border-color: transparent;
}
.dshpm-btn--primary:active:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 78%, var(--dsw-alias-bg-base));
}
.dshpm-btn--danger { color: var(--dsw-alias-state-error-primary); }
.dshpm-btn--danger:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-state-error-primary);
}
.dshpm-btn--quiet { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dshpm-btn--quiet:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dshpm-btn--sm { height: 26px; padding: 0 9px; font-size: 11.5px; }

.dshpm :is(button, input, textarea, select, [tabindex]):focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
  border-radius: var(--dshpm-radius-sm);
}

.dshpm-input,
.dshpm-textarea,
.dshpm-select {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
  font-size: 12.5px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dshpm-radius-sm);
  padding: 7px 10px;
  transition: border-color 120ms ease;
}
.dshpm-input:hover, .dshpm-textarea:hover, .dshpm-select:hover {
  border-color: var(--dsw-alias-border-l2);
}
.dshpm-input::placeholder, .dshpm-textarea::placeholder { color: var(--dsw-alias-label-secondary); }
.dshpm-textarea {
  min-height: 132px;
  resize: vertical;
  line-height: 1.6;
}
.dshpm-textarea--code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  min-height: 300px;
  tab-size: 2;
}
.dshpm-input--mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
}

/* ---- fields ------------------------------------------------------------- */
.dshpm-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dshpm-label { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshpm-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dshpm-fields { display: flex; flex-wrap: wrap; gap: 14px; }
.dshpm-fields > .dshpm-field { flex: 1 1 220px; }

/* ---- panels ------------------------------------------------------------- */
.dshpm-panel {
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dshpm-radius);
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}
.dshpm-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dshpm-panel-title { font-size: 12.5px; font-weight: 600; margin: 0; }
.dshpm-panel-hint { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.dshpm-panel-body { padding: 14px; display: flex; flex-direction: column; gap: 14px; }
.dshpm-panel-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
}
.dshpm-panel-foot .dshpm-spacer { flex: 1 1 auto; }

/* ---- toolbar ------------------------------------------------------------ */
.dshpm-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dshpm-toolbar .dshpm-spacer { flex: 1 1 auto; }
.dshpm-count { font-size: 11.5px; color: var(--dsw-alias-label-secondary); }

/* ---- preset cards: follow DSH's native preset section -------------------- */
.dshpm-preset-group { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dshpm-group-title { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dshpm-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dshpm-preset-card {
  display: flex; flex-direction: column; min-width: 0;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px;
  background: transparent; overflow: hidden;
}
.dshpm-preset-card[data-default] { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-label-secondary); }
.dshpm-preset-content { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; }
.dshpm-preset-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; width: 100%; min-width: 0; }
.dshpm-preset-name { margin: 0; font-size: 15px; line-height: 1.45; font-weight: 600; overflow-wrap: anywhere; }
.dshpm-preset-id { margin-left: auto; min-width: 0; max-width: 100%; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dshpm-preset-description { margin: 0; font-size: 13px; line-height: 1.7; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dshpm-default-badge { padding: 2px 7px; border-radius: 999px; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); font-size: 11px; line-height: 1.5; white-space: nowrap; }
.dshpm-preset-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 8px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshpm-preset-actions .dshpm-spacer { flex: 1; }
.dshpm-custom-hint { margin: 0; padding: 16px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
@container (max-width: 380px) {
  .dshpm-preset-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (pointer: coarse) {
  .dshpm-btn { min-height: 40px; }
}

.dshpm-editor-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
.dshpm-dialog-foot .dshpm-spacer { flex: 1; }

/* ---- modal workspace ---------------------------------------------------- */
.dshpm-dialog {
  width: min(780px, calc(100vw - 48px)); max-width: calc(100vw - 24px);
  max-height: min(880px, calc(100dvh - 48px)); padding: 0; margin: auto;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px;
  font: inherit; overflow: hidden;
}
.dshpm-dialog::backdrop { background: color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent); }
.dshpm-dialog-layout { display: flex; flex-direction: column; max-height: min(878px, calc(100dvh - 50px)); }
.dshpm-dialog-head, .dshpm-dialog-foot { display: flex; align-items: center; gap: 8px; flex: none; padding: 14px 18px; }
.dshpm-dialog-head { border-bottom: 1px solid var(--dsw-alias-border-l1); justify-content: space-between; }
.dshpm-dialog-title { margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
.dshpm-dialog-head .dshpm-notice-dismiss { width: 30px; height: 30px; }
.dshpm-dialog-body { padding: 18px; min-height: 0; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 14px; }
.dshpm-dialog-foot { border-top: 1px solid var(--dsw-alias-border-l1); justify-content: flex-end; flex-wrap: wrap; }
.dshpm-dialog-foot .dshpm-discard-message { margin-inline-end: auto; font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
@media (max-width: 480px) {
  .dshpm-dialog { width: calc(100vw - 24px); }
  .dshpm-dialog-head, .dshpm-dialog-foot, .dshpm-dialog-body { padding: 12px; }
}

.dshpm-dialog--editor { width: min(1040px, calc(100vw - 64px)); max-width: calc(100vw - 24px); height: min(720px, calc(100dvh - 64px)); max-height: calc(100dvh - 24px); box-sizing: border-box; }
.dshpm-dialog--confirm { width: min(440px, calc(100vw - 48px)); }
.dshpm-confirm-message { margin: 0; font-size: 13px; line-height: 1.65; }
.dshpm-dialog--editor .dshpm-dialog-layout { height: 100%; max-height: none; }
.dshpm-dialog--editor .dshpm-dialog-head, .dshpm-dialog--editor .dshpm-dialog-foot { padding: 10px 16px; }
.dshpm-dialog--editor .dshpm-dialog-body { flex: 1; padding: 12px 16px; gap: 8px; overflow: auto; }
.dshpm-prompt-editor-layout { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; }
.dshpm-editor-meta { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr) 90px; gap: 12px; flex: none; }
.dshpm-editor-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; }
.dshpm-editor-id { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
.dshpm-prompt-region { display: flex; flex: 1; flex-direction: column; gap: 6px; min-height: 0; }
.dshpm-prompt-text { flex: 1; min-height: min(46dvh, 360px); resize: none; font-size: 14px; line-height: 1.7; padding: 12px; }
.dshpm-prompt-tail { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshpm-prompt-tail summary { cursor: pointer; }
.dshpm-prompt-tail textarea { margin-top: 8px; min-height: 90px; max-height: 24dvh; }
@media (max-width: 580px) {
  .dshpm-dialog--editor { width: calc(100vw - 24px); height: min(720px, calc(100dvh - 32px)); }
  .dshpm-editor-meta { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .dshpm-editor-id { display: none; }
}

/* ---- composition editor and action feedback ---------------------------- */
.dshpm-action-btn { min-width: 68px; }
.dshpm-action-btn[data-action-state="success"] { color: var(--dsw-alias-state-success-primary); }
.dshpm-action-btn[data-action-state="error"] svg { animation: dshpm-action-error 200ms ease-out; }
@keyframes dshpm-action-error { from { opacity: .35; } to { opacity: 1; } }
.dshpm-action-btn[data-action-state="error"] { color: var(--dsw-alias-state-error-primary); }
.dshpm-action-btn[data-action-state="success"] svg { animation: dshpm-action-done 220ms ease-out; }
@keyframes dshpm-action-done { from { transform: scale(.65); } to { transform: scale(1); } }
.dshpm-prompt-tabs { background: transparent; padding: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); border-radius: 0; }
.dshpm-prompt-tabs .dshpm-tab { border-radius: 0; border-bottom: 2px solid transparent; font-size: 12px; }
.dshpm-prompt-tabs .dshpm-tab[aria-selected="true"] { border-bottom-color: var(--dsw-alias-label-primary); background: transparent; box-shadow: none; }
.dshpm-persona-picker { max-width: 340px; }
.dshpm-composition-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 14px; flex: 1; min-height: 0; }
.dshpm-composition-tree { display: flex; flex-direction: column; min-height: 0; gap: 10px; border-right: 1px solid var(--dsw-alias-border-l1); padding-right: 12px; }
.dshpm-composition-add { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: center; flex: none; }
.dshpm-composition-add input, .dshpm-composition-add > .dshpm-hint { grid-column: 1 / -1; margin: 0; }
.dshpm-composition-add > .dshpm-hint { padding: 2px 0; }
.dshpm-composition-add .dshpm-btn { padding-inline: 8px; }
.dshpm-tree-list { display: flex; flex-direction: column; gap: 0; min-height: 0; overflow: auto; }
 .dshpm-tree-node { position: relative; font: inherit; text-align: start; padding: 8px 10px; min-height: 50px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 8px; align-items: start; overflow-wrap: anywhere; }
.dshpm-tree-node:hover, .dshpm-tree-node[aria-current="true"] { background: var(--dsw-alias-bg-layer-2); }
.dshpm-tree-node:disabled { opacity: .5; cursor: not-allowed; }
.dshpm-tree-icon { margin-top: 2px; }
.dshpm-tree-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dshpm-tree-label { font-size: 12px; font-weight: 500; line-height: 18px; }
.dshpm-tree-description { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dshpm-tree-lines { position: absolute; inset: 0; pointer-events: none; }
.dshpm-tree-guide, .dshpm-tree-stem { position: absolute; top: 0; border-inline-start: 1px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent); }
.dshpm-tree-stem { top: 22px; bottom: 0; }
.dshpm-tree-connector { position: absolute; top: 17px; width: 12px; border-block-start: 1px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent); }
.dshpm-composition-detail-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 32px; }
.dshpm-composition-detail-head .dshpm-editor-id { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshpm-composition-detail-head .dshpm-toolbar { flex-wrap: nowrap; gap: 6px; }
.dshpm-composition-detail { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; }
@media (max-width: 720px) {
  .dshpm-composition-layout { grid-template-columns: minmax(0, 1fr); }
  .dshpm-composition-tree { border-right: 0; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-right: 0; padding-bottom: 8px; max-height: 32dvh; }
  .dshpm-editor-meta { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { .dshpm-action-btn[data-action-state="success"] svg, .dshpm-action-btn[data-action-state="error"] svg { animation: none; } }

/* ---- YAML code surface -------------------------------------------------- */
.dshpm-code-editor {
  --dshpm-code-key: color-mix(in srgb, #3b82f6 55%, var(--dsw-alias-label-primary));
  --dshpm-code-string: color-mix(in srgb, #16a34a 55%, var(--dsw-alias-label-primary));
  --dshpm-code-atom: color-mix(in srgb, #c026d3 55%, var(--dsw-alias-label-primary));
  --dshpm-code-number: color-mix(in srgb, #d97706 55%, var(--dsw-alias-label-primary));
  --dshpm-code-meta: color-mix(in srgb, #9333ea 55%, var(--dsw-alias-label-primary));
  flex: 1; min-height: min(42dvh, 320px); min-width: 0; overflow: hidden;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dshpm-radius-sm);
}
.dshpm-code-editor:focus-within { outline: 1px solid var(--dsw-alias-label-secondary); outline-offset: 0; }
.dshpm-code-editor .cm-editor { height: 100%; color: var(--dsw-alias-label-primary); background: transparent; outline: none; }
.dshpm-code-editor .cm-scroller { overflow: auto; font: 13px/1.65 ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
.dshpm-code-editor .cm-content { padding: 8px 0; caret-color: var(--dsw-alias-label-primary); }
.dshpm-code-editor .cm-line { padding: 0 6px; }
.dshpm-code-editor .cm-gutters { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border-right: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }
.dshpm-code-editor .cm-gutterElement { padding-inline: 7px; }
.dshpm-code-editor .cm-activeLine, .dshpm-code-editor .cm-activeLineGutter { background-color: var(--dsw-alias-bg-layer-2); }
.dshpm-code-editor .cm-cursor { border-left-color: var(--dsw-alias-label-primary); }
.dshpm-code-editor .cm-selectionBackground { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent) !important; }
.dshpm-code-editor .dshpm-code-indent {
  background-image: repeating-linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent) 0, color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent) 1px, transparent 1px, transparent 2ch);
  background-size: calc(var(--dshpm-indent-columns) * 1ch) 100%; background-position: 6px 0; background-repeat: no-repeat;
}

/* ---- list metadata used by detail views --------------------------------- */
.dshpm-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* ---- badges ------------------------------------------------------------- */
.dshpm-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dshpm-badge--ok {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.dshpm-badge--warn {
  color: var(--dsw-alias-state-warn-primary);
  border-color: var(--dsw-alias-state-warn-primary);
}
.dshpm-badge--err {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.dshpm-badge--idle {
  color: var(--dsw-alias-label-secondary);
  border-color: var(--dsw-alias-border-l2);
}
.dshpm-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: none; }

/* ---- notices ------------------------------------------------------------ */
.dshpm-notice {
  display: flex;
  gap: 10px;
  padding: 11px 12px;
  border-radius: var(--dshpm-radius-sm);
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 12px;
}
.dshpm-notice--success { border-color: var(--dsw-alias-state-success-primary); }
.dshpm-notice--warning { border-color: var(--dsw-alias-state-warn-primary); }
.dshpm-notice--error { border-color: var(--dsw-alias-state-error-primary); }
.dshpm-notice-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 auto; }
.dshpm-notice-title { font-weight: 600; }
.dshpm-notice-text { overflow-wrap: anywhere; white-space: pre-wrap; }
.dshpm-notice-dismiss {
  flex: none;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}
.dshpm-notice-dismiss:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshpm-issues { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.dshpm-issues li { overflow-wrap: anywhere; }

/* ---- empty / loading ---------------------------------------------------- */
.dshpm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 44px 24px;
  text-align: center;
}
.dshpm-empty-title { font-size: 13px; font-weight: 600; margin: 0; }
.dshpm-empty-body {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  max-width: 46ch;
}
.dshpm-empty-actions { display: flex; gap: 8px; margin-top: 4px; }
.dshpm-loading {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 22px 14px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dshpm-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  animation: dshpm-spin 720ms linear infinite;
  flex: none;
}
@keyframes dshpm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .dshpm-spinner { animation-duration: 2s; }
  .dshpm-btn, .dshpm-input, .dshpm-textarea, .dshpm-select { transition: none; }
}

/* ---- tabs --------------------------------------------------------------- */
.dshpm-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--dshpm-radius-sm);
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
}
.dshpm-tab {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: none;
  border-radius: 5px;
  padding: 5px 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 120ms ease, color 120ms ease;
}
.dshpm-tab:hover { color: var(--dsw-alias-label-primary); }
.dshpm-tab[aria-selected="true"] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

/* ---- key/value ---------------------------------------------------------- */
.dshpm-kv { display: flex; flex-direction: column; gap: 8px; }
.dshpm-kv-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: 12px;
  font-size: 12px;
  align-items: baseline;
}
.dshpm-kv-key { color: var(--dsw-alias-label-secondary); }
.dshpm-kv-val { overflow-wrap: anywhere; }
.dshpm-code-inline {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  padding: 1px 5px;
}

/* ---- diff --------------------------------------------------------------- */
.dshpm-diff-group { display: flex; flex-direction: column; gap: 6px; }
.dshpm-diff-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.dshpm-diff-list { display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 0; list-style: none; }
.dshpm-diff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-base);
  overflow-wrap: anywhere;
}
.dshpm-diff-mark { font-weight: 700; flex: none; width: 10px; }
.dshpm-diff-mark--add { color: var(--dsw-alias-state-success-primary); }
.dshpm-diff-mark--del { color: var(--dsw-alias-state-error-primary); }
.dshpm-diff-mark--chg { color: var(--dsw-alias-state-warn-primary); }

/* ---- checkbox ----------------------------------------------------------- */
.dshpm-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; cursor: pointer; }
.dshpm-check input { margin: 2px 0 0; flex: none; accent-color: var(--dsw-alias-brand-primary); }
.dshpm-check span { min-width: 0; }

/* ---- table (history) ---------------------------------------------------- */
.dshpm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dshpm-table th {
  text-align: left;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  padding: 8px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  white-space: nowrap;
}
.dshpm-table td { padding: 10px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: middle; }
.dshpm-table tr:last-child td { border-bottom: none; }
.dshpm-table td.dshpm-num { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }

/* ---- misc --------------------------------------------------------------- */
.dshpm-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.dshpm-error-text { color: var(--dsw-alias-state-error-primary); font-size: 11.5px; }
.dshpm-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshpm-stack { display: flex; flex-direction: column; gap: 12px; }
.dshpm-divider { height: 1px; background: var(--dsw-alias-border-l1); border: none; margin: 0; }

/* Selection and scrollbars belong to the design too, not the browser default. */
.dshpm ::selection { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
.dshpm-textarea--code { caret-color: var(--dsw-alias-brand-primary); }
.dshpm-textarea--code::-webkit-scrollbar { width: 10px; height: 10px; }
.dshpm-textarea--code::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
  border-radius: 5px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.dshpm-textarea--code::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-label-secondary);
  background-clip: content-box;
}
.dshpm-textarea--code::-webkit-scrollbar-track { background: transparent; }

@media (max-width: 620px) {
  .dshpm-kv-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .dshpm-head { flex-direction: column; }
  .dshpm-head-actions { margin-left: 0; width: 100%; }
}
`
