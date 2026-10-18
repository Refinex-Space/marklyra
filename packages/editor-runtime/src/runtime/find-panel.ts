/** Expose the original find/notification strips above sidebars; input remains
 * inside the isolated runtime, with no generic iframe hit-test bypass. */
export class RuntimeFindPanel {
  private panel: HTMLElement | null = null;
  private notification: HTMLElement | null = null;
  private previous = '';
  private readonly mutations = new MutationObserver(() => this.refresh());
  private readonly resize = new ResizeObserver(() => this.refresh());

  constructor(
    private readonly publish: (
      bounds: { top: number; bottom: number; shadow: string } | null,
    ) => void,
  ) {}

  install(): void {
    this.panel = document.getElementById('md-searchpanel');
    this.notification = document.querySelector('.md-notification-container');
    for (const panel of [this.panel, this.notification]) {
      if (!panel) continue;
      this.mutations.observe(panel, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        childList: true,
        subtree: true,
      });
      this.resize.observe(panel);
    }
    this.mutations.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', this.refresh);
    this.refresh();
  }

  refresh = (): void => {
    const panel = this.panel;
    const rect = panel?.getBoundingClientRect();
    const visible = panel && rect && rect.height > 0 && getComputedStyle(panel).display !== 'none';
    const root = document.documentElement.style;
    if (visible) root.setProperty('--marklyra-notification-top', `${rect.bottom}px`);
    else root.removeProperty('--marklyra-notification-top');
    const notification = this.notification;
    const notice = notification?.getBoundingClientRect();
    const showNotice =
      notification &&
      notice &&
      notice.height > 0 &&
      document.body.classList.contains('ty-show-notification');
    const strips = [
      ...(visible
        ? [{ top: rect.top, bottom: rect.bottom, shadow: getComputedStyle(panel).boxShadow }]
        : []),
      ...(showNotice
        ? [
            {
              top: notice.top,
              bottom: notice.bottom,
              shadow: getComputedStyle(notification).boxShadow,
            },
          ]
        : []),
    ];
    const bounds = strips.length
      ? {
          top: Math.min(...strips.map((strip) => strip.top)),
          bottom: Math.max(...strips.map((strip) => strip.bottom)),
          shadow: strips.at(-1)?.shadow ?? 'none',
        }
      : null;
    const next = JSON.stringify(bounds);
    if (next === this.previous) return;
    this.previous = next;
    this.publish(bounds);
  };

  destroy(): void {
    this.mutations.disconnect();
    this.resize.disconnect();
    window.removeEventListener('resize', this.refresh);
    this.panel = null;
    this.notification = null;
    document.documentElement.style.removeProperty('--marklyra-notification-top');
  }
}
