import type { ImagePreviewRequest } from '../images/preview.js';
import { preserveImageCodeSelection } from './image-selection.js';
import type { LegacyGlobals } from './legacy-types.js';
import { type MermaidPreviewTarget, RuntimeMermaidPreview } from './mermaid-preview.js';

interface PreviewHost {
  runtime: LegacyGlobals;
  available(): boolean;
  stamp(): string;
  generation(): number;
  url(source: string): string | undefined;
  source(wrapper: HTMLElement): string | undefined;
  send(kind: string, value: unknown): void;
}
interface PreviewOrigin {
  id: string;
  stamp: string;
  restore(): void;
}
type PreviewSession = PreviewOrigin &
  (
    | {
        kind: 'image';
        image: HTMLImageElement;
        url: string;
        model?: { cid: string; mark: string; index: number; source: string };
      }
    | { kind: 'mermaid'; target: MermaidPreviewTarget }
  );
/** One transient handle outside #write. Hover never changes selection or editor model nodes. */
export class RuntimeImagePreview {
  private button: HTMLButtonElement | undefined;
  private style: HTMLStyleElement | undefined;
  private picture: HTMLImageElement | SVGSVGElement | undefined;
  private readonly mermaid: RuntimeMermaidPreview;
  private session: PreviewSession | undefined;
  private readonly abort = new AbortController();
  private readonly observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        if (node instanceof Element) this.mermaid.observe(node);
      }
    this.validateCurrent();
    if (this.picture) this.schedule();
  });
  private readonly resize = new ResizeObserver(() => this.schedule());
  private frame = 0;
  private leave: ReturnType<typeof setTimeout> | undefined;
  private pressed = false;
  constructor(private readonly host: PreviewHost) {
    this.mermaid = new RuntimeMermaidPreview(host.runtime, () => host.generation());
  }
  get active() {
    return !!this.session;
  }
  install() {
    const area = this.host.runtime.editor?.writingArea;
    if (!area || this.button) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ml-image-preview-trigger';
    button.setAttribute('aria-label', '查看大图');
    button.title = '查看大图';
    button.setAttribute('contenteditable', 'false');
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>';
    button.hidden = true;
    this.button = button;
    this.style = document.createElement('style');
    this.style.textContent =
      '.ml-image-preview-trigger{position:fixed!important;z-index:2147482000;box-sizing:border-box;width:30px;height:30px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-color,#707070);cursor:pointer;opacity:.78;filter:drop-shadow(0 0 1px var(--bg-color,#fff))}.ml-image-preview-trigger[hidden]{display:none!important}.ml-image-preview-trigger:hover{background:var(--item-hover-bg,#8882);opacity:1}.ml-image-preview-trigger:focus-visible{outline:2px solid #3974ab;outline-offset:2px}';
    document.head.append(this.style);
    document.body.append(button);
    const options = { signal: this.abort.signal };
    const follow = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !this.host.available() || this.pressed || this.session)
        return;
      const wrapper = target.closest('.md-image');
      const image =
        wrapper?.querySelector('img') ??
        target.closest('.md-diagram-panel-preview')?.querySelector('svg');
      if (!image || !area.contains(image)) return;
      if (image instanceof SVGSVGElement && !this.mermaid.current(image)) {
        this.hide();
        return;
      }
      clearTimeout(this.leave);
      if (this.picture !== image) {
        this.resize.disconnect();
        this.resize.observe(image);
      }
      this.picture = image;
      this.schedule();
    };
    area.addEventListener(
      'pointerover',
      (event) => {
        if (!event.buttons) {
          this.pressed = false;
          follow(event.target);
        }
      },
      options,
    );
    area.addEventListener(
      'pointermove',
      (event) => {
        if (!event.buttons) {
          this.pressed = false;
          follow(event.target);
        }
      },
      options,
    );
    area.addEventListener('focusin', (event) => follow(event.target), options);
    area.addEventListener(
      'load',
      (event) => {
        if (event.target === this.picture) this.schedule();
      },
      { ...options, capture: true },
    );
    area.addEventListener(
      'pointerout',
      (event) => {
        if (
          event.relatedTarget instanceof Node &&
          (this.picture
            ?.closest('.md-image,.md-diagram-panel-preview')
            ?.contains(event.relatedTarget) ||
            button.contains(event.relatedTarget))
        )
          return;
        clearTimeout(this.leave);
        this.leave = setTimeout(() => this.hide(), 140);
      },
      options,
    );
    button.addEventListener('pointerenter', () => clearTimeout(this.leave), options);
    button.addEventListener(
      'pointerleave',
      () => {
        this.leave = setTimeout(() => this.hide(), 140);
      },
      options,
    );
    button.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      options,
    );
    // The legacy editor also listens to compatibility mouse events. A viewer handle
    // must never let its mouseup collapse the active CodeMirror selection.
    for (const type of ['mousedown', 'mouseup', 'pointerup']) {
      button.addEventListener(
        type,
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        options,
      );
    }
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.picture) this.open(this.picture);
      },
      options,
    );
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target === button || button.contains(event.target as Node)) return;
        this.pressed = true;
        this.hide();
      },
      { ...options, capture: true },
    );
    window.addEventListener(
      'pointerup',
      () => {
        this.pressed = false;
      },
      options,
    );
    window.addEventListener(
      'pointercancel',
      () => {
        this.pressed = false;
      },
      options,
    );
    window.addEventListener(
      'compositionstart',
      () => {
        this.hide();
        this.reset();
      },
      { ...options, capture: true },
    );
    window.addEventListener('scroll', () => this.schedule(), {
      ...options,
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', () => this.schedule(), options);
    this.observer.observe(area, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src'],
    });
    this.mermaid.observe(area);
  }
  private hide() {
    if (this.button) this.button.hidden = true;
  }
  private source(image: HTMLImageElement): string | undefined {
    const wrapper = image.closest<HTMLElement>('.md-image');
    return wrapper ? this.sourceFor(wrapper) : undefined;
  }
  sourceFor(wrapper: HTMLElement): string | undefined {
    const source = this.host.source(wrapper);
    if (source) return source;
    const inline = wrapper.querySelector('img')?.getAttribute('src');
    return inline?.startsWith('data:image/') ? inline : undefined;
  }
  private schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      let image = this.picture;
      const button = this.button;
      if (
        !image ||
        !button ||
        !this.host.available() ||
        this.pressed ||
        this.session ||
        this.host.runtime.editor?.sourceView.inSourceMode
      ) {
        this.hide();
        return;
      }
      if (image instanceof SVGSVGElement) {
        const target = this.mermaid.fromHover(image);
        if (!target) {
          // Keep an already visible handle through an equivalent repaint. Removing
          // it under the pointer would let the click reach the graph's source editor.
          if (!this.mermaid.validSource(image)) this.hide();
          return;
        }
        if (target.svg !== image) {
          image = this.picture = target.svg;
          this.resize.disconnect();
          this.resize.observe(image);
        }
      }
      if (!image.isConnected) {
        this.hide();
        return;
      }
      const rect = image.getBoundingClientRect();
      const available =
        image instanceof SVGSVGElement
          ? this.mermaid.current(image)
          : image.complete && image.naturalWidth && this.host.url(this.source(image) ?? '');
      if (!available) {
        this.hide();
        return;
      }
      const right = Math.min(innerWidth - 6, rect.right - 6);
      let top = Math.max(6, rect.top + 6);
      if (image instanceof SVGSVGElement) {
        const block = image.closest('[mdtype="fences"]');
        // An expanded fence has its own language control above the diagram.
        // Reserve that row before its delayed tooltip appears under the pointer.
        if (block?.querySelector('.CodeMirror')?.getBoundingClientRect().height)
          top = Math.max(top, rect.top + 38);
        for (const control of block?.querySelectorAll('.code-tooltip') ?? []) {
          const box = control.getBoundingClientRect();
          if (
            box.width &&
            box.height &&
            box.left < right &&
            box.right > right - 30 &&
            box.top < top + 30 &&
            box.bottom > top
          )
            top = box.bottom + 6;
        }
      }
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom < 16 ||
        rect.top >= innerHeight - 16 ||
        right < 30
      ) {
        this.hide();
        return;
      }
      button.style.left = `${Math.max(6, right - 30)}px`;
      button.style.top = `${Math.min(innerHeight - 36, top)}px`;
      button.hidden = false;
    });
  }
  open(image: HTMLImageElement | SVGSVGElement) {
    if (image instanceof SVGSVGElement) {
      const current = this.mermaid.fromHover(image);
      if (!current) {
        this.hide();
        return;
      }
      image = current.svg;
    }
    const editor = this.host.runtime.editor;
    if (
      !editor ||
      !this.host.available() ||
      this.session ||
      editor.sourceView.inSourceMode ||
      !editor.writingArea.contains(image)
    )
      return;
    if (image instanceof SVGSVGElement) {
      this.openMermaid(image);
      return;
    }
    const wrapper = image.closest<HTMLElement>('.md-image');
    if (!wrapper || !image.complete || !image.naturalWidth) return;
    const source = this.source(image);
    if (!source || !this.host.url(source)) return;
    const restore = this.captureFocus();
    const id = crypto.randomUUID();
    const block = wrapper.closest<HTMLElement>('[cid]');
    const cid = block?.getAttribute('cid');
    const node = cid ? editor.getNode(cid) : undefined;
    this.session = {
      kind: 'image',
      id,
      stamp: this.host.stamp(),
      image,
      url: image.src,
      ...(block && cid && node
        ? {
            model: {
              cid,
              mark: node.toMark(),
              index: [...block.querySelectorAll('.md-image')].indexOf(wrapper),
              source,
            },
          }
        : {}),
      restore,
    };
    this.hide();
    const request: ImagePreviewRequest = {
      id,
      generation: this.host.generation(),
      url: image.src,
      dark: this.dark(),
      name: (
        image.alt ||
        image.title ||
        (/^(data:|blob:)/i.test(source) ? '图片预览' : source.split(/[\\/]/).at(-1)) ||
        '图片预览'
      ).slice(0, 8192),
    };
    this.host.send('image-preview', request);
  }
  private openMermaid(svg: SVGSVGElement) {
    const target = this.mermaid.current(svg);
    if (!target) return;
    try {
      const restore = this.captureFocus(),
        stamp = this.host.stamp();
      const url = this.mermaid.snapshot(target),
        id = crypto.randomUUID();
      if (!this.host.available() || stamp !== this.host.stamp() || !this.mermaid.current(svg))
        return;
      this.session = { kind: 'mermaid', id, stamp, restore, target };
      this.hide();
      this.host.send('image-preview', {
        id,
        generation: this.host.generation(),
        url,
        name: 'Mermaid 图',
        kind: 'mermaid',
        dark: this.dark(),
      } satisfies ImagePreviewRequest);
    } catch (error) {
      this.host.send('runtime-error', error instanceof Error ? error.message : String(error));
    }
  }
  private captureFocus(): () => void {
    const editor = this.host.runtime.editor;
    if (!editor) return () => {};
    const owner = editor.writingArea.ownerDocument,
      selection = owner.getSelection();
    const anchor = selection?.anchorNode,
      head = selection?.focusNode;
    const anchorOffset = selection?.anchorOffset ?? 0,
      headOffset = selection?.focusOffset ?? 0;
    const origin = owner.activeElement as HTMLElement | null;
    const restoreCode = preserveImageCodeSelection(editor.writingArea);
    const scrollers = [owner.scrollingElement, ...owner.querySelectorAll('content')]
      .filter((value): value is Element => !!value)
      .map((element) => ({ element, x: element.scrollLeft, y: element.scrollTop }));
    return () => {
      if (origin?.isConnected && origin !== this.button) origin.focus({ preventScroll: true });
      else editor.writingArea.focus({ preventScroll: true });
      if (restoreCode) restoreCode();
      else if (
        anchor?.isConnected &&
        head?.isConnected &&
        editor.writingArea.contains(anchor) &&
        editor.writingArea.contains(head)
      )
        owner.getSelection()?.setBaseAndExtent(anchor, anchorOffset, head, headOffset);
      for (const { element, x, y } of scrollers) {
        element.scrollLeft = x;
        element.scrollTop = y;
      }
    };
  }
  private dark(): boolean {
    const style = getComputedStyle(document.body);
    const probe = document.createElement('span');
    probe.style.color = style.getPropertyValue('--bg-color') || style.backgroundColor;
    document.body.append(probe);
    const [r = 255, g = 255, b = 255] =
      getComputedStyle(probe)
        .color.match(/[\d.]+/g)
        ?.map(Number) ?? [];
    probe.remove();
    return r * 0.2126 + g * 0.7152 + b * 0.0722 < 128;
  }
  validate(id: string): boolean {
    const session = this.session;
    if (
      !session ||
      session.id !== id ||
      !this.host.available() ||
      session.stamp !== this.host.stamp()
    )
      return false;
    if (session.kind === 'mermaid') {
      if (!this.mermaid.valid(session.target)) return false;
      session.target = this.mermaid.renew(session.target) ?? session.target;
      return true;
    }
    if (session.image.isConnected && session.image.src === session.url) return true;
    // A decoration can replace the image element after the popup request or while
    // viewing. Keep the same authorized resource only if the model and ordinal agree.
    const model = session.model,
      editor = this.host.runtime.editor;
    if (
      !model ||
      !editor ||
      editor.getNode(model.cid)?.toMark() !== model.mark ||
      this.host.url(model.source) !== session.url
    )
      return false;
    const block = editor.writingArea.querySelector(`[cid="${CSS.escape(model.cid)}"]`);
    const wrapper = block?.querySelectorAll<HTMLElement>('.md-image')[model.index];
    const image = wrapper?.querySelector('img');
    if (!wrapper || !image || this.sourceFor(wrapper) !== model.source) return false;
    session.image = image;
    return true;
  }
  private validateCurrent() {
    if (this.session && !this.validate(this.session.id)) this.reset();
  }
  close(id: string, restore: boolean) {
    if (this.session?.id !== id) return;
    const session = this.session;
    const valid = this.validate(id);
    this.session = undefined;
    if (restore && valid) session.restore();
  }
  reset() {
    clearTimeout(this.leave);
    this.hide();
    this.picture = undefined;
    if (this.session) this.host.send('image-preview-cancel', this.session.id);
    this.session = undefined;
  }
  destroy() {
    this.reset();
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    this.button?.remove();
    this.style?.remove();
  }
}
