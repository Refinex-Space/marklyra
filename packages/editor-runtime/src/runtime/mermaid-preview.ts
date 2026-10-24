import type { LegacyGlobals } from './legacy-types.js';
import { mermaidSvgImage } from './mermaid-svg.js';

export interface MermaidPreviewTarget {
  svg: SVGSVGElement;
  block: HTMLElement;
  cid: string;
  source: string;
  generation: number;
}

/** Record render provenance on SVG insertion, not on hover: a stale graph must not
 * acquire the source of a newer, still-rendering CodeMirror buffer. */
export class RuntimeMermaidPreview {
  private readonly rendered = new WeakMap<SVGSVGElement, MermaidPreviewTarget>();
  constructor(
    private readonly runtime: LegacyGlobals,
    private readonly generation: () => number,
  ) {}
  private source(cid: string, block: HTMLElement | null | undefined): string | undefined {
    const editor = this.runtime.editor,
      node = editor?.getNode(cid);
    if (
      !editor ||
      !node ||
      node.get('type') !== 'fences' ||
      String(node.get('lang')).toLowerCase() !== 'mermaid'
    )
      return;
    const cm = editor.fences.queue?.[cid],
      read = cm && Reflect.get(cm, 'getValue'),
      getWrapper = cm && Reflect.get(cm, 'getWrapperElement');
    const wrapper: unknown =
      typeof getWrapper === 'function' ? Reflect.apply(getWrapper, cm, []) : undefined;
    const source: unknown =
      typeof read === 'function' &&
      wrapper instanceof HTMLElement &&
      wrapper.isConnected &&
      block?.contains(wrapper)
        ? Reflect.apply(read, cm, [])
        : node.get('text');
    return typeof source === 'string' ? source : undefined;
  }
  private describe(svg: SVGSVGElement): MermaidPreviewTarget | undefined {
    const editor = this.runtime.editor;
    const preview = svg.closest('.md-diagram-panel-preview');
    const block = preview?.closest<HTMLElement>('[mdtype="fences"][cid]');
    const cid = block?.getAttribute('cid');
    const node = cid ? editor?.getNode(cid) : undefined;
    if (
      !editor ||
      !block ||
      !cid ||
      !node ||
      !editor.writingArea.contains(svg) ||
      node.get('type') !== 'fences' ||
      String(node.get('lang')).toLowerCase() !== 'mermaid' ||
      preview?.querySelector('svg') !== svg ||
      svg.querySelector('.error-icon,.error-text')
    )
      return;
    const source = this.source(cid, block);
    if (source === undefined) return;
    return { svg, block, cid, source, generation: this.generation() };
  }
  observe(root: Element) {
    const capture = (element: Element) => {
      if (!(element instanceof SVGSVGElement) || this.rendered.has(element)) return;
      const value = this.describe(element);
      if (value) this.rendered.set(element, value);
    };
    capture(root);
    for (const svg of root.querySelectorAll('.md-diagram-panel-preview > svg')) capture(svg);
  }
  current(svg: SVGSVGElement): MermaidPreviewTarget | undefined {
    const before = this.rendered.get(svg),
      now = this.describe(svg);
    if (
      !before ||
      !now ||
      before.block !== now.block ||
      before.cid !== now.cid ||
      before.source !== now.source ||
      before.generation !== now.generation
    )
      return;
    return now;
  }
  renew(target: MermaidPreviewTarget): MermaidPreviewTarget | undefined {
    if (this.generation() !== target.generation) return;
    const block = target.block.isConnected
      ? target.block
      : this.runtime.editor?.writingArea.querySelector<HTMLElement>(
          `[mdtype="fences"][cid="${CSS.escape(target.cid)}"]`,
        );
    const svg = block?.querySelector<SVGSVGElement>('.md-diagram-panel-preview > svg');
    const current = svg && this.current(svg);
    return current &&
      current.cid === target.cid &&
      current.source === target.source &&
      current.generation === target.generation
      ? current
      : undefined;
  }
  fromHover(svg: SVGSVGElement): MermaidPreviewTarget | undefined {
    const target = this.rendered.get(svg);
    return target ? this.renew(target) : undefined;
  }
  validSource(svg: SVGSVGElement): boolean {
    const target = this.rendered.get(svg);
    return !!target && this.valid(target);
  }
  valid(target: MermaidPreviewTarget): boolean {
    if (this.generation() !== target.generation) return false;
    const block = this.runtime.editor?.writingArea.querySelector<HTMLElement>(
      `[mdtype="fences"][cid="${CSS.escape(target.cid)}"]`,
    );
    // The native renderer may briefly empty its preview between equivalent SVG
    // paints. The detached snapshot remains valid while its code still matches.
    return this.source(target.cid, block) === target.source;
  }
  snapshot(target: MermaidPreviewTarget): string {
    if (!this.current(target.svg)) throw Error('图表已更新，请重新打开预览');
    return mermaidSvgImage(target.svg);
  }
}
