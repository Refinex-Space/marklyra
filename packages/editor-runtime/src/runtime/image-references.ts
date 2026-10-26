import {
  applyImagePatches,
  type ImageDestination,
  type ImageReferenceReplacement,
  imageDestinations,
  imageReferencePatches,
} from '../images/references.js';
import type { RuntimeState } from '../protocol.js';
import type { RuntimeImages } from './images.js';
import type { LegacyGlobals } from './legacy-types.js';
import type { RuntimeDocumentSnapshot } from './reload.js';
import type { RuntimeSourceTracking } from './source-tracking.js';

export interface RuntimeImageReferenceRequest {
  generation: number;
  automatic?: { id: number; generation: number };
  contextRequestId?: string;
  replacements: readonly ImageReferenceReplacement[];
  expectedSource: string;
  expected: Pick<RuntimeState, 'canonical' | 'sequence'> & { checkpoint: number };
}
interface Dependencies {
  runtime: LegacyGlobals;
  images: RuntimeImages;
  tracking: RuntimeSourceTracking;
  state(): RuntimeState;
  composing(): boolean;
  loading(): boolean;
  setLoading(value: boolean): void;
  changed(): void;
  snapshot(): RuntimeDocumentSnapshot;
  restore(snapshot: RuntimeDocumentSnapshot, source: string): Promise<RuntimeState>;
}
/** Source destinations are proved separately from model transactions.
 * Successful updates touch only native CM ranges or image nodes. */
export class RuntimeImageReferences {
  constructor(private readonly deps: Dependencies) {}
  list(): string[] {
    return this.facts().references;
  }
  facts(): { references: string[]; counts: [string, number][]; sourceMode: boolean } {
    const state = this.deps.state();
    const destinations = imageDestinations(state.canonical);
    const refs = destinations.map((item) => item.source);
    this.assertModel(destinations, state.sourceMode, true);
    const counts = new Map<string, number>();
    for (const item of destinations)
      counts.set(item.source, (counts.get(item.source) ?? 0) + (item.uses ?? 1));
    return { references: [...new Set(refs)], counts: [...counts], sourceMode: state.sourceMode };
  }
  async update(value: RuntimeImageReferenceRequest): Promise<RuntimeState> {
    if (this.deps.loading() || this.deps.composing()) throw Error('请先完成当前编辑操作');
    if (value?.generation !== this.deps.images.contextGeneration)
      throw Error('图片引用操作已取消：资源上下文已改变');
    if (value.automatic)
      this.deps.images.automatic.check(value.automatic.id, value.automatic.generation);
    const before = this.deps.state();
    if (
      !value?.expected ||
      value.expected.canonical !== before.canonical ||
      value.expected.sequence !== before.sequence ||
      value.expected.checkpoint !== before.tracking.checkpoint
    )
      throw Error('图片迁移期间正文已有更改，已保留原文与资源');
    const rawPatches = imageReferencePatches(value.expectedSource, value.replacements);
    const patches = imageReferencePatches(before.canonical, value.replacements);
    if (!rawPatches.length && !patches.length) return before;
    if (!rawPatches.length || !patches.length) throw Error('图片引用的源码与模型不一致');
    const editor = this.deps.runtime.editor,
      file = this.deps.runtime.File;
    if (!editor || !file || file.isLocked) throw Error('文档未就绪或已锁定');
    this.assertModel(
      imageDestinations(before.canonical).filter((item) =>
        value.replacements.some((replacement) => replacement.source === item.source),
      ),
      before.sourceMode,
    );
    const snapshot = this.deps.snapshot();
    const expectedCanonical = applyImagePatches(before.canonical, patches);
    const expectedRaw = applyImagePatches(value.expectedSource, rawPatches);
    this.deps.setLoading(true);
    try {
      if (before.sourceMode) {
        const cm = editor.sourceView.cm;
        if (!cm || cm.getValue() !== before.canonical) throw Error('源码编辑器内容已改变');
        const position = (offset: number) => {
          const prefix = before.canonical.slice(0, offset);
          const lines = prefix.split(/\r\n|\r|\n/);
          return { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 };
        };
        cm.changeGeneration(true);
        cm.operation(() => {
          for (let index = patches.length - 1; index >= 0; index--) {
            const patch = patches[index];
            if (patch)
              cm.replaceRange(
                patch.insert,
                position(patch.from),
                position(patch.to),
                'image-reference',
              );
          }
        });
        cm.changeGeneration(true);
      } else this.replaceNative(value.replacements);
      const canonical = file.sync(false, false, true) ?? editor.getMarkdown();
      if (canonical !== expectedCanonical) throw Error('原图片事务未产生已证明的局部引用更改');
      this.deps.tracking.markExternalReload(canonical, expectedRaw);
      if (!before.sourceMode)
        this.deps.runtime.showNotification?.('已更新图片引用', false, '撤销', () =>
          editor.undo.undo(),
        );
      this.deps.images.refreshReferences();
      this.deps.setLoading(false);
      this.deps.changed();
      return this.deps.state();
    } catch (error) {
      this.deps.setLoading(false);
      try {
        await this.deps.restore(snapshot, value.expectedSource);
        if (!before.sourceMode)
          this.deps.runtime.showNotification?.('图片引用未更新，已保留原文与资源');
      } catch (rollback) {
        throw new Error(`图片引用更新及恢复失败：${String(rollback)}`, { cause: error });
      }
      throw error;
    } finally {
      this.deps.setLoading(false);
    }
  }
  private assertModel(
    destinations: readonly ImageDestination[],
    sourceMode: boolean,
    complete = false,
  ): void {
    if (sourceMode) return;
    const editor = this.deps.runtime.editor;
    const actual = new Map<string, number>(),
      expected = new Map<string, number>();
    for (const item of destinations)
      expected.set(item.source, (expected.get(item.source) ?? 0) + (item.uses ?? 1));
    for (const wrapper of editor?.writingArea.querySelectorAll<HTMLElement>('.md-image') ?? []) {
      const source = wrapper.dataset.ref
        ? editor?.nodeMap.link_list.getHrefByRef(wrapper.dataset.ref)
        : wrapper.dataset.src;
      if (source) actual.set(source, (actual.get(source) ?? 0) + 1);
    }
    for (const [source, count] of expected)
      if (actual.get(source) !== count) throw Error('此图片引用尚未对应到真实图片模型，已取消迁移');
    if (complete && [...actual.keys()].some((source) => !expected.has(source)))
      throw Error('文稿包含未能证明源码范围的图片，已取消迁移');
  }
  private replaceNative(replacements: readonly ImageReferenceReplacement[]): void {
    const editor = this.deps.runtime.editor;
    if (!editor) throw Error('编辑器尚未初始化');
    const targets = new Map(replacements.map((item) => [item.source, item.target]));
    const keys = new Map(
      replacements.map((item, index) => [item.source, `/__marklyra_image_reference__/${index}`]),
    );
    const mapping: Record<string, string> = {};
    for (const item of replacements) mapping[keys.get(item.source) ?? ''] = item.target;
    const resolver = editor.imgEdit.getRealSrc;
    const changedClasses: HTMLElement[] = [];
    const descriptors: { image: HTMLImageElement; descriptor: PropertyDescriptor | undefined }[] =
      [];
    const nativeSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!nativeSrc?.set || !nativeSrc.get) throw Error('无法绑定原图片显示属性');
    try {
      // The buildImageMap method indexes loaded wrappers by display paths. Supply
      // private synchronous keys for these exact model nodes; no path is opened.
      editor.imgEdit.getRealSrc = (source: string, ...options: unknown[]) => {
        const key = keys.get(source);
        return key
          ? `file://${key}`
          : Reflect.apply(resolver, editor.imgEdit, [source, ...options]);
      };
      for (const wrapper of editor.writingArea.querySelectorAll<HTMLElement>('.md-image')) {
        const source = wrapper.dataset.ref
          ? editor.nodeMap.link_list.getHrefByRef(wrapper.dataset.ref)
          : wrapper.dataset.src;
        const target = source && targets.get(source);
        if (!target) continue;
        if (!wrapper.classList.contains('md-img-loaded')) {
          changedClasses.push(wrapper);
          wrapper.classList.add('md-img-loaded');
        }
        const image = wrapper.querySelector('img');
        if (!image) throw Error('真实图片节点缺少显示元素');
        const descriptor = Object.getOwnPropertyDescriptor(image, 'src');
        descriptors.push({ image, descriptor });
        // The transaction writes target directly to img.src. Route that
        // synchronous write through the controlled resolver, never HTTP/file IO.
        Object.defineProperty(image, 'src', {
          configurable: true,
          get: () => nativeSrc.get?.call(image),
          set: () => nativeSrc.set?.call(image, Reflect.apply(resolver, editor.imgEdit, [target])),
        });
      }
      const built = editor.imgEdit.buildImageMap((path) => Object.hasOwn(mapping, path));
      if (built.length !== replacements.length || built.some((key) => !Object.hasOwn(mapping, key)))
        throw Error('原图片索引未包含全部待迁移引用');
      editor.imgEdit.replaceImageMap(mapping, false, '');
    } finally {
      editor.imgEdit.getRealSrc = resolver;
      for (const wrapper of changedClasses) wrapper.classList.remove('md-img-loaded');
      for (const { image, descriptor } of descriptors) {
        if (descriptor) Object.defineProperty(image, 'src', descriptor);
        else Reflect.deleteProperty(image, 'src');
      }
    }
  }
}
