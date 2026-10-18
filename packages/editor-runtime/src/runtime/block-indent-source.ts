import type { Patch, SourceMirrorCompletePrefix } from '@marklyra/editor-core';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyGlobals, LegacyNode } from './legacy-types.js';
import { readMarkdownPolicy } from './policy-options.js';
import {
  capturePolicyModel,
  serializePolicyModel,
  serializePolicyNodes,
} from './policy-serialization.js';

export type BlockIndentAction = 'indent' | 'outdent' | 'quote';
type StructuralPrefixAction = BlockIndentAction | 'join-item' | 'exit-item';
export type CompleteIndentPrefix = SourceMirrorCompletePrefix;
export interface BlockIndentReceipt {
  readonly base: string;
  readonly patches: readonly Patch[];
  readonly editCanonical: string;
  readonly canonical: string;
  readonly normalizationPatches: readonly Patch[];
  readonly completePrefixes: readonly CompleteIndentPrefix[];
  /** Same-value numeral spelling normalized before the original Undo snapshot. */
  readonly beforeNormalizationPatches?: readonly Patch[];
}
interface Context {
  readonly node: LegacyNode;
  readonly type: 'list' | 'quote';
  readonly style: string;
  readonly parent?: LegacyNode | undefined;
  readonly checked?: unknown;
  first?: string | undefined;
}
interface Leaf {
  readonly node: LegacyNode;
  readonly root: LegacyNode;
  readonly type: string;
  readonly body: readonly string[];
  readonly contexts: readonly Context[];
  readonly rootRange?: { readonly from: number; readonly to: number };
  readonly ahead?: number;
}
interface Line {
  readonly from: number;
  readonly to: number;
  readonly prefix: string;
  readonly body: string;
}
interface LocatedLeaf extends Leaf {
  readonly lines: readonly Line[];
}
interface DocumentSource {
  readonly canonical: string;
  readonly leaves: readonly LocatedLeaf[];
}
interface ItemJoin {
  readonly paragraph: LegacyNode;
  readonly before: LegacyNode;
  readonly after: LegacyNode;
}
function itemJoinTarget(runtime: LegacyGlobals): ItemJoin | undefined {
  const editor = runtime.editor,
    area = editor?.writingArea;
  const selection = area?.ownerDocument.getSelection();
  if (
    !editor ||
    !area ||
    !selection?.isCollapsed ||
    selection.rangeCount !== 1 ||
    !selection.anchorNode ||
    !area.contains(selection.anchorNode)
  )
    return;
  const paragraph = (
    selection.anchorNode.nodeType === 1
      ? (selection.anchorNode as Element)
      : selection.anchorNode.parentElement
  )?.closest('p[cid]');
  if (!paragraph || paragraph.querySelector('[md-inline]:not([md-inline="plain"])')) return;
  const node = editor.getNode(paragraph.getAttribute('cid') ?? '');
  if (!node || node.get('type') !== 'paragraph' || paragraph.textContent !== node.get('text'))
    return;
  const linked = (value: unknown): LegacyNode | undefined => {
    if (!isRecord(value) || typeof value.cid !== 'string') return;
    const known = editor.getNode(value.cid);
    if (
      !known ||
      !Object.is(known, value) ||
      Object.getPrototypeOf(known) !== Object.getPrototypeOf(node)
    )
      return;
    return known;
  };
  const item = linked(node.get('parent')),
    previous = item ? linked(get(item, 'before')) : undefined;
  const list = item ? linked(item.get('parent')) : undefined;
  if (
    !item ||
    item.get('type') !== 'list_item' ||
    item.getFirstChild() !== node ||
    !list ||
    list.get('type') !== 'list' ||
    !previous ||
    previous.get('type') !== 'list_item' ||
    previous.get('parent') !== list ||
    previous.get('after') !== item ||
    !['ul', 'ol'].includes(String(get(item, 'style') ?? get(list, 'style'))) ||
    (get(item, 'style') ?? get(list, 'style')) !== (get(previous, 'style') ?? get(list, 'style'))
  )
    return;
  try {
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(paragraph);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    if (range.cloneContents().textContent !== '') return;
  } catch {
    return;
  }
  return { paragraph: node, before: item, after: previous };
}
function emptyItemTarget(runtime: LegacyGlobals): boolean {
  const editor = runtime.editor,
    selection = editor?.writingArea.ownerDocument.getSelection();
  const node = selection?.anchorNode;
  const paragraph = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest(
    'p[cid]',
  );
  if (
    !editor ||
    selection?.rangeCount !== 1 ||
    !selection.isCollapsed ||
    !paragraph ||
    !editor.writingArea.contains(paragraph) ||
    paragraph.textContent !== ''
  )
    return false;
  const model = editor.getNode(paragraph.getAttribute('cid') ?? '');
  const linked = (value: unknown): LegacyNode | undefined => {
    if (!model || !isRecord(value) || typeof value.cid !== 'string') return;
    const known = editor.getNode(value.cid);
    return known &&
      Object.is(known, value) &&
      Object.getPrototypeOf(known) === Object.getPrototypeOf(model)
      ? known
      : undefined;
  };
  const item = linked(model?.get('parent'));
  const list = linked(item?.get('parent'));
  return (
    !!model &&
    model.get('type') === 'paragraph' &&
    model.get('text') === '' &&
    !!item &&
    item.get('type') === 'list_item' &&
    item.getFirstChild() === model &&
    !model.get('after') &&
    !item.get('after') &&
    !!list &&
    list.get('type') === 'list' &&
    !list.get('parent')
  );
}
function sameContexts(a: LocatedLeaf, b: LocatedLeaf): boolean {
  return (
    a.contexts.length === b.contexts.length &&
    a.contexts.every(
      (context, i) =>
        context.node === b.contexts[i]?.node &&
        context.parent === b.contexts[i]?.parent &&
        context.style === b.contexts[i]?.style &&
        context.checked === b.contexts[i]?.checked,
    )
  );
}
interface Token {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly role: CompleteIndentPrefix['role'];
}
const containers = new Set(['list', 'list_item', 'blockquote']);
const atomic = new Set([
  'paragraph',
  'heading',
  'fences',
  'math_block',
  'table',
  'hr',
  'meta_block',
  'def_link',
  'def_footnote',
  'html_block',
  'toc',
]);
const get = (node: LegacyNode, key: string): unknown => Reflect.apply(node.get, node, [key]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
const apply = (source: string, patches: readonly Patch[]): string => {
  let value = source;
  for (let index = patches.length - 1; index >= 0; index--) {
    const patch = patches[index];
    if (patch) value = value.slice(0, patch.from) + patch.insert + value.slice(patch.to);
  }
  return value;
};
function body(
  node: LegacyNode,
  mark: unknown,
  ending: string,
  allowEmpty = false,
): string[] | undefined {
  if (typeof mark !== 'string' || mark.length > 16 * 1024 * 1024) return;
  const lines = mark.split(ending),
    ahead = node.get('ahead') ?? 0;
  if (
    !Number.isSafeInteger(ahead) ||
    (ahead as number) < 0 ||
    lines.slice(0, ahead as number).some((line) => line !== '')
  )
    return;
  lines.splice(0, ahead as number);
  if (node.get('type') === 'paragraph') {
    const text = node.get('text');
    if (typeof text !== 'string' || (!text && !allowEmpty) || node.getFirstChild()) return;
    const count = text.split(/\r?\n/u).length;
    if (lines.length < count || lines.slice(count).some((line) => line !== '')) return;
    return lines.slice(0, count);
  }
  // Empty strings here are native ahead/tail slots. Delimited code/math/table
  // bodies retain their interior empty lines, including trailing code blanks.
  while (lines.at(-1) === '') lines.pop();
  if (!lines.length || (node.get('type') === 'fences' && get(node, 'noCloseTag'))) return;
  return lines;
}
function collect(
  runtime: LegacyGlobals,
  canonical: string,
  blocks?: readonly PlainBlockRange[],
  allowEmpty = false,
): Leaf[] | undefined {
  const editor = runtime.editor,
    capability: unknown = Reflect.get(runtime, '__MARKLYRA_NATIVE_SERIALIZATION__');
  if (
    !editor ||
    !isRecord(capability) ||
    !Object.isFrozen(capability) ||
    capability.version !== 1 ||
    capability.moduleSha256 !==
      'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb' ||
    !isRecord(capability.nodePrototype) ||
    typeof capability.nodeToMark !== 'function' ||
    capability.nodePrototype.toMark !== capability.nodeToMark
  )
    return;
  const ending = runtime.File?.useCRLF ? '\r\n' : '\n',
    output: Leaf[] = [],
    seen = new Set<LegacyNode>(),
    ids = new Set<string>();
  let valid = true;
  const visit = (
    node: LegacyNode,
    parent: LegacyNode | undefined,
    root: LegacyNode,
    contexts: Context[],
  ) => {
    if (
      !valid ||
      seen.has(node) ||
      ids.has(node.cid) ||
      seen.size >= 200_000 ||
      Object.getPrototypeOf(node) !== capability.nodePrototype ||
      editor.getNode(node.cid) !== node ||
      (node.get('parent') ?? undefined) !== parent
    ) {
      valid = false;
      return;
    }
    seen.add(node);
    ids.add(node.cid);
    const type = node.get('type');
    if (typeof type !== 'string') {
      valid = false;
      return;
    }
    if (!containers.has(type)) {
      if (!atomic.has(type)) {
        valid = false;
        return;
      }
      if (type === 'paragraph' && node.get('text') === '' && !parent) {
        const dom = [...editor.writingArea.querySelectorAll('[cid]')].find(
          (el) => el.getAttribute('cid') === node.cid,
        );
        if (dom?.classList.contains('unholdable')) return;
      }
      output.push({ node, root, type, body: [], contexts });
      return;
    }
    let context: Context | undefined;
    if (type === 'blockquote') context = { node, type: 'quote', style: '' };
    if (type === 'list_item') {
      if (parent?.get('type') !== 'list') {
        valid = false;
        return;
      }
      const style = get(node, 'style') ?? get(parent, 'style');
      if (style !== 'ul' && style !== 'ol' && style !== 'tasklist') {
        valid = false;
        return;
      }
      context = { node, type: 'list', style, parent, checked: get(node, 'checked') };
    }
    const childContexts = context ? [...contexts, context] : contexts;
    const start = output.length;
    for (let child = node.getFirstChild(); child; child = child.get('after')) {
      if (type === 'list' && child.get('type') !== 'list_item') {
        valid = false;
        return;
      }
      visit(child, node, root, childContexts);
      if (!valid) return;
    }
    if (context) context.first = output[start]?.node.cid;
    if (output.length === start) valid = false;
  };
  for (
    let root = editor.nodeMap.blocks.sortedFirst()?.getFirstBrother();
    root;
    root = root.get('after')
  ) {
    visit(root, undefined, root, []);
    if (!valid) return;
  }
  if (!output.length) return;
  const snapshot = capturePolicyModel(runtime);
  const serialized = serializePolicyModel(runtime, snapshot, readMarkdownPolicy(runtime));
  if (
    serialized.canonical !== canonical ||
    (blocks &&
      (blocks.length !== serialized.blocks.length ||
        blocks.some((block, i) => {
          const actual = serialized.blocks[i];
          return (
            !actual ||
            block.id !== actual.id ||
            block.from !== actual.from ||
            block.to !== actual.to ||
            block.text !== actual.text
          );
        })))
  )
    return;
  const marks = serializePolicyNodes(
    runtime,
    snapshot,
    output.map((leaf) => leaf.node.cid),
  );
  const roots = new Map(
    serialized.blocks.map((block) => [block.id, { from: block.from, to: block.to }]),
  );
  const result: Leaf[] = [];
  for (const leaf of output) {
    const own = body(leaf.node, marks.get(leaf.node.cid), ending, allowEmpty);
    if (!own) return;
    const rootRange = roots.get(leaf.root.cid);
    if (!rootRange) return;
    result.push({ ...leaf, body: own, rootRange, ahead: Number(leaf.node.get('ahead') ?? 0) });
  }
  return result;
}
function validPrefix(leaf: Leaf, line: number, prefix: string): boolean {
  const parsed = tokens(prefix, 0);
  if (!parsed) return false;
  const expected = leaf.contexts.filter(
    (context) => context.type === 'quote' || (context.first === leaf.node.cid && line === 0),
  );
  const actual = parsed.filter((token) => token.role !== 'indent');
  if (actual.length !== expected.length) return false;
  return expected.every((context, index) => {
    const token = actual[index];
    if (!token) return false;
    if (context.type === 'quote') return token.role === 'quote';
    if (token.role !== 'list-marker') return false;
    if (context.style === 'ol') return /^[0-9]+[.)][ \t]+$/u.test(token.text);
    if (context.style === 'tasklist')
      return context.checked
        ? /^[-+*][ \t]+\[[xX]\][ \t]+$/u.test(token.text)
        : /^[-+*][ \t]+\[ \][ \t]+$/u.test(token.text);
    return /^[-+*][ \t]+$/u.test(token.text);
  });
}
function locate(
  canonical: string,
  leaves: readonly Leaf[],
  ending: string,
): DocumentSource | undefined {
  const lines: { text: string; from: number; to: number }[] = [];
  let offset = 0;
  for (const text of canonical.split(ending)) {
    lines.push({ text, from: offset, to: offset + text.length });
    offset += text.length + ending.length;
  }
  const located: LocatedLeaf[] = [];
  let cursor = 0,
    checks = 0;
  for (const leaf of leaves) {
    // An empty root paragraph has no textual witness. Its exact contribution
    // comes from this fresh native root-serialization range, not the first of
    // several identical blank lines in the document.
    if (
      leaf.type === 'paragraph' &&
      leaf.node === leaf.root &&
      leaf.contexts.length === 0 &&
      leaf.body.length === 1 &&
      leaf.body[0] === ''
    ) {
      const scope = leaf.rootRange;
      if (
        !scope ||
        !Number.isSafeInteger(leaf.ahead) ||
        (leaf.ahead ?? -1) < 0 ||
        !Number.isSafeInteger(scope.from) ||
        !Number.isSafeInteger(scope.to) ||
        scope.from < 0 ||
        scope.to < scope.from ||
        scope.to > canonical.length ||
        !/^[\r\n]*$/u.test(canonical.slice(scope.from, scope.to))
      )
        return;
      const from = scope.from + (leaf.ahead ?? 0) * ending.length;
      if (!Number.isSafeInteger(from) || from < scope.from || from > scope.to) return;
      let start = cursor;
      while (lines[start] && (lines[start]?.from ?? 0) < from) {
        if (!/^[ \t>]*$/u.test(lines[start]?.text ?? '')) return;
        start++;
      }
      if (lines[start]?.from !== from || lines[start]?.text !== '' || from > scope.to) return;
      located.push({ ...leaf, lines: [{ from, to: from, prefix: '', body: '' }] });
      cursor = start + 1;
      continue;
    }
    let found: { start: number; mapped: Line[] } | undefined;
    for (let start = cursor; start < lines.length; start++) {
      const mapped: Line[] = [];
      let matches = true;
      for (let index = 0; index < leaf.body.length; index++) {
        if (++checks > 4_000_000) return;
        const actual = lines[start + index],
          payload = leaf.body[index];
        if (!actual || payload === undefined || !actual.text.endsWith(payload)) {
          matches = false;
          break;
        }
        const prefix = actual.text.slice(0, actual.text.length - payload.length);
        if (!validPrefix(leaf, index, prefix)) {
          matches = false;
          break;
        }
        mapped.push({ from: actual.from, to: actual.to, prefix, body: payload });
      }
      if (matches) {
        if (found) return; // More than one full body placement is not a receipt.
        found = { start, mapped };
      }
      if (!/^[ \t>]*$/u.test(lines[start]?.text ?? '')) break;
    }
    if (!found) return;
    located.push({ ...leaf, lines: found.mapped });
    cursor = found.start + leaf.body.length;
  }
  if (lines.slice(cursor).some((line) => !/^[ \t>]*$/u.test(line.text))) return;
  return { canonical, leaves: located };
}
function tokens(prefix: string, from: number): Token[] | undefined {
  const output: Token[] = [];
  let at = 0;
  while (at < prefix.length) {
    if (output.length >= 256 || prefix.length > 65_536) return;
    const tail = prefix.slice(at);
    const indent = /^[ \t]+/u.exec(tail)?.[0];
    const quote = /^>[ \t]*/u.exec(tail)?.[0];
    const marker = /^(?:[-+*]|[0-9]+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/u.exec(tail)?.[0];
    const value = indent ?? quote ?? marker;
    if (!value) return;
    output.push({
      from: from + at,
      to: from + at + value.length,
      text: value,
      role: indent ? 'indent' : quote ? 'quote' : 'list-marker',
    });
    at += value.length;
  }
  return output;
}
interface PrefixChange {
  patch: Patch;
  role?: CompleteIndentPrefix['role'];
}
/** Tokens are semantic container components, not arbitrary whitespace runs in a
 * document. Exact matches retain outer quote/marker representation in raw. */
export function indentPrefixChanges(
  before: string,
  after: string,
  offset: number,
  separateRoleChanges = false,
): PrefixChange[] | undefined {
  const a = tokens(before, offset),
    b = tokens(after, 0);
  if (!a || !b || a.length > 128 || b.length > 128) return;
  const costs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const cost = (i: number, j: number) => costs[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = a.length; i >= 0; i--) {
    const row = costs[i];
    if (!row) return;
    for (let j = b.length; j >= 0; j--) {
      if (i === a.length) row[j] = b.length - j;
      else if (j === b.length) row[j] = a.length - i;
      else
        row[j] = Math.min(
          cost(i + 1, j) + 1,
          cost(i, j + 1) + 1,
          cost(i + 1, j + 1) + (a[i]?.text === b[j]?.text ? 0 : a[i]?.role === b[j]?.role ? 1 : 3),
        );
    }
  }
  const output: PrefixChange[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    const old = a[i],
      next = b[j];
    if (old && next && old.text === next.text && cost(i, j) === cost(i + 1, j + 1)) {
      i++;
      j++;
      continue;
    }
    if (old && next && old.role === next.role && cost(i, j) === cost(i + 1, j + 1) + 1) {
      output.push({ patch: { from: old.from, to: old.to, insert: next.text }, role: old.role });
      i++;
      j++;
    } else if (next && (!old || cost(i, j) === cost(i, j + 1) + 1)) {
      const from = old?.from ?? offset + before.length;
      const previous = output.at(-1);
      if (previous?.patch.from === from && previous.patch.to === from)
        output[output.length - 1] = {
          ...previous,
          patch: { ...previous.patch, insert: previous.patch.insert + next.text },
        };
      else output.push({ patch: { from, to: from, insert: next.text } });
      j++;
    } else if (old) {
      output.push({ patch: { from: old.from, to: old.to, insert: '' }, role: old.role });
      i++;
    } else return;
  }
  // An insertion before a rewritten token has one source position, so combine
  // only those coincident edits and retain the old token's complete role.
  for (let index = 0; index + 1 < output.length; ) {
    const first = output[index],
      second = output[index + 1];
    if (
      first &&
      second &&
      first.patch.from === first.patch.to &&
      first.patch.from === second.patch.from
    ) {
      if (
        separateRoleChanges &&
        second.role &&
        second.patch.insert === '' &&
        /^[ \t]+$/u.test(first.patch.insert)
      ) {
        // The transaction engine requires distinct starts. Deleting the whole
        // token and inserting at its old end is the same edit, while retaining
        // syntax authority only on the deletion.
        output.splice(index, 2, second, {
          patch: {
            from: second.patch.to,
            to: second.patch.to,
            insert: first.patch.insert,
          },
        });
        index += 2;
        continue;
      }
      output.splice(index, 2, {
        patch: {
          from: second.patch.from,
          to: second.patch.to,
          insert: first.patch.insert + second.patch.insert,
        },
        ...(second.role ? { role: second.role } : {}),
      });
    } else index++;
  }
  return output;
}
function gapPatch(before: string, after: string, from: number): Patch | undefined {
  if (before === after) return;
  let start = 0,
    end = 0;
  // Keep the existing separator nearest the next body. A new separating EOL
  // belongs at the preceding body's end, never inside the next marker token.
  while (
    end < before.length &&
    end < after.length &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  while (
    start < before.length - end &&
    start < after.length - end &&
    before[start] === after[start]
  )
    start++;
  return {
    from: from + start,
    to: from + before.length - end,
    insert: after.slice(start, after.length - end),
  };
}
/** Compare only identity-bound serialized bodies and their container prefixes.
 * No AST is serialized into raw, no content match picks a repeated occurrence. */
function receipt(
  before: DocumentSource,
  after: DocumentSource,
  action: StructuralPrefixAction,
  join?: ItemJoin,
): BlockIndentReceipt | undefined {
  if (before.leaves.length !== after.leaves.length) return;
  const primary: PrefixChange[] = [],
    normalization: Patch[] = [],
    beforeNormalization: Patch[] = [];
  let changedDepth = false,
    changedOwner = false,
    oldEnd = 0,
    newEnd = 0;
  let previousOld: LocatedLeaf | undefined, previousNew: LocatedLeaf | undefined;
  const gap = (
    oldTo: number,
    newTo: number,
    old: LocatedLeaf | undefined,
    next: LocatedLeaf | undefined,
  ) => {
    const from = before.canonical.slice(oldEnd, oldTo),
      to = after.canonical.slice(newEnd, newTo);
    if (from === to) return true;
    if (!/^[\r\n \t>]*$/u.test(from) || !/^[\r\n \t>]*$/u.test(to)) return false;
    const stable =
      (!old || !next || old.root === next.root) &&
      (!previousOld || !previousNew || previousOld.root === previousNew.root) &&
      (action !== 'join-item' ||
        ((!old || !next || sameContexts(old, next)) &&
          (!previousOld || !previousNew || sameContexts(previousOld, previousNew))));
    const patch = gapPatch(from, to, oldEnd);
    if (patch) {
      if (stable && /^[\r\n \t]*$/u.test(from) && /^[\r\n \t]*$/u.test(to))
        normalization.push(patch);
      else primary.push({ patch });
    }
    return true;
  };
  for (let index = 0; index < before.leaves.length; index++) {
    const old = before.leaves[index],
      next = after.leaves[index];
    if (
      !old ||
      !next ||
      old.node !== next.node ||
      old.node.cid !== next.node.cid ||
      old.type !== next.type ||
      old.body.length !== next.body.length ||
      old.body.some((line, i) => line !== next.body[i])
    )
      return;
    for (const context of old.contexts) {
      const retained = next.contexts.find((current) => current.node === context.node);
      if (retained && context.checked !== retained.checked) return;
    }
    const oldDepth = old.contexts.length,
      newDepth = next.contexts.length;
    if (action === 'join-item') {
      if (!join || old.root !== next.root || oldDepth !== newDepth) return;
      for (let i = 0; i < old.contexts.length; i++) {
        const a = old.contexts[i],
          b = next.contexts[i];
        if (
          !a ||
          !b ||
          a.type !== b.type ||
          a.parent !== b.parent ||
          a.style !== b.style ||
          a.checked !== b.checked ||
          b.node !== (a.node === join.before ? join.after : a.node)
        )
          return;
      }
      if (
        old.node === join.paragraph &&
        old.contexts.some((c) => c.node === join.before) &&
        next.contexts.some((c) => c.node === join.after)
      )
        changedOwner = true;
    }
    if (oldDepth !== newDepth) {
      if (
        (action === 'indent' && newDepth < oldDepth) ||
        (action === 'outdent' && newDepth > oldDepth)
      )
        return;
      changedDepth = true;
    }
    const first = old.lines[0],
      target = next.lines[0];
    if (!first || !target || !gap(first.from, target.from, old, next)) return;
    for (let line = 0; line < old.lines.length; line++) {
      const a = old.lines[line],
        b = next.lines[line];
      if (!a || !b || a.body !== b.body) return;
      const changes = indentPrefixChanges(a.prefix, b.prefix, a.from, action === 'join-item');
      if (!changes) return;
      const samePath =
        old.contexts.length === next.contexts.length &&
        old.contexts.every(
          (context, i) =>
            context.node === next.contexts[i]?.node &&
            context.parent === next.contexts[i]?.parent &&
            context.style === next.contexts[i]?.style &&
            context.checked === next.contexts[i]?.checked,
        );
      for (const change of changes) {
        const oldToken = before.canonical.slice(change.patch.from, change.patch.to);
        const oldNumber = /^(\d+)([.)][ \t]+)$/u.exec(oldToken);
        const newNumber = /^(\d+)([.)][ \t]+)$/u.exec(change.patch.insert);
        const renumber =
          samePath &&
          change.role === 'list-marker' &&
          oldNumber &&
          newNumber &&
          oldNumber[2] === newNumber[2];
        if (
          renumber &&
          oldNumber &&
          newNumber &&
          (oldNumber[1]?.replace(/^0+/u, '') || '0') === (newNumber[1]?.replace(/^0+/u, '') || '0')
        )
          beforeNormalization.push(change.patch);
        if (renumber || (!a.body && /^[ \t]*$/u.test(a.prefix) && /^[ \t]*$/u.test(b.prefix)))
          normalization.push(change.patch);
        else primary.push(change);
      }
    }
    oldEnd = old.lines.at(-1)?.to ?? 0;
    newEnd = next.lines.at(-1)?.to ?? 0;
    previousOld = old;
    previousNew = next;
  }
  if (
    !(changedDepth || changedOwner) ||
    !gap(before.canonical.length, after.canonical.length, undefined, undefined)
  )
    return;
  primary.sort((a, b) => a.patch.from - b.patch.from);
  normalization.sort((a, b) => a.from - b.from);
  const patches = primary.map((value) => value.patch);
  if (patches.some((patch, i) => i > 0 && patch.from < (patches[i - 1]?.to ?? 0))) return;
  const completePrefixes = primary.flatMap((value, patchIndex) =>
    value.role && value.patch.to > value.patch.from
      ? [
          {
            patchIndex,
            canonical: { from: value.patch.from, to: value.patch.to },
            role: value.role,
          },
        ]
      : [],
  );
  const editCanonical = apply(before.canonical, patches);
  const shifted: Patch[] = [];
  for (const patch of normalization) {
    if (
      patches.some(
        (primary) =>
          (primary.from < patch.to && primary.to > patch.from) ||
          (primary.from === patch.from && primary.to === primary.from),
      )
    )
      return;
    const delta = patches
      .filter((primary) => primary.to <= patch.from)
      .reduce((sum, primary) => sum + primary.insert.length - (primary.to - primary.from), 0);
    shifted.push({ from: patch.from + delta, to: patch.to + delta, insert: patch.insert });
  }
  if (apply(editCanonical, shifted) !== after.canonical) return;
  return {
    base: before.canonical,
    patches,
    editCanonical,
    canonical: after.canonical,
    normalizationPatches: shifted,
    completePrefixes,
    ...(beforeNormalization.length ? { beforeNormalizationPatches: beforeNormalization } : {}),
  };
}

export type { DocumentSource as StructuralDocumentSource, LocatedLeaf as StructuralSourceLeaf };
export const locateStructuralSource = locate;

/** A fresh, identity-bound view of native serialized leaf bodies. Empty list
 * paragraphs are admitted only for the explicit keyboard-break proof. */
export function readStructuralSource(
  runtime: LegacyGlobals,
  canonical: string,
  ending: '\n' | '\r\n',
  blocks?: readonly PlainBlockRange[],
  allowEmpty = false,
): DocumentSource | undefined {
  if (!runtime.File || (runtime.File.useCRLF ? '\r\n' : '\n') !== ending) return;
  const leaves = collect(runtime, canonical, blocks, allowEmpty);
  return leaves ? locate(canonical, leaves, ending) : undefined;
}

export function captureBlockIndent(
  runtime: LegacyGlobals,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  action: StructuralPrefixAction,
  ending: '\n' | '\r\n',
): ((next: string) => BlockIndentReceipt | undefined) | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (
    !editor ||
    !file ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    file.isLocked ||
    (file.useCRLF ? '\r\n' : '\n') !== ending ||
    !['indent', 'outdent', 'quote', 'join-item', 'exit-item'].includes(action)
  )
    return;
  const join = action === 'join-item' ? itemJoinTarget(runtime) : undefined;
  if (action === 'join-item' && !join) return;
  if (action === 'exit-item' && !emptyItemTarget(runtime)) return;
  const active = editor.writingArea.ownerDocument.activeElement;
  if (active?.closest('.CodeMirror, input, textarea')) return;
  const selection = editor.writingArea.ownerDocument.getSelection();
  if (
    !selection?.rangeCount ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !editor.writingArea.contains(selection.anchorNode) ||
    !editor.writingArea.contains(selection.focusNode)
  )
    return;
  if (
    !blocks.length ||
    blocks[0]?.from !== 0 ||
    blocks.at(-1)?.to !== canonical.length ||
    blocks.some(
      (block, i) =>
        canonical.slice(block.from, block.to) !== block.text ||
        (i > 0 && blocks[i - 1]?.to !== block.from),
    )
  )
    return;
  const leaves = collect(runtime, canonical, blocks, action === 'exit-item'),
    before = leaves ? locate(canonical, leaves, ending) : undefined;
  if (!before) return;
  const map = editor.nodeMap,
    option = file.option;
  const keys = [
    'indentSize',
    'indentByTab',
    'prettyIndent',
    'headingStyle',
    'ulStyle',
    'olStyle',
    'enableInlineMath',
  ] as const;
  const policy = keys.map((key) => Reflect.get(option, key));
  const finalNewline = Reflect.get(file, 'finalNewline');
  return (next) => {
    if (
      runtime.editor !== editor ||
      runtime.File !== file ||
      editor.nodeMap !== map ||
      editor.isIME ||
      editor.sourceView.inSourceMode ||
      file.isLocked ||
      (file.useCRLF ? '\r\n' : '\n') !== ending ||
      option !== file.option ||
      keys.some((key, i) => Reflect.get(option, key) !== policy[i]) ||
      Reflect.get(file, 'finalNewline') !== finalNewline
    )
      return;
    const current = collect(runtime, next, undefined, action === 'exit-item'),
      after = current ? locate(next, current, ending) : undefined;
    return after
      ? receipt(before, after, action === 'exit-item' ? 'outdent' : action, join)
      : undefined;
  };
}
