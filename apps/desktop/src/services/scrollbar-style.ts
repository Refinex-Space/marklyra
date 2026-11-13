const probeAttribute = 'data-lg-scrollbar-probe';

/**
 * Marks the root `data-scrollbars="classic"` while the system shows always-visible scrollbars
 * (macOS "Show scroll bars: Always", or a mouse attached), so liquid-glass.css draws them with a
 * clear track. Overlay scrollbars (trackpads, WebView2's Fluent bars) take no width and are left
 * to the system. One hidden scroller stays in the page, outside <body> so no body observer sees
 * it, and opts out of the custom style so it always measures the system's own scrollbar. macOS
 * switches styles when a mouse is connected, with no event in the page; the probe's content box
 * changes width then, which the ResizeObserver reports. The editor runtime page has the same probe
 * (packages/editor-runtime/src/runtime/scrollbar-style.ts).
 */
export function trackScrollbarStyle(root: Document = document): () => void {
  const element = root.documentElement;
  const probe = root.createElement('div');
  probe.setAttribute(probeAttribute, '');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;top:-200px;left:-200px;width:100px;height:100px;overflow:scroll;opacity:0;pointer-events:none;contain:strict';
  const update = () => {
    if (!probe.isConnected) element.append(probe);
    const classic = probe.offsetWidth - probe.clientWidth > 0;
    if (classic && element.dataset.scrollbars !== 'classic') element.dataset.scrollbars = 'classic';
    else if (!classic && element.dataset.scrollbars) delete element.dataset.scrollbars;
  };
  update();
  new ResizeObserver(update).observe(probe);
  root.defaultView?.addEventListener('focus', update);
  return update;
}
