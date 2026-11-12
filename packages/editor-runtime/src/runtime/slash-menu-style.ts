// Liquid Glass regular popover (docs/DESIGN.md §4, §6), tokens from style/liquid-glass.css. place()
// measures the menu and flips it above the caret, so it only fades in (§5).
export const slashMenuStyle = `
.ml-slash-menu{position:fixed;z-index:1001;box-sizing:border-box;width:248px;max-width:calc(100vw - 16px);padding:var(--lg-popover-padding);overflow:auto;overscroll-behavior:contain;border:1px solid var(--lg-edge);border-radius:var(--lg-radius-popover);background:var(--lg-surface-regular);-webkit-backdrop-filter:var(--lg-filter-regular);backdrop-filter:var(--lg-filter-regular);color:var(--text-color,#333);box-shadow:var(--lg-shadow-popover);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-user-select:none;user-select:none;animation:lg-scrim-in var(--lg-duration) var(--lg-ease-out)}
.ml-slash-menu[hidden]{display:none!important}
.ml-slash-group{padding:6px 8px 3px;font-size:11px;line-height:1.3;color:var(--ml-muted,#888)}
.ml-slash-group:not(:first-child){margin-top:4px;border-top:1px solid var(--lg-separator);padding-top:7px}
.ml-slash-option{display:flex;align-items:center;gap:9px;height:30px;padding:0 8px;border-radius:var(--lg-radius-item);cursor:pointer}
.ml-slash-option[aria-selected=true]{background:var(--lg-selected)}
.ml-slash-icon{flex:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;border:1px solid var(--lg-hairline);border-radius:var(--lg-radius-xs);background:var(--lg-surface-control);color:var(--ml-muted,#777);font-size:10.5px;font-weight:600;letter-spacing:-.02em}
.ml-slash-icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.ml-slash-option[aria-selected=true] .ml-slash-icon{color:var(--text-color,#333)}
.ml-slash-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-slash-shortcut{flex:none;font-size:11px;color:var(--ml-muted,#999);font-variant-numeric:tabular-nums}
.ml-slash-empty{padding:7px 8px;color:var(--ml-muted,#888)}
@media (prefers-reduced-motion:reduce){.ml-slash-menu{animation:none}}
@media print{.ml-slash-menu{display:none!important}}
`;
