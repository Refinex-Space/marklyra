import type { LegacyGlobals } from './legacy-types.js';

export interface RenderTicket {
  current(): boolean;
}
const stale: RenderTicket = Object.freeze({ current: () => false });

/** Guard commits, without replacing the renderer or pretending to cancel its
 * work. Per-preview tickets also reject an older request for identical text. */
export class RuntimeRenderTickets {
  private readonly latest = new WeakMap<Element, object>();
  constructor(
    private readonly runtime: LegacyGlobals,
    private readonly generation: () => number,
    private readonly available: () => boolean,
  ) {}
  begin(preview: unknown, cm: unknown): RenderTicket {
    if (
      !(preview instanceof HTMLElement) ||
      !preview.matches('.md-mathjax-preview,.md-fences-adv-panel-preview,.md-diagram-panel-preview')
    )
      return stale;
    const token = {},
      editor = this.runtime.editor,
      file = this.runtime.File,
      epoch = this.generation();
    this.latest.set(preview, token);
    if (
      !editor ||
      !file ||
      !this.available() ||
      editor.isIME ||
      editor.sourceView.inSourceMode ||
      !cm ||
      typeof cm !== 'object'
    )
      return stale;
    const id: unknown = Reflect.get(cm, 'cid'),
      doc: unknown = Reflect.get(cm, 'doc'),
      read: unknown = Reflect.get(cm, 'getValue'),
      getWrapper: unknown = Reflect.get(cm, 'getWrapperElement');
    if (
      typeof id !== 'string' ||
      !doc ||
      typeof read !== 'function' ||
      typeof getWrapper !== 'function'
    )
      return stale;
    const scope = preview.closest<HTMLElement>('[cid]'),
      node = editor.getNode(id),
      wrapper: unknown = Reflect.apply(getWrapper, cm, []),
      source: unknown = Reflect.apply(read, cm, []);
    if (
      !scope ||
      !node ||
      scope.getAttribute('cid') !== id ||
      typeof source !== 'string' ||
      !(wrapper instanceof HTMLElement) ||
      !['math_block', 'fences'].includes(String(node.get('type'))) ||
      !preview.isConnected ||
      !scope.isConnected ||
      !wrapper.isConnected ||
      !scope.contains(wrapper) ||
      !editor.writingArea.contains(scope)
    )
      return stale;
    const ownsCM = () => editor.mathBlock?.currentCm === cm || editor.fences.queue?.[id] === cm;
    if (!ownsCM()) return stale;
    return {
      current: () =>
        this.latest.get(preview) === token &&
        this.generation() === epoch &&
        this.available() &&
        this.runtime.editor === editor &&
        this.runtime.File === file &&
        !editor.isIME &&
        !editor.sourceView.inSourceMode &&
        editor.getNode(id) === node &&
        ownsCM() &&
        Reflect.get(cm, 'doc') === doc &&
        Reflect.apply(getWrapper, cm, []) === wrapper &&
        Reflect.apply(read, cm, []) === source &&
        preview.isConnected &&
        scope.isConnected &&
        wrapper.isConnected &&
        scope.contains(wrapper) &&
        preview.closest('[cid]') === scope &&
        scope.getAttribute('cid') === id &&
        editor.writingArea.contains(scope),
    };
  }
}
