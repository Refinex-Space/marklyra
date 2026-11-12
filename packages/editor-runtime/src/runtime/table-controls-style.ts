/** Table handles and their menu. The menu is regular Liquid Glass when the page has the tokens
 * (style/liquid-glass.css, docs/DESIGN.md); each var() falls back to the previous look. It places
 * itself by measuring on open, so it only fades in (no scale or translate). */
export const tableControlsStyle = `
#write [mdtype=table] > .marklyra-table-edit{display:none!important}
.ml-table-controls{position:fixed;inset:0;z-index:1000;pointer-events:none;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text-color,#333)}
.ml-table-controls[hidden],.ml-table-controls [hidden]{display:none!important}
.ml-table-controls button{font:inherit;color:inherit;cursor:pointer;box-sizing:border-box;outline:none;box-shadow:none}
.ml-table-handle{position:fixed;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--lg-radius-xs,4px);background:color-mix(in srgb,var(--bg-color,#fff) 94%,var(--text-color,#333));color:var(--ml-muted,#777);pointer-events:auto;line-height:1}
.ml-table-handle::before{content:"";position:absolute;inset:-4px}
.ml-table-handle:hover,.ml-table-handle[aria-expanded=true]{background:color-mix(in srgb,var(--bg-color,#fff) 88%,var(--text-color,#333));color:var(--text-color,#333)}
.ml-table-controls[data-input=keyboard] button:focus{outline:1px solid var(--ml-muted,#777);outline-offset:-1px}
.ml-table-highlight{position:fixed;border:1px solid color-mix(in srgb,var(--primary-color,#4183c4) 65%,transparent);border-radius:3px;background:color-mix(in srgb,var(--primary-color,#4183c4) 6%,transparent);pointer-events:none}
.ml-table-menu{position:fixed;width:160px;max-width:calc(100vw - 16px);padding:var(--lg-popover-padding,4px);border:1px solid var(--lg-edge,var(--ml-border,#ddd));border-radius:var(--lg-radius-popover,6px);background:var(--lg-surface-regular,var(--bg-color,#fff));-webkit-backdrop-filter:var(--lg-filter-regular,none);backdrop-filter:var(--lg-filter-regular,none);box-shadow:var(--lg-shadow-popover,0 3px 12px #0002);animation:lg-scrim-in var(--lg-duration,0s) ease-out;pointer-events:auto;overflow:auto;overscroll-behavior:contain;outline:none}
.ml-table-menu button{display:block;width:100%;padding:4px 8px;border:0;border-radius:var(--lg-radius-item,3px);text-align:left;white-space:nowrap;background:transparent}
.ml-table-menu button:hover:not(:disabled),.ml-table-submenu-trigger[aria-expanded=true]{background:var(--lg-hover,color-mix(in srgb,var(--bg-color,#fff) 92%,var(--text-color,#333)))}
.ml-table-controls[data-input=keyboard] .ml-table-menu button:focus{background:var(--lg-selected,color-mix(in srgb,var(--bg-color,#fff) 92%,var(--text-color,#333)))}
.ml-table-menu button:disabled{opacity:.4;cursor:default}
.ml-table-menu button[data-danger]{color:var(--lg-danger,var(--ml-syntax-keyword,#b42318))}
.ml-table-menu button[data-checked]::after{content:"✓";float:right}
.ml-table-submenu{width:136px}
.ml-table-submenu-trigger::after{content:"›";float:right;color:var(--ml-muted,#777)}
.ml-table-menu hr{height:0;border:0;border-top:1px solid var(--lg-separator,var(--ml-border,#ddd));margin:4px 2px;background:transparent}
.ml-table-tabs{display:flex;gap:3px;padding:2px;margin-bottom:4px;border-radius:var(--lg-radius-item,4px);background:var(--lg-hover,transparent);border-bottom:0}
.ml-table-tabs button{width:50%;text-align:center;font-weight:500}
.ml-table-tabs button[aria-pressed=true]{background:var(--lg-surface-control,color-mix(in srgb,var(--bg-color,#fff) 92%,var(--text-color,#333)));box-shadow:var(--lg-shadow-control,none)}
@media print{.ml-table-controls{display:none!important}}
`;
