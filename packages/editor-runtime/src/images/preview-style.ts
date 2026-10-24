export const imagePreviewStyle = `
dialog.marklyra-image-preview{position:fixed;inset:0;box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:var(--ml-preview-inset,0px) 0 0;border:0;background:var(--ml-preview-bg);color:var(--ml-preview-text);--ml-preview-bg:#f4f5f7;--ml-preview-text:#303640;--ml-preview-muted:#68717e;--ml-preview-hover:#0000000b;--ml-preview-focus:#3974ab;font:13px/1.5 system-ui,sans-serif;overflow:hidden;user-select:none;animation:ml-preview-in 140ms ease-out}
dialog.marklyra-image-preview[open]{display:flex;flex-direction:column}
.marklyra-image-preview[data-theme="dark"]{--ml-preview-bg:#181c22;--ml-preview-text:#edf0f5;--ml-preview-muted:#adb5c2;--ml-preview-hover:#ffffff16;--ml-preview-focus:#9dc6ff}
.marklyra-image-preview::backdrop{background:transparent}
.marklyra-image-preview header{display:flex;align-items:center;gap:16px;flex:none;height:48px;padding:0 20px;margin:0;background:transparent}
.marklyra-image-preview header>span{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--ml-preview-muted)}
.marklyra-image-preview button{box-sizing:border-box;flex:none;min-width:32px;height:32px;padding:0 10px;background:transparent;color:inherit;border:1px solid transparent;border-radius:6px;cursor:pointer;font:inherit;line-height:30px;white-space:nowrap}
.marklyra-image-preview button:hover:not(:disabled){background:var(--ml-preview-hover)}
.marklyra-image-preview button:disabled{opacity:.35;cursor:default}
.marklyra-image-preview button:focus-visible{outline:2px solid var(--ml-preview-focus);outline-offset:1px}
.marklyra-image-preview .ml-preview-close{font-size:25px;padding:0;width:32px}
.marklyra-image-preview .ml-preview-stage{position:relative;flex:1;min-height:0;overflow:hidden;outline:none;touch-action:none;cursor:grab}
.marklyra-image-preview .ml-preview-stage[data-dragging]{cursor:grabbing}
.marklyra-image-preview .ml-preview-stage>img{position:absolute;left:50%;top:50%;max-width:none;max-height:none;margin:0;padding:0;border:0;transform-origin:center;pointer-events:auto;-webkit-user-drag:none;user-select:none}
.marklyra-image-preview [hidden]{display:none!important}
.marklyra-image-preview .ml-preview-stage>p{position:absolute;top:50%;left:0;right:0;margin:0;text-align:center;color:var(--ml-preview-muted)}
.marklyra-image-preview footer{display:flex;flex:none;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px;padding:10px 16px 14px;margin:0;background:transparent}
.marklyra-image-preview [data-preview-scale]{min-width:48px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;color:var(--ml-preview-muted)}
@keyframes ml-preview-in{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){dialog.marklyra-image-preview{animation:none}}
@media(max-width:500px){.marklyra-image-preview footer{gap:2px;padding:8px}.marklyra-image-preview button{padding:0 6px}.marklyra-image-preview header{padding:0 12px}}
`;
