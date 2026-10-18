/** Reports the original panel's geometry and shadow. The host
 * exposes only this strip over its sidebar; the original UI owns all input. */
export class RuntimeFindPanel {
  private panel: HTMLElement | null = null;
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
    if (!this.panel) return;
    this.mutations.observe(this.panel, { attributes: true, attributeFilter: ['class', 'style'] });
    this.mutations.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.resize.observe(this.panel);
    window.addEventListener('resize', this.refresh);
    this.refresh();
  }

  refresh = (): void => {
    const panel = this.panel;
    const rect = panel?.getBoundingClientRect();
    const visible = panel && rect && rect.height > 0 && getComputedStyle(panel).display !== 'none';
    const bounds = visible
      ? { top: rect.top, bottom: rect.bottom, shadow: getComputedStyle(panel).boxShadow }
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
  }
}
