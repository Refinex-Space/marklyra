import type { Patch } from './types.js';

/** Internal spans; endpoints are mutable only while constructing a fresh table. */
export interface Correspondence {
  readonly sourceFrom: number;
  sourceTo: number;
  readonly canonicalFrom: number;
  canonicalTo: number;
  readonly equal: boolean;
}

// These atoms cannot introduce the ASCII syntax used by the correspondence
// validator: whitespace, list prefixes, fences, or YAML delimiters. ZWJ and
// variation selectors let a complete pictographic sequence stay one text edit.
const plainText = /^(?:[\p{L}\p{M}\p{Extended_Pictographic}]|\u200D)*$/u;
const plainAtom = /^(?:[\p{L}\p{M}\p{Extended_Pictographic}]|\u200D)+$/u;

function previousPoint(text: string, at: number): number {
  const last = text.charCodeAt(at - 1);
  return last >= 0xdc00 && last <= 0xdfff ? at - 2 : at - 1;
}

/**
 * Reuse only proven equal text spans. The caller has already validated/applied
 * both physical patch sets and normalized the complete resulting strings.
 * An unchanged adjacent plain atom must remain inside this equal span. Thus the
 * edited token cannot become a line-level normalization delimiter, including at
 * EOF or beside an unchanged newline. Actual projected raw ranges must agree;
 * edits materializing a virtual separator or touching normalized padding fail
 * this proof and use the complete correspondence builder instead.
 */
export function updateEqualCorrespondence(
  ranges: Correspondence[],
  canonical: string,
  canonicalPatches: readonly Patch[],
  sourcePatches: readonly Patch[],
): Correspondence[] | undefined {
  if (
    !canonicalPatches.length ||
    canonicalPatches.length > 32 ||
    canonicalPatches.length !== sourcePatches.length
  )
    return undefined;
  const retained = (from: number, to: number) =>
    !canonicalPatches.some((patch) => patch.from < to && patch.to > from);
  const deltas = new Map<number, number>();
  for (let index = 0; index < canonicalPatches.length; index++) {
    const patch = canonicalPatches[index],
      raw = sourcePatches[index];
    if (
      !patch ||
      !raw ||
      !plainText.test(patch.insert) ||
      !plainText.test(canonical.slice(patch.from, patch.to))
    )
      return undefined;
    let low = 0,
      high = ranges.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((ranges[middle]?.canonicalTo ?? Infinity) < patch.from) low = middle + 1;
      else high = middle;
    }
    let matched = false;
    for (let at = low; at < ranges.length; at++) {
      const span = ranges[at];
      if (!span || span.canonicalFrom > patch.from) break;
      if (!span.equal || span.canonicalTo < patch.to) continue;
      const preceding = previousPoint(canonical, patch.from);
      const followingWidth = (canonical.codePointAt(patch.to) ?? 0) > 0xffff ? 2 : 1;
      const leftGuard =
        preceding >= span.canonicalFrom &&
        retained(preceding, patch.from) &&
        plainAtom.test(canonical.slice(preceding, patch.from));
      const rightGuard =
        patch.to + followingWidth <= span.canonicalTo &&
        retained(patch.to, patch.to + followingWidth) &&
        plainAtom.test(canonical.slice(patch.to, patch.to + followingWidth));
      if (!leftGuard && !rightGuard) continue;
      if (
        raw.from !== span.sourceFrom + patch.from - span.canonicalFrom ||
        raw.to !== span.sourceFrom + patch.to - span.canonicalFrom ||
        raw.insert !== patch.insert
      )
        continue;
      deltas.set(at, (deltas.get(at) ?? 0) + patch.insert.length - (patch.to - patch.from));
      matched = true;
      break;
    }
    if (!matched) return undefined;
  }
  if ([...deltas.values()].every((delta) => delta === 0)) return ranges;
  let shift = 0;
  return ranges.map((span, index) => {
    const delta = deltas.get(index) ?? 0;
    const next =
      shift === 0 && delta === 0
        ? span
        : {
            sourceFrom: span.sourceFrom + shift,
            sourceTo: span.sourceTo + shift + delta,
            canonicalFrom: span.canonicalFrom + shift,
            canonicalTo: span.canonicalTo + shift + delta,
            equal: span.equal,
          };
    shift += delta;
    return next;
  });
}
