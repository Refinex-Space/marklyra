interface LookupEditor {
  writingArea: HTMLElement;
  findElemById(...args: unknown[]): unknown;
}

type JQueryFactory = (element: Element | null) => unknown;
const unsafeId = /[^A-Za-z0-9_-]/;
const capacity = 512;
const scanBudget = 2_048;
const batchCapacity = 16_384;
const installations = new WeakMap<object, RuntimeNodeLookup>();

/** A bounded DOM lookup cache for the verified native findElemById ABI.
 * Query order, including duplicate cid values, remains native querySelector order.
 * No model, Markdown, selection or jQuery collection is retained here. */
export class RuntimeNodeLookup {
  private area: HTMLElement | null = null;
  private readonly elements = new Map<string, Element | null>();
  private batchElements: Map<string, Element | null> | undefined;
  private readonly observer = new MutationObserver((records) => this.changed(records));
  private disposed = false;
  private readonly wrapper: LookupEditor['findElemById'];

  private constructor(
    private readonly editor: LookupEditor,
    private readonly jquery: JQueryFactory,
    private readonly original: LookupEditor['findElemById'],
    private readonly own: PropertyDescriptor | undefined,
  ) {
    const lookup = this;
    this.wrapper = function (this: unknown, ...args: unknown[]): unknown {
      const id = args[0];
      if (
        lookup.disposed ||
        this !== editor ||
        args.length !== 1 ||
        typeof id !== 'string' ||
        !id.length ||
        id.length > 128 ||
        unsafeId.test(id)
      )
        return Reflect.apply(original, this, args);
      const area = editor.writingArea;
      // Preserve the error/coercion behavior if the native ABI changes.
      if (!area || area.nodeType !== 1 || typeof area.querySelector !== 'function')
        return Reflect.apply(original, this, args);
      return Reflect.apply(lookup.jquery, undefined, [lookup.read(area, id)]);
    };
  }

  static install(editor: unknown, jquery: unknown): RuntimeNodeLookup | undefined {
    if (!editor || typeof editor !== 'object' || typeof jquery !== 'function') return;
    const installed = installations.get(editor);
    if (installed) return installed;
    const method: unknown = Reflect.get(editor, 'findElemById');
    if (typeof method !== 'function') return;
    const own = Object.getOwnPropertyDescriptor(editor, 'findElemById');
    let owner: object | null = editor;
    let descriptor: PropertyDescriptor | undefined;
    while (owner && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(owner, 'findElemById');
      owner = Object.getPrototypeOf(owner) as object | null;
    }
    if (!descriptor || !('value' in descriptor) || descriptor.writable === false) return;
    if (!own && !Object.isExtensible(editor)) return;
    const lookup = new RuntimeNodeLookup(
      editor as LookupEditor,
      jquery as JQueryFactory,
      method as LookupEditor['findElemById'],
      own,
    );
    Object.defineProperty(editor, 'findElemById', {
      ...(own ?? { configurable: true, enumerable: false, writable: true }),
      value: lookup.wrapper,
    });
    installations.set(editor, lookup);
    return lookup;
  }

  private observe(area: HTMLElement): void {
    if (area !== this.area) {
      this.observer.disconnect();
      this.elements.clear();
      this.batchElements?.clear();
      this.area = area;
      this.observer.observe(area, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['cid'],
        attributeOldValue: true,
      });
    }
  }

  /** A host decoration knows its target cids in advance. Index their first DOM
   * matches once for this synchronous batch; every mutation still invalidates
   * affected entries before the next read. No index survives the batch. */
  batch(ids: readonly string[], action: () => void): void {
    if (this.disposed || this.batchElements || ids.length > batchCapacity) {
      action();
      return;
    }
    const area = this.editor.writingArea;
    if (!area || area.nodeType !== 1 || typeof area.querySelectorAll !== 'function') {
      action();
      return;
    }
    const wanted = new Set(
      ids.filter((id) => id.length > 0 && id.length <= 128 && !unsafeId.test(id)),
    );
    if (wanted.size < 2) {
      action();
      return;
    }
    this.observe(area);
    this.changed(this.observer.takeRecords());
    const matches = new Map<string, Element | null>([...wanted].map((id) => [id, null]));
    for (const element of area.querySelectorAll('[cid]')) {
      const id = element.getAttribute('cid');
      if (id !== null && wanted.delete(id)) matches.set(id, element);
      if (!wanted.size) break;
    }
    this.batchElements = matches;
    try {
      this.changed(this.observer.takeRecords());
      action();
    } finally {
      this.batchElements = undefined;
    }
  }

  private read(area: HTMLElement, id: string): Element | null {
    this.observe(area);
    // Native editing frequently reads before the MutationObserver microtask.
    this.changed(this.observer.takeRecords());
    if (this.batchElements?.has(id)) return this.batchElements.get(id) ?? null;
    if (this.elements.has(id)) {
      const cached = this.elements.get(id) ?? null;
      this.elements.delete(id);
      this.elements.set(id, cached);
      return cached;
    }
    const element = area.querySelector(`[cid="${id}"]`);
    this.elements.set(id, element);
    if (this.elements.size > capacity) {
      const oldest = this.elements.keys().next().value;
      if (oldest !== undefined) this.elements.delete(oldest);
    }
    return element;
  }

  private changed(records: MutationRecord[]): void {
    if ((!this.elements.size && !this.batchElements?.size) || this.disposed) return;
    // A load may replace tens of thousands of blocks. Never traverse all of them
    // just to invalidate a cache containing at most 512 entries.
    if (records.length > 64) {
      this.elements.clear();
      this.batchElements?.clear();
      return;
    }
    let remaining = scanBudget;
    const invalidate = (node: Node): boolean => {
      if (node.nodeType !== 1) return true;
      const visit = (element: Element): boolean => {
        if (--remaining < 0) return false;
        const id = element.getAttribute('cid');
        if (id !== null) {
          this.elements.delete(id);
          this.batchElements?.delete(id);
        }
        return true;
      };
      if (!visit(node as Element)) return false;
      const walker = node.ownerDocument?.createTreeWalker(node, 1);
      if (!walker) return false;
      let child = walker.nextNode();
      while (child) {
        if (!visit(child as Element)) return false;
        child = walker.nextNode();
      }
      return true;
    };
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.oldValue !== null) {
          this.elements.delete(record.oldValue);
          this.batchElements?.delete(record.oldValue);
        }
        const current = (record.target as Element).getAttribute('cid');
        if (current !== null) {
          this.elements.delete(current);
          this.batchElements?.delete(current);
        }
      } else if (record.type === 'childList') {
        if (
          record.addedNodes.length + record.removedNodes.length > 64 ||
          ![...record.addedNodes, ...record.removedNodes].every(invalidate)
        ) {
          this.elements.clear();
          this.batchElements?.clear();
          return;
        }
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.elements.clear();
    this.batchElements?.clear();
    this.area = null;
    if (this.editor.findElemById === this.wrapper) {
      if (this.own) Object.defineProperty(this.editor, 'findElemById', this.own);
      else Reflect.deleteProperty(this.editor, 'findElemById');
    }
    installations.delete(this.editor);
  }
}

export const installNodeLookup = RuntimeNodeLookup.install;

export function withNodeLookupBatch(
  editor: object,
  ids: readonly string[],
  action: () => void,
): void {
  const lookup = installations.get(editor);
  if (lookup) lookup.batch(ids, action);
  else action();
}
