import {
  displayImageUrl,
  type ImageHostAction,
  type ImageHostAdapter,
  ImageHostError,
  imageHostReference,
  imageType,
  type NativeImageImporter,
  type NativeInputResult,
  nativeImageResults,
} from './contracts.js';

function cancellableImageOperation<T>(
  value: Promise<T> | T,
  signals: readonly AbortSignal[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      for (const signal of signals) signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new ImageHostError('图片操作已取消：文档、资源或选区上下文已改变'));
    };
    for (const signal of signals) signal.addEventListener('abort', cancel, { once: true });
    if (signals.some((signal) => signal.aborted)) cancel();
    Promise.resolve(value).then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export interface ImageGeneration {
  generation: number;
  context: string | null;
  signal: AbortSignal;
}
/** Cancels capabilities at document boundaries; no DOM, filesystem, or native APIs. */
export class DocumentImages {
  private controller = new AbortController();
  private generation = 0;
  private context: string | null;
  private disposed = false;
  constructor(
    private readonly adapter: ImageHostAdapter | undefined,
    context: string | null,
    private readonly runtimeUrl: string,
  ) {
    this.context = context;
  }
  get enabled() {
    return Boolean(this.adapter);
  }
  get canImport() {
    return Boolean(this.adapter?.import);
  }
  get actions(): readonly ImageHostAction[] {
    return this.adapter?.action ? (this.adapter.actions ?? []) : [];
  }
  get automatic() {
    return Boolean(this.adapter?.automatic && this.adapter.action);
  }
  async shouldImport(
    source: string,
    reference: string,
    generation: number,
    storage: { referenceRoot: string; storageFolder?: string; sourceMode: boolean },
    signal: AbortSignal,
  ): Promise<boolean> {
    this.assert(generation);
    signal.throwIfAborted();
    if (!this.adapter?.automatic) return false;
    const token = this.capture();
    const accepted = await cancellableImageOperation(
      this.adapter.automatic({
        source,
        reference,
        ...storage,
        documentContext: token.context,
        signal,
      }),
      [token.signal, signal],
    );
    this.assert(token);
    signal.throwIfAborted();
    return accepted === true;
  }
  capture(): ImageGeneration {
    return { generation: this.generation, context: this.context, signal: this.controller.signal };
  }
  transition(context: string | null): ImageGeneration {
    if (this.disposed) throw new ImageHostError('Editor has been destroyed');
    this.controller.abort();
    this.controller = new AbortController();
    this.generation++;
    this.context = context;
    return this.capture();
  }
  assert(token: ImageGeneration | number): void {
    const generation = typeof token === 'number' ? token : token.generation;
    if (this.disposed || generation !== this.generation || this.controller.signal.aborted)
      throw new ImageHostError('图片操作已取消：文档或资源上下文已改变');
  }
  async resolve(
    source: string,
    reference: string,
    generation: number,
  ): Promise<{ url: string } | null> {
    this.assert(generation);
    imageHostReference(reference);
    if (!this.adapter) return null;
    const token = this.capture();
    const result = await this.adapter.resolve({
      source,
      reference,
      documentContext: token.context,
      signal: token.signal,
    });
    this.assert(token);
    return result ? { url: displayImageUrl(result.url, this.runtimeUrl) } : null;
  }
  async import(
    name: string,
    type: string,
    bytes: Uint8Array,
    generation: number,
    referenceRoot = '',
    storageFolder?: string,
    signal?: AbortSignal,
  ): Promise<{ source: string; url: string }> {
    this.assert(generation);
    signal?.throwIfAborted();
    const selected = imageType(name, type, bytes.byteLength);
    if (referenceRoot) imageHostReference('image.png', referenceRoot);
    if (!this.adapter?.import) throw new ImageHostError('宿主尚未提供图片导入能力');
    const token = this.capture();
    const result = await this.adapter.import({
      name,
      referenceRoot,
      ...(storageFolder === undefined ? {} : { storageFolder }),
      type: selected,
      bytes: bytes.slice(),
      documentContext: token.context,
      signal: signal ?? token.signal,
    });
    this.assert(token);
    signal?.throwIfAborted();
    imageHostReference(result.source);
    return { source: result.source, url: displayImageUrl(result.url, this.runtimeUrl) };
  }
  async importNative(
    importer: NativeImageImporter,
    generation: number,
    storage: { referenceRoot: string; storageFolder?: string },
    signal?: AbortSignal,
  ): Promise<NativeInputResult[]> {
    this.assert(generation);
    signal?.throwIfAborted();
    const token = this.capture();
    const result = await cancellableImageOperation(
      importer({
        ...storage,
        documentContext: token.context,
        signal: signal ?? token.signal,
      }),
      signal ? [token.signal, signal] : [token.signal],
    );
    this.assert(token);
    signal?.throwIfAborted();
    return nativeImageResults(result, this.runtimeUrl);
  }
  async action(
    action: ImageHostAction,
    source: string,
    reference: string,
    generation: number,
    signal?: AbortSignal,
    storage: { referenceRoot: string; storageFolder?: string } = { referenceRoot: '' },
  ): Promise<{ source: string; url: string } | null> {
    this.assert(generation);
    signal?.throwIfAborted();
    if (!this.adapter?.action || !this.actions.includes(action))
      throw new ImageHostError('宿主尚未提供此图片操作能力');
    imageHostReference(reference);
    const token = this.capture();
    const result = await cancellableImageOperation(
      this.adapter.action({
        action,
        source,
        reference,
        ...storage,
        documentContext: token.context,
        signal: signal ?? token.signal,
      }),
      signal ? [token.signal, signal] : [token.signal],
    );
    this.assert(token);
    signal?.throwIfAborted();
    if (!result) return null;
    imageHostReference(result.source);
    return { source: result.source, url: displayImageUrl(result.url, this.runtimeUrl) };
  }
  destroy(): void {
    this.disposed = true;
    this.controller.abort();
  }
}
