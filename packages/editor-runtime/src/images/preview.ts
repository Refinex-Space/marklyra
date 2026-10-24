import { displayImageUrl } from './contracts.js';
import {
  constrainImage,
  type ImageFit,
  type ImageTransform,
  type ImageViewport,
  imageFit,
  zoomImage,
} from './preview-geometry.js';
import { imagePreviewStyle } from './preview-style.js';

export interface ImagePreviewRequest {
  id: string;
  generation: number;
  url: string;
  name: string;
  dark: boolean;
  kind?: 'mermaid';
}
export function imagePreviewRequest(raw: unknown, runtimeUrl: string): ImagePreviewRequest {
  const value = raw as Partial<ImagePreviewRequest> | null;
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.id) ||
    !Number.isSafeInteger(value.generation) ||
    typeof value.name !== 'string' ||
    value.name.length > 8192 ||
    typeof value.url !== 'string' ||
    typeof value.dark !== 'boolean' ||
    (value.kind !== undefined && value.kind !== 'mermaid')
  )
    throw Error('图片预览请求无效');
  return {
    id: value.id,
    generation: value.generation as number,
    url: displayImageUrl(value.url, runtimeUrl),
    name: value.name,
    dark: value.dark,
    ...(value.kind ? { kind: value.kind } : {}),
  };
}

/** Read-only DOM viewer shared by the vanilla SDK and React adapter. No editor commands or IO. */
export class ImagePreview {
  private readonly dialog: HTMLDialogElement;
  private readonly stage: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly scale: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly abort = new AbortController();
  private readonly resize: ResizeObserver;
  private readonly controls: HTMLButtonElement[] = [];
  private natural: ImageViewport | undefined;
  private mode: ImageFit = 'fit';
  private value: ImageTransform = { scale: 1, rotation: 0, x: 0, y: 0 };
  private drag: { id: number; x: number; y: number; originX: number; originY: number } | undefined;
  private disposed = false;
  constructor(
    owner: Document,
    request: ImagePreviewRequest,
    private readonly onClose: (restore: boolean) => void,
    topInset = 0,
  ) {
    const dialog = owner.createElement('dialog');
    this.dialog = dialog;
    dialog.className = 'marklyra-image-preview';
    dialog.dataset.theme = owner.documentElement.dataset.theme ?? (request.dark ? 'dark' : 'light');
    dialog.style.setProperty(
      '--ml-preview-inset',
      `${Number.isFinite(topInset) ? Math.max(0, Math.min(100, topInset)) : 0}px`,
    );
    dialog.setAttribute('aria-label', request.kind === 'mermaid' ? 'Mermaid 图预览' : '图片预览');
    const style = owner.createElement('style');
    style.textContent = imagePreviewStyle;
    dialog.append(style);
    const header = owner.createElement('header');
    const title = owner.createElement('span');
    title.textContent = request.name || '图片预览';
    title.title = title.textContent;
    header.append(title);
    const button = (
      label: string,
      text: string,
      action: () => void,
      target: HTMLElement,
      imageOnly = true,
    ) => {
      const item = owner.createElement('button');
      item.type = 'button';
      item.textContent = text;
      item.title = label;
      item.setAttribute('aria-label', label);
      item.addEventListener('click', action, { signal: this.abort.signal });
      target.append(item);
      if (imageOnly) {
        item.disabled = true;
        this.controls.push(item);
      }
      return item;
    };
    button(
      request.kind === 'mermaid' ? '关闭图表预览' : '关闭图片预览',
      '×',
      () => this.close(),
      header,
      false,
    ).className = 'ml-preview-close';
    this.stage = owner.createElement('div');
    this.stage.className = 'ml-preview-stage';
    this.stage.tabIndex = -1;
    this.stage.setAttribute('aria-label', '图片查看区域');
    this.image = owner.createElement('img');
    this.image.alt = request.name;
    this.image.draggable = false;
    this.image.hidden = true;
    this.notice = owner.createElement('p');
    this.notice.setAttribute('role', 'status');
    this.notice.textContent = '正在加载图片…';
    this.stage.append(this.image, this.notice);
    const toolbar = owner.createElement('footer');
    toolbar.setAttribute('aria-label', '图片查看工具');
    button('缩小', '−', () => this.zoom(this.value.scale / 1.25), toolbar);
    this.scale = owner.createElement('span');
    this.scale.dataset.previewScale = '';
    this.scale.textContent = '—';
    toolbar.append(this.scale);
    button('放大', '+', () => this.zoom(this.value.scale * 1.25), toolbar);
    button('原始尺寸', '100%', () => this.zoom(1), toolbar);
    button('适应窗口', '适应窗口', () => this.fit('fit'), toolbar);
    button('适应宽度', '适应宽度', () => this.fit('width'), toolbar);
    button('顺时针旋转', '↻', () => this.rotate(), toolbar);
    button(
      '重置视图',
      '重置',
      () => {
        this.value = { scale: 1, x: 0, y: 0, rotation: 0 };
        this.fit('fit');
      },
      toolbar,
    );
    dialog.append(header, this.stage, toolbar);
    const options = { signal: this.abort.signal };
    this.image.addEventListener(
      'load',
      () => {
        const { naturalWidth: width, naturalHeight: height } = this.image;
        if (!width || !height || width > 16384 || height > 16384 || width * height > 16_777_216) {
          this.notice.textContent = '图片尺寸超过预览限制';
          return;
        }
        this.natural = { width, height };
        this.image.style.width = `${width}px`;
        this.image.style.height = `${height}px`;
        this.image.hidden = false;
        this.notice.hidden = true;
        for (const control of this.controls) control.disabled = false;
        this.render();
      },
      options,
    );
    this.image.addEventListener(
      'error',
      () => {
        this.notice.textContent = '图片加载失败，请关闭后重试';
      },
      options,
    );
    dialog.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.close();
      },
      options,
    );
    dialog.addEventListener(
      'keydown',
      (event) => {
        if (event.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.close();
          return;
        }
        // Native menus and editor shortcuts must not receive keys owned by this modal.
        event.stopPropagation();
        if (event.key === 'Tab') {
          const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const first = controls[0],
            last = controls.at(-1);
          if (
            owner.activeElement === this.stage ||
            (event.shiftKey ? owner.activeElement === first : owner.activeElement === last)
          ) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
          return;
        }
        if (!this.natural) return;
        if (['+', '=', '-'].includes(event.key)) {
          event.preventDefault();
          this.zoom(this.value.scale * (event.key === '-' ? 0.8 : 1.25));
        } else if (event.key === '0') {
          event.preventDefault();
          this.fit('fit');
        } else if (event.key === '1') {
          event.preventDefault();
          this.zoom(1);
        } else if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          this.rotate();
        } else if (event.target === this.stage && /^Arrow/.test(event.key)) {
          event.preventDefault();
          this.value.x += event.key === 'ArrowLeft' ? 80 : event.key === 'ArrowRight' ? -80 : 0;
          this.value.y += event.key === 'ArrowUp' ? 80 : event.key === 'ArrowDown' ? -80 : 0;
          this.render();
        }
        if (event.metaKey || event.ctrlKey) event.preventDefault();
      },
      options,
    );
    this.stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const rect = this.stage.getBoundingClientRect();
          this.zoom(this.value.scale * Math.exp(-event.deltaY * 0.008), {
            x: event.clientX - rect.x - rect.width / 2,
            y: event.clientY - rect.y - rect.height / 2,
          });
        } else {
          const factor =
            event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.stage.clientHeight : 1;
          this.value.x -= event.deltaX * factor;
          this.value.y -= event.deltaY * factor;
          this.render();
        }
      },
      { ...options, passive: false },
    );
    this.stage.addEventListener(
      'dblclick',
      (event) => {
        if (event.target !== this.image || !this.natural) return;
        if (this.mode === 'fit') this.zoom(1);
        else this.fit('fit');
      },
      options,
    );
    // WKWebView reports trackpad pinch through gesture events on some macOS versions.
    let gestureScale = 1;
    this.stage.addEventListener(
      'gesturestart',
      (event) => {
        event.preventDefault();
        gestureScale = this.value.scale;
      },
      { ...options, passive: false },
    );
    this.stage.addEventListener(
      'gesturechange',
      (event) => {
        event.preventDefault();
        const factor: unknown = Reflect.get(event, 'scale');
        if (typeof factor === 'number' && Number.isFinite(factor) && factor > 0)
          this.zoom(gestureScale * factor);
      },
      { ...options, passive: false },
    );
    this.stage.addEventListener('gestureend', (event) => event.preventDefault(), {
      ...options,
      passive: false,
    });
    this.stage.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 || !this.natural) return;
        event.preventDefault();
        this.stage.focus({ preventScroll: true });
        this.drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          originX: this.value.x,
          originY: this.value.y,
        };
        this.stage.setPointerCapture(event.pointerId);
        this.stage.dataset.dragging = 'true';
      },
      options,
    );
    this.stage.addEventListener(
      'pointermove',
      (event) => {
        if (!this.drag || event.pointerId !== this.drag.id) return;
        this.value.x = this.drag.originX + event.clientX - this.drag.x;
        this.value.y = this.drag.originY + event.clientY - this.drag.y;
        this.render();
      },
      options,
    );
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      this.stage.addEventListener(
        event,
        () => {
          this.drag = undefined;
          delete this.stage.dataset.dragging;
        },
        options,
      );
    this.resize = new ResizeObserver(() => this.render());
    owner.body.append(dialog);
    dialog.showModal();
    this.stage.focus({ preventScroll: true });
    this.resize.observe(this.stage);
    this.image.src = request.url;
  }
  private fit(mode: Exclude<ImageFit, 'manual'>) {
    this.mode = mode;
    this.value.x = 0;
    this.value.y = 0;
    this.render();
  }
  private zoom(scale: number, point = { x: 0, y: 0 }) {
    if (!this.natural) return;
    this.mode = 'manual';
    this.value = zoomImage(this.value, scale, point);
    this.render();
  }
  private rotate() {
    if (!this.natural) return;
    this.value.rotation = (this.value.rotation + 90) % 360;
    this.render();
  }
  private render() {
    if (this.disposed || !this.natural) return;
    const viewport = { width: this.stage.clientWidth, height: this.stage.clientHeight };
    if (this.mode !== 'manual')
      this.value.scale = imageFit(this.natural, viewport, this.value.rotation, this.mode);
    this.value = constrainImage(this.natural, viewport, this.value);
    const { x, y, scale, rotation } = this.value;
    this.image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;
    this.image.dataset.rotation = String(rotation);
    this.scale.textContent = `${Math.round(scale * 100)}%`;
    this.stage.dataset.mode = this.mode;
  }
  focus() {
    this.stage.focus({ preventScroll: true });
  }
  close(restore = true) {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.resize.disconnect();
    this.dialog.close();
    this.image.removeAttribute('src');
    this.dialog.remove();
    this.onClose(restore);
  }
}
