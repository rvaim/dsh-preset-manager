/**
 * Page styles.
 *
 * Every color is a `--dsw-alias-*` token so the page follows the host's theme in
 * both light and dark. Nothing here sets a literal color except white on the
 * brand fill, where the token guarantees the pairing.
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
  height: 30px;
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
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: #fff;
}
.dshpm-btn--primary:hover:not(:disabled) {
  background: var(--dsw-alias-brand-primary);
  filter: brightness(1.08);
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

/* ---- list --------------------------------------------------------------- */
.dshpm-list { display: flex; flex-direction: column; }
.dshpm-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  transition: background-color 120ms ease;
}
.dshpm-row:last-child { border-bottom: none; }
.dshpm-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dshpm-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dshpm-row-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.dshpm-row-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshpm-row-id {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshpm-row-desc {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.dshpm-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dshpm-row-actions { display: flex; align-items: center; gap: 6px; flex: none; }

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
  .dshpm-row, .dshpm-btn, .dshpm-input, .dshpm-textarea, .dshpm-select { transition: none; }
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
.dshpm ::selection { background: var(--dsw-alias-brand-primary); color: #fff; }
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
  .dshpm-row { grid-template-columns: minmax(0, 1fr); }
  .dshpm-row-actions { justify-content: flex-start; }
  .dshpm-kv-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .dshpm-head { flex-direction: column; }
  .dshpm-head-actions { margin-left: 0; width: 100%; }
}
`
