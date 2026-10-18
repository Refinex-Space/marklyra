/** Initial-document image callbacks, without changing native image or menu behavior. */
interface ImageLayoutEditor {
  readonly writingArea: HTMLElement;
  readonly imgEdit: object;
}

interface PendingImage {
  readonly image: HTMLImageElement;
  readonly receiver: unknown;
  readonly args: unknown[];
  readonly generation: number;
}

interface ImageLayoutOptions {
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (id: number) => void;
  readonly onError?: (error: unknown) => void;
}

type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;

function inheritedHTMLDescriptor(element: HTMLElement): PropertyDescriptor | undefined {
  for (
    let prototype: object | null = element;
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
    if (descriptor) return descriptor;
  }
  return undefined;
}

/**
 * The observed native callback reads Selection.anchorNode after the image load
 * handler changes CSS classes, forcing a whole-document layout for every image.
 * Only image objects in a host-authorized reset or its decoration are eligible.
 * User interaction drains that batch before native selection/command handling.
 */
export class RuntimeImageLayout {
  readonly enabled: boolean;
  readonly #editor: ImageLayoutEditor;
  readonly #options: Required<ImageLayoutOptions>;
  readonly #abort = new AbortController();
  #generation = 0;
  #interactionRevision = 0;
  #loading = false;
  #awaitingResetWrite = false;
  #disposed = false;
  #eligible = new WeakSet<HTMLImageElement>();
  #pendingElements = new WeakSet<HTMLImageElement>();
  #pending: PendingImage[] = [];
  #frame: number | undefined;
  #restore: (() => void) | undefined;

  constructor(editor: ImageLayoutEditor, options: ImageLayoutOptions = {}) {
    this.#editor = editor;
    this.#options = {
      requestFrame: options.requestFrame ?? requestAnimationFrame.bind(window),
      cancelFrame: options.cancelFrame ?? cancelAnimationFrame.bind(window),
      onError: options.onError ?? ((error) => console.error(error)),
    };
    const nativeAfter: unknown = Reflect.get(editor.imgEdit, 'afterUserInsertImage');
    const nativeReset: unknown = Reflect.get(editor, 'reset');
    const eventWindow = editor.writingArea.ownerDocument.defaultView;
    const ownHTML = Object.getOwnPropertyDescriptor(editor.writingArea, 'innerHTML');
    const nativeHTML = inheritedHTMLDescriptor(editor.writingArea);
    if (
      typeof nativeAfter !== 'function' ||
      typeof nativeReset !== 'function' ||
      typeof nativeHTML?.get !== 'function' ||
      typeof nativeHTML.set !== 'function' ||
      ownHTML?.configurable === false ||
      !eventWindow
    ) {
      this.enabled = false;
      return;
    }
    const originalAfter = nativeAfter as NativeMethod;
    const originalReset = nativeReset as NativeMethod;
    const htmlGet = nativeHTML.get;
    const htmlSet = nativeHTML.set;
    const adapter = this;
    const after: NativeMethod = function (...args) {
      const image = args[0];
      if (
        !adapter.#disposed &&
        image instanceof HTMLImageElement &&
        (adapter.#eligible.has(image) || adapter.#pendingElements.has(image)) &&
        editor.writingArea.contains(image)
      ) {
        if (adapter.#pending.length >= 8192) adapter.#flush(originalAfter);
        adapter.#pending.push({ image, receiver: this, args, generation: adapter.#generation });
        adapter.#pendingElements.add(image);
        adapter.#schedule(originalAfter);
        return undefined;
      }
      // A newly inserted image keeps its original synchronous behavior. Drain
      // older initial-image calls first to preserve callback order.
      adapter.#flush(originalAfter);
      return originalAfter.apply(this, args);
    };
    const reset: NativeMethod = function (...args) {
      if (adapter.#loading && !adapter.#disposed) adapter.#awaitingResetWrite = true;
      return originalReset.apply(this, args);
    };
    const setter = function (this: HTMLElement, value: string) {
      htmlSet.call(this, value);
      if (!adapter.#awaitingResetWrite || adapter.#disposed || value === '') return;
      // The native reset clears #write and then writes its complete HTML, either
      // immediately or in its zero-delay callback. Observe only that exact write.
      adapter.#awaitingResetWrite = false;
      adapter.#eligible = new WeakSet(this.querySelectorAll('img'));
    };
    try {
      Object.defineProperty(editor.writingArea, 'innerHTML', {
        configurable: true,
        enumerable: nativeHTML.enumerable ?? false,
        get() {
          return htmlGet.call(this);
        },
        set: setter,
      });
      Reflect.set(editor.imgEdit, 'afterUserInsertImage', after);
      Reflect.set(editor, 'reset', reset);
      if (
        Reflect.get(editor.imgEdit, 'afterUserInsertImage') !== after ||
        Reflect.get(editor, 'reset') !== reset
      )
        throw new Error('Native image/reset methods cannot be adapted');
    } catch {
      if (Reflect.get(editor.imgEdit, 'afterUserInsertImage') === after)
        Reflect.set(editor.imgEdit, 'afterUserInsertImage', originalAfter);
      if (Reflect.get(editor, 'reset') === reset) Reflect.set(editor, 'reset', originalReset);
      if (Object.getOwnPropertyDescriptor(editor.writingArea, 'innerHTML')?.set === setter) {
        if (ownHTML) Object.defineProperty(editor.writingArea, 'innerHTML', ownHTML);
        else Reflect.deleteProperty(editor.writingArea, 'innerHTML');
      }
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.#restore = () => {
      if (Reflect.get(editor.imgEdit, 'afterUserInsertImage') === after)
        Reflect.set(editor.imgEdit, 'afterUserInsertImage', originalAfter);
      if (Reflect.get(editor, 'reset') === reset) Reflect.set(editor, 'reset', originalReset);
      if (Object.getOwnPropertyDescriptor(editor.writingArea, 'innerHTML')?.set === setter) {
        if (ownHTML) Object.defineProperty(editor.writingArea, 'innerHTML', ownHTML);
        else Reflect.deleteProperty(editor.writingArea, 'innerHTML');
      }
    };
    const interact = () => this.interaction();
    for (const type of [
      'beforeinput',
      'keydown',
      'pointerdown',
      'paste',
      'drop',
      'compositionstart',
    ])
      eventWindow.addEventListener(type, interact, {
        capture: true,
        signal: this.#abort.signal,
      });
    this.#originalAfter = originalAfter;
  }

  #originalAfter: NativeMethod | undefined;

  beginLoad(): void {
    if (!this.enabled || this.#disposed) return;
    this.#cancel();
    this.#loading = true;
  }

  endLoad(): void {
    this.#loading = false;
    // A native reset may already have scheduled its zero-delay DOM write. Keep
    // that single write armed; do not assume File.loadFile awaited it.
  }

  interaction(): void {
    this.#interactionRevision++;
    this.#loading = false;
    this.#awaitingResetWrite = false;
    this.#eligible = new WeakSet();
    if (this.#originalAfter) this.#flush(this.#originalAfter);
  }

  /** Transfer initial-image eligibility only through an explicit host decoration. */
  decorate(update: () => void): void {
    if (!this.enabled || this.#disposed) {
      update();
      return;
    }
    const generation = this.#generation;
    const interaction = this.#interactionRevision;
    const root = this.#editor.writingArea;
    const blocks = new Set<string>();
    for (const image of root.querySelectorAll('img')) {
      if (!image.isConnected || !this.#eligible.has(image)) continue;
      const block = image.closest('[cid]');
      const cid = block?.getAttribute('cid');
      if (cid && block && root.contains(block)) blocks.add(cid);
    }
    update();
    if (
      this.#disposed ||
      generation !== this.#generation ||
      interaction !== this.#interactionRevision ||
      !blocks.size
    )
      return;
    // Two complete image scans per host batch; never one document query per cid.
    for (const image of root.querySelectorAll('img')) {
      const block = image.closest('[cid]');
      const cid = block?.getAttribute('cid');
      if (image.isConnected && cid && blocks.has(cid) && block && root.contains(block))
        this.#eligible.add(image);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancel();
    this.#abort.abort();
    this.#restore?.();
  }

  #schedule(original: NativeMethod): void {
    if (this.#frame !== undefined) return;
    const generation = this.#generation;
    this.#frame = this.#options.requestFrame(() => {
      if (generation !== this.#generation || this.#disposed) return;
      this.#frame = undefined;
      this.#flush(original);
    });
  }

  #flush(original: NativeMethod): void {
    if (this.#frame !== undefined) this.#options.cancelFrame(this.#frame);
    this.#frame = undefined;
    const pending = this.#pending;
    this.#pending = [];
    this.#pendingElements = new WeakSet();
    for (const entry of pending) {
      if (
        this.#disposed ||
        entry.generation !== this.#generation ||
        !entry.image.isConnected ||
        !this.#editor.writingArea.contains(entry.image)
      )
        continue;
      try {
        original.apply(entry.receiver, entry.args);
      } catch (error) {
        this.#options.onError(error);
      }
    }
  }

  #cancel(): void {
    this.#generation++;
    if (this.#frame !== undefined) this.#options.cancelFrame(this.#frame);
    this.#frame = undefined;
    this.#loading = false;
    this.#awaitingResetWrite = false;
    this.#eligible = new WeakSet();
    this.#pendingElements = new WeakSet();
    this.#pending = [];
  }
}
