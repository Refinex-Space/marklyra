import type { Patch } from '@marklyra/editor-core';
import { ImageHostError } from './contracts.js';

export interface ImageDestination {
  from: number;
  to: number;
  source: string;
  syntax: 'markdown' | 'html' | 'definition';
  /** Several rendered reference images may share one destination definition. */
  uses?: number;
}
export interface ImageReferenceReplacement {
  source: string;
  target: string;
}
const fail = () => new ImageHostError('此图片语法暂不支持可验证的引用迁移，已保留原文与资源');
function escaped(text: string, at: number): boolean {
  let count = 0;
  while (at && text[--at] === '\\') count++;
  return count % 2 === 1;
}
function safeDestination(value: string): void {
  if (!value || /[<>"'`\\]/u.test(value)) throw fail();
  for (let at = 0; at < value.length; at++)
    if (value.charCodeAt(at) <= 32 || value.charCodeAt(at) === 127) throw fail();
  if (/^(?:javascript|vbscript|data):/i.test(value)) throw fail();
}
/** A deliberately conservative source recognizer. It does not render Markdown.
 * Unsupported or shared reference definitions fail closed before resource IO. */
export function imageDestinations(text: string): ImageDestination[] {
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw fail();
  const mask = text.split('');
  const hide = (from: number, to: number) => {
    for (let at = from; at < to; at++) if (mask[at] !== '\r' && mask[at] !== '\n') mask[at] = ' ';
  };
  let fence: { character: string; size: number } | undefined;
  const opening = /^(?:\uFEFF)?---(?:\r\n|\r|\n)/.exec(text);
  let frontMatter = Boolean(
    opening && /^(?:---|\.\.\.)[ \t]*(?:\r\n|\r|\n|$)/m.test(text.slice(opening[0].length)),
  );
  let first = true;
  for (const line of text.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!line[0]) break;
    const raw = line[0].replace(/[\r\n]+$/, ''),
      from = line.index;
    if (frontMatter) {
      hide(from, from + line[0].length);
      if (!first && /^(?:---|\.\.\.)\s*$/.test(raw)) frontMatter = false;
    } else if (fence) {
      hide(from, from + line[0].length);
      const close = /^ {0,3}(`+|~+)\s*$/.exec(raw);
      if (close?.[1]?.[0] === fence.character && close[1].length >= fence.size) fence = undefined;
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
      if (open?.[1]) {
        fence = { character: open[1][0] ?? '', size: open[1].length };
        hide(from, from + line[0].length);
      } else if (/^(?: {4}|\t)/.test(raw)) hide(from, from + line[0].length);
    }
    first = false;
  }
  // Keep block HTML content out of the recognizer, including literal examples.
  for (const match of text.matchAll(
    /<!--[\s\S]*?(?:-->|$)|<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
  ))
    hide(match.index, match.index + match[0].length);
  let visible = mask.join('');
  for (const match of visible.matchAll(/(`+)[\s\S]*?\1(?!`)/g)) {
    if (!escaped(visible, match.index)) hide(match.index, match.index + match[0].length);
  }
  visible = mask.join('');
  const found: ImageDestination[] = [];
  const refs = new Map<string, number>(),
    normalRefs = new Set<string>();
  const normalizeRef = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  for (let at = 0; at < visible.length; at++) {
    const image = visible.startsWith('![', at) && !escaped(visible, at);
    if (!image && (visible[at] !== '[' || escaped(visible, at))) continue;
    const labelStart = at + (image ? 2 : 1);
    let close = labelStart,
      depth = 0;
    for (; close < visible.length; close++) {
      if (escaped(visible, close)) continue;
      if (visible[close] === '[') depth++;
      if (visible[close] === ']') {
        if (!depth) break;
        depth--;
      }
      if (/\r|\n/.test(visible[close] ?? '')) break;
    }
    if (visible[close] !== ']') {
      if (image) throw fail();
      continue;
    }
    const label = visible.slice(labelStart, close);
    if (image && /<\s*img\b/i.test(label)) throw fail();
    let next = close + 1;
    // Definition lines are handled below; do not classify their label as a link.
    if (visible[next] === ':') {
      at = close;
      continue;
    }
    if (visible[next] === '(') {
      if (!image) {
        at = close;
        continue;
      }
      next++;
      while (/[ \t]/.test(visible[next] ?? '') && next < visible.length) next++;
      const angle = visible[next] === '<';
      const from = next + (angle ? 1 : 0);
      let to = from,
        nesting = 0;
      for (; to < visible.length; to++) {
        const char = visible[to];
        if (char === '\\') throw fail();
        if (angle ? char === '>' : !nesting && (char === ')' || /\s/.test(char ?? ''))) break;
        if (!angle && char === '(') nesting++;
        else if (!angle && char === ')') nesting--;
        if (/\r|\n/.test(char ?? '')) throw fail();
      }
      const source = text.slice(from, to);
      safeDestination(source);
      const tail = visible.slice(to + (angle ? 1 : 0));
      const end = /^(?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^\r\n]*?\)))?[ \t]*\)/.exec(tail);
      if (!end || (angle && visible[to] !== '>')) throw fail();
      found.push({ from, to, source, syntax: 'markdown' });
      at = to + (angle ? 1 : 0) + end[0].length - 1;
      continue;
    }
    let ref = label;
    if (visible[next] === '[') {
      const end = visible.indexOf(']', next + 1);
      if (end < 0 || /[\r\n\\]/.test(visible.slice(next + 1, end))) {
        if (image) throw fail();
        continue;
      }
      ref = visible.slice(next + 1, end) || label;
      at = end;
    } else at = close;
    const refKey = normalizeRef(ref);
    if (image) refs.set(refKey, (refs.get(refKey) ?? 0) + 1);
    else normalRefs.add(refKey);
  }
  const definitions = new Map<string, ImageDestination>();
  for (const match of visible.matchAll(
    /^ {0,3}\[([^\]\r\n]+)\]:[ \t]*(?:<([^>\r\n]*)>|([^\s]+))/gm,
  )) {
    const key = normalizeRef(match[1] ?? '');
    if (!refs.has(key)) continue;
    if (normalRefs.has(key) || definitions.has(key)) throw fail();
    const source = match[2] ?? match[3] ?? '';
    safeDestination(source);
    const relative = match[0].indexOf(source, match[0].indexOf(']:') + 2);
    definitions.set(key, {
      from: match.index + relative,
      to: match.index + relative + source.length,
      source,
      syntax: 'definition',
      uses: refs.get(key) ?? 1,
    });
  }
  for (const key of refs.keys()) {
    const definition = definitions.get(key);
    if (!definition) throw fail();
    found.push(definition);
  }
  for (const match of visible.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    let at = 4,
      selected: { from: number; to: number } | undefined;
    while (at < tag.length) {
      while (/\s/.test(tag[at] ?? '') && at < tag.length) at++;
      if (tag[at] === '>' || tag.slice(at) === '/>') break;
      const name = /^[a-z_:][a-z\d_.:-]*/i.exec(tag.slice(at))?.[0];
      if (!name) throw fail();
      at += name.length;
      while (/\s/.test(tag[at] ?? '') && at < tag.length) at++;
      if (tag[at] !== '=') {
        if (name.toLowerCase() === 'src') throw fail();
        continue;
      }
      at++;
      while (/\s/.test(tag[at] ?? '') && at < tag.length) at++;
      const quote = tag[at] === '"' || tag[at] === "'" ? tag[at++] : undefined;
      const from = at;
      if (quote) {
        at = tag.indexOf(quote, at);
        if (at < 0) throw fail();
      } else {
        while (at < tag.length && !/[\s>]/.test(tag[at] ?? '')) at++;
      }
      if (name.toLowerCase() === 'src') {
        if (selected) throw fail();
        selected = { from, to: at };
      }
      if (quote) at++;
    }
    if (!selected) throw fail();
    const source = tag.slice(selected.from, selected.to);
    if (source.includes('&')) throw fail();
    safeDestination(source);
    const relative = selected.from;
    found.push({
      from: match.index + relative,
      to: match.index + relative + source.length,
      source,
      syntax: 'html',
    });
  }
  return found.sort((a, b) => a.from - b.from);
}
export function imageReferencePatches(
  source: string,
  replacements: readonly ImageReferenceReplacement[],
): Patch[] {
  if (!Array.isArray(replacements) || replacements.length > 128) throw fail();
  const mapping = new Map<string, string>();
  for (const value of replacements) {
    if (
      !value ||
      typeof value.source !== 'string' ||
      typeof value.target !== 'string' ||
      mapping.has(value.source)
    )
      throw fail();
    safeDestination(value.source);
    safeDestination(value.target);
    mapping.set(value.source, value.target);
  }
  const destinations = imageDestinations(source);
  for (const value of mapping.keys())
    if (!destinations.some((item) => item.source === value)) throw fail();
  return destinations.flatMap((item) => {
    const target = mapping.get(item.source);
    if (target === undefined || target === item.source) return [];
    if (item.syntax !== 'html' && /[()]/.test(target)) throw fail();
    if (item.syntax === 'html' && /&/.test(target)) throw fail();
    return [{ from: item.from, to: item.to, insert: target }];
  });
}
export function applyImagePatches(source: string, patches: readonly Patch[]): string {
  let next = source;
  for (let index = patches.length - 1; index >= 0; index--) {
    const patch = patches[index];
    if (patch) next = next.slice(0, patch.from) + patch.insert + next.slice(patch.to);
  }
  return next;
}
/** Pure preview after getImageReferences has proved the same source revision.
 * It grants no file authority and performs no renderer/history operation. */
export function rewriteImageReferences(
  source: string,
  replacements: readonly ImageReferenceReplacement[],
): string {
  return applyImagePatches(source, imageReferencePatches(source, replacements));
}
