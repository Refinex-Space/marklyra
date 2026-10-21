export const slashMenuStyle = `
.ml-slash-menu{position:fixed;z-index:1001;box-sizing:border-box;width:248px;max-width:calc(100vw - 16px);padding:4px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--ml-border,#e4e4e4);border-radius:8px;background:var(--bg-color,#fff);color:var(--text-color,#333);box-shadow:0 6px 24px rgba(0,0,0,.12),0 1px 3px rgba(0,0,0,.06);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-user-select:none;user-select:none;animation:ml-slash-in .12s ease-out}
.ml-slash-menu[hidden]{display:none!important}
.ml-slash-group{padding:6px 8px 3px;font-size:11px;line-height:1.3;color:var(--ml-muted,#888)}
.ml-slash-group:not(:first-child){margin-top:2px;border-top:1px solid var(--ml-border,#e4e4e4);padding-top:7px}
.ml-slash-option{display:flex;align-items:center;gap:9px;height:30px;padding:0 8px;border-radius:5px;cursor:pointer}
.ml-slash-option[aria-selected=true]{background:color-mix(in srgb,var(--bg-color,#fff) 91%,var(--text-color,#333))}
.ml-slash-icon{flex:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;border:1px solid var(--ml-border,#e4e4e4);border-radius:5px;background:var(--bg-color,#fff);color:var(--ml-muted,#777);font-size:10.5px;font-weight:600;letter-spacing:-.02em}
.ml-slash-icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.ml-slash-option[aria-selected=true] .ml-slash-icon{color:var(--text-color,#333)}
.ml-slash-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-slash-shortcut{flex:none;font-size:11px;color:var(--ml-muted,#999);font-variant-numeric:tabular-nums}
.ml-slash-empty{padding:7px 8px;color:var(--ml-muted,#888)}
@keyframes ml-slash-in{from{opacity:0;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.ml-slash-menu{animation:none}}
@media print{.ml-slash-menu{display:none!important}}
`;
