import type { Patch } from '@marklyra/editor-core';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyEditor } from './legacy-types.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']>;
export interface CodeLineRange {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
}
export interface ExactCodeChange {
  base: string;
  patches: readonly Patch[];
}

function patched(source: string, patches: readonly Patch[]): string {
  for (const patch of [...patches].reverse())
    source = source.slice(0, patch.from) + patch.insert + source.slice(patch.to);
  return source;
}

/** A receipt-backed top-level fence proof. No search for a repeated body and no
 * full-block replacement: only the CM's authorized whole-line ranges. */
export function captureCodeLineCut(
  editor: LegacyEditor,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  cid: string,
  cm: CM,
  ranges: readonly CodeLineRange[],
): ((next: string) => ExactCodeChange | undefined) | undefined {
  const node = editor.getNode(cid);
  const block = blocks.find((entry) => entry.id === cid);
  if (
    editor.sourceView.inSourceMode ||
    editor.fences.queue?.[cid] !== cm ||
    !node ||
    node.get('type') !== 'fences' ||
    node.get('parent') ||
    !block ||
    canonical.slice(block.from, block.to) !== block.text ||
    !ranges.length
  )
    return;

  const value = cm.getValue();
  const opening = /^(`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/.exec(block.text);
  const marker = opening?.[1];
  if (!opening || !marker) return;
  const bodyFrom = opening[0].length;
  if (block.text.slice(bodyFrom, bodyFrom + value.length) !== value) return;
  const tail = block.text.slice(bodyFrom + value.length);
  const character = marker[0] === '`' ? '`' : '~';
  const closing = new RegExp(
    `^(?:\\r\\n|\\r|\\n)${character}{${marker.length},}[ \\t]*(?:(?:\\r\\n|\\r|\\n))*$`,
  );
  if (!closing.test(tail)) return;

  const nativePatches: Patch[] = [];
  let previousFrom = Number.POSITIVE_INFINITY;
  for (const range of ranges) {
    const { from, to } = range;
    if (
      ![from.line, from.ch, to.line, to.ch].every(Number.isSafeInteger) ||
      from.line < 0 ||
      from.ch !== 0 ||
      to.ch < 0
    )
      return;
    const line = cm.getLine(from.line);
    if (line === undefined) return;
    const nextExists = cm.getLine(from.line + 1) !== undefined;
    if (
      nextExists
        ? to.line !== from.line + 1 || to.ch !== 0
        : to.line !== from.line || to.ch !== line.length
    )
      return;
    const start = cm.indexFromPos(from),
      end = cm.indexFromPos(to);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= end ||
      end > value.length ||
      end > previousFrom
    )
      return;
    nativePatches.push({ from: start, to: end, insert: '' });
    previousFrom = start;
  }
  nativePatches.reverse();
  const patches = nativePatches.map((patch) => ({
    from: block.from + bodyFrom + patch.from,
    to: block.from + bodyFrom + patch.to,
    insert: '',
  }));
  const expectedValue = patched(value, nativePatches);
  const expected = patched(canonical, patches);
  const document = cm.doc;
  return (next) => {
    if (
      editor.sourceView.inSourceMode ||
      editor.getNode(cid) !== node ||
      editor.fences.queue?.[cid] !== cm ||
      cm.doc !== document ||
      node.get('type') !== 'fences' ||
      node.get('parent') ||
      cm.getValue() !== expectedValue ||
      next !== expected
    )
      return;
    return { base: canonical, patches };
  };
}
