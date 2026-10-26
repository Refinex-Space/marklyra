import type { OutlineEntry } from '../protocol.js';
import type { LegacyGlobals } from './legacy-types.js';

/** Rebuild header membership without canceling the pending HTML update.
 * SDK document replacement can otherwise leave references to deleted models. */
export function refreshOutlineModel(runtime: LegacyGlobals): void {
  const toc = runtime.editor?.nodeMap.toc;
  if (!toc || runtime.File?._onInitParse) return;
  const pending = toc.refreshTimeout;
  toc.refreshTimeout = null;
  try {
    toc.refresh(true, true);
  } finally {
    toc.refreshTimeout = pending;
  }
}

const headings = 'h1[cid],h2[cid],h3[cid],h4[cid],h5[cid],h6[cid]';
const isHeading = (element: Element) => /^H[1-6]$/.test(element.tagName);
const elementOf = (node: Node) => (node.nodeType === 1 ? (node as Element) : node.parentElement);
const hasHeading = (node: Node) =>
  node.nodeType === 1 &&
  ((node as Element).matches(headings) || Boolean((node as Element).querySelector(headings)));

/** Cache only the DOM-derived outline, invalidated by its actual dependencies.
 * This never caches Markdown, node identities, history or selection. Synchronous
 * reads drain mutation records, including changes before the observer callback. */
export class RuntimeOutline {
  constructor(
    private readonly options: {
      entries?: () => OutlineEntry[] | undefined;
      changed?: () => void;
    } = {},
  ) {}
  private area: HTMLElement | null = null;
  private entries: OutlineEntry[] = [];
  private dirty = true;
  private readonly observer = new MutationObserver((records) => this.changed(records));

  read(area: HTMLElement | null): OutlineEntry[] {
    if (area !== this.area) {
      this.observer.disconnect();
      this.area = area;
      this.dirty = true;
      if (area)
        this.observer.observe(area, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['cid'],
        });
    }
    this.changed(this.observer.takeRecords());
    if (this.dirty) {
      const domEntries = Array.from(area?.querySelectorAll<HTMLElement>(headings) ?? []).map(
        (element) => ({
          id: element.getAttribute('cid') ?? '',
          level: Number(element.tagName[1]),
          text: element.textContent ?? '',
        }),
      );
      const sourceEntries = domEntries.length ? this.options.entries?.() : undefined;
      const live = new Set(domEntries.map((entry) => entry.id));
      this.entries = sourceEntries
        ? sourceEntries.filter((entry) => live.has(entry.id))
        : domEntries;
      this.dirty = false;
      this.options.changed?.();
    }
    return this.entries;
  }

  private changed(records: MutationRecord[]): void {
    if (this.dirty) return;
    for (const record of records) {
      const target = elementOf(record.target);
      if (
        (record.type === 'attributes' && target && isHeading(target)) ||
        target?.closest(headings) ||
        (record.type === 'childList' &&
          [...record.addedNodes, ...record.removedNodes].some(hasHeading))
      ) {
        this.dirty = true;
        return;
      }
    }
  }

  dispose(): void {
    this.observer.disconnect();
    this.area = null;
    this.entries = [];
    this.dirty = true;
  }
}
