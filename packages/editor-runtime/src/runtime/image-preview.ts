import type { ImagePreviewRequest } from '../images/preview.js';
import { preserveImageCodeSelection } from './image-selection.js';
import type { LegacyGlobals } from './legacy-types.js';

interface PreviewHost {
  runtime: LegacyGlobals;
  available(): boolean;
  stamp(): string;
  generation(): number;
  url(source: string): string | undefined;
  source(wrapper: HTMLElement): string | undefined;
  send(kind: string, value: unknown): void;
}
interface PreviewSession {
  id: string;
  stamp: string;
  image: HTMLImageElement;
  url: string;
  model?: { cid: string; mark: string; index: number; source: string };
  restore(): void;
}
/** One transient handle outside #write. Hover never changes selection or editor model nodes. */
export class RuntimeImagePreview {
  private button: HTMLButtonElement | undefined;
  private style: HTMLStyleElement | undefined;
  private picture: HTMLImageElement | undefined;
  private session: PreviewSession | undefined;
  private readonly abort = new AbortController();
  private readonly observer = new MutationObserver(() => {
    this.validateCurrent();
    if (this.picture) this.schedule();
  });
  private readonly resize = new ResizeObserver(() => this.schedule());
  private frame = 0;
  private leave: ReturnType<typeof setTimeout> | undefined;
  private pressed = false;
  constructor(private readonly host: PreviewHost) {}
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
      const image = wrapper?.querySelector('img');
      if (!image || !area.contains(image)) return;
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
          (this.picture?.closest('.md-image')?.contains(event.relatedTarget) ||
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
      const image = this.picture,
        button = this.button;
      if (
        !image?.isConnected ||
        !button ||
        !this.host.available() ||
        this.pressed ||
        this.session ||
        this.host.runtime.editor?.sourceView.inSourceMode
      ) {
        this.hide();
        return;
      }
      const rect = image.getBoundingClientRect();
      const source = this.source(image);
      if (!source || !this.host.url(source) || !image.complete || !image.naturalWidth) {
        this.hide();
        return;
      }
      const right = Math.min(innerWidth - 6, rect.right - 6),
        top = Math.max(6, rect.top + 6);
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
  open(image: HTMLImageElement) {
    const editor = this.host.runtime.editor;
    if (
      !editor ||
      !this.host.available() ||
      this.session ||
      editor.sourceView.inSourceMode ||
      !editor.writingArea.contains(image)
    )
      return;
    const wrapper = image.closest<HTMLElement>('.md-image');
    if (!wrapper || !image.complete || !image.naturalWidth) return;
    const source = this.source(image);
    if (!source || !this.host.url(source)) return;
    const owner = image.ownerDocument,
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
    const id = crypto.randomUUID();
    const block = wrapper.closest<HTMLElement>('[cid]');
    const cid = block?.getAttribute('cid');
    const node = cid ? editor.getNode(cid) : undefined;
    this.session = {
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
      restore: () => {
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
      },
    };
    this.hide();
    const request: ImagePreviewRequest = {
      id,
      generation: this.host.generation(),
      url: image.src,
      dark: (() => {
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
      })(),
      name: (
        image.alt ||
        image.title ||
        (/^(data:|blob:)/i.test(source) ? '图片预览' : source.split(/[\\/]/).at(-1)) ||
        '图片预览'
      ).slice(0, 8192),
    };
    this.host.send('image-preview', request);
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
