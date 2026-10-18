import type { LegacyGlobals } from './legacy-types.js';
import { type NativeSerialization, trySerializeNativeBlocks } from './serialization.js';

/** A synchronous handoff, never a cache of an earlier document serialization.
 * Only the verified getMarkdown / File.sync(skipHost=true) reads may use this:
 * their last model operation is serialization, followed by newline wrapping.
 * Multiple invocations, source mode and native fallback provide no receipt. */
export class RuntimeSerializationRead {
  private readonly installed = new WeakSet<object>();
  private observer: ((receipt: NativeSerialization | undefined) => void) | undefined;
  constructor(private readonly runtime: LegacyGlobals) {}

  private install(): void {
    const map = this.runtime.editor?.nodeMap;
    if (!map || this.installed.has(map)) return;
    const original = map.toMark;
    const owner = this;
    map.toMark = function (this: typeof map, ...args: unknown[]) {
      let receipt: NativeSerialization | undefined;
      // Capture the observer at entry so a reentrant call cannot redirect it.
      const observer = owner.observer;
      if (this !== map || args.length) {
        observer?.(undefined);
        return Reflect.apply(original, this, args);
      }
      try {
        return (
          trySerializeNativeBlocks(
            map,
            Boolean(owner.runtime.File?.useCRLF),
            observer
              ? (result) => {
                  receipt = result;
                }
              : undefined,
            {
              capability: Reflect.get(owner.runtime, '__MARKLYRA_NATIVE_SERIALIZATION__'),
              original,
              useCRLF: () => Boolean(owner.runtime.File?.useCRLF),
            },
          ) ?? Reflect.apply(original, map, args)
        );
      } finally {
        observer?.(receipt);
      }
    };
    this.installed.add(map);
  }

  read(read: () => string): { canonical: string; blocks: NativeSerialization['blocks'] | null } {
    this.install();
    const editor = this.runtime.editor;
    const map = editor?.nodeMap;
    const ending = Boolean(this.runtime.File?.useCRLF);
    let calls = 0;
    let receipt: NativeSerialization | undefined;
    const previous = this.observer;
    this.observer = (value) => {
      calls++;
      receipt = value;
    };
    let canonical: string;
    try {
      canonical = read();
    } finally {
      this.observer = previous;
      // An outer read containing a nested read is not the verified single-call path.
      previous?.(undefined);
    }
    if (
      calls !== 1 ||
      !receipt ||
      !editor ||
      editor !== this.runtime.editor ||
      map !== editor.nodeMap ||
      editor.sourceView.inSourceMode ||
      ending !== Boolean(this.runtime.File?.useCRLF) ||
      editor.warpContentWithOption(receipt.source) !== canonical ||
      !canonical.startsWith(receipt.source)
    )
      return { canonical, blocks: null };
    // Preserve the old tracking snapshot's identity invariant even when two
    // different native node objects unexpectedly expose the same cid.
    if (new Set(receipt.blocks.map((block) => block.id)).size !== receipt.blocks.length)
      return { canonical, blocks: null };
    const last = receipt.blocks.at(-1);
    if (last) {
      last.text += canonical.slice(receipt.source.length);
      last.to = canonical.length;
    }
    return { canonical, blocks: receipt.blocks };
  }
}
