/**
 * Linear aggregation for the internal MarkLyra block serializer ABI.
 * Native per-node serialization remains authoritative; no output is cached.
 */
interface NativeNode {
  readonly cid: string;
  readonly attributes: Record<string, unknown>;
  toMark(): string;
  getFirstBrother(): unknown;
}
export interface SerializedBlock {
  id: string;
  from: number;
  to: number;
  text: string;
}
export interface NativeSerialization {
  source: string;
  blocks: SerializedBlock[];
}

const topTypes = new Set([
  'paragraph',
  'heading',
  'list',
  'blockquote',
  'table',
  'fences',
  'math_block',
  'meta_block',
  'def_link',
  'def_footnote',
  'hr',
  'toc',
  'html_block',
]);
const containers = new Set(['list', 'list_item', 'blockquote', 'table', 'table_row']);
const textTypes = new Set(['paragraph', 'table_cell', 'fences', 'html_block']);
const childTypes = new Set(['list_item', 'table_row', 'table_cell']);
const withoutSentinel = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\uE027/g, '') : '';
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
function nativeNode(value: unknown): value is NativeNode {
  return (
    record(value) &&
    typeof value.cid === 'string' &&
    record(value.attributes) &&
    typeof value.toMark === 'function' &&
    typeof value.getFirstBrother === 'function'
  );
}

export interface NativeLineBinding {
  capability: unknown;
  original: unknown;
  useCRLF(): boolean;
}

/** The optional capability is exported by the Markdown serializer module
 * and reads its private closure directly. */
function runtimeLines(
  nodeMap: unknown,
  binding: NativeLineBinding | undefined,
  observe: ((result: NativeSerialization) => void) | undefined,
): string | undefined {
  const capability = binding?.capability;
  if (
    !binding ||
    !record(nodeMap) ||
    !record(capability) ||
    !Object.isFrozen(capability) ||
    capability.version !== 1 ||
    capability.moduleSha256 !==
      'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb' ||
    capability.array !== Array ||
    typeof capability.mapToMark !== 'function' ||
    typeof capability.nodeToMark !== 'function' ||
    !record(capability.mapPrototype) ||
    !record(capability.nodePrototype) ||
    Object.getPrototypeOf(nodeMap) !== capability.mapPrototype ||
    capability.mapPrototype.toMark !== capability.mapToMark ||
    capability.nodePrototype.toMark !== capability.nodeToMark ||
    binding.original !== capability.mapToMark ||
    typeof capability.lines !== 'function' ||
    !record(nodeMap.blocks) ||
    typeof nodeMap.blocks.length !== 'number' ||
    typeof nodeMap.blocks.sortedFirst !== 'function'
  )
    return undefined;
  const contributions: { id: string | undefined; start: number; count: number; text: string }[] =
    [];
  const strings: string[] = [];
  const lines: unknown[] = [];
  let precise = true;
  if (nodeMap.blocks.length > 0) {
    const first: unknown = Reflect.apply(nodeMap.blocks.sortedFirst, nodeMap.blocks, []);
    if (!record(first) || typeof first.getFirstBrother !== 'function') return undefined;
    let current: unknown = Reflect.apply(first.getFirstBrother, first, []);
    const seen = new Set<object>();
    do {
      if (!record(current) || typeof current.get !== 'function' || seen.has(current))
        throw new Error('Invalid runtime serializer block chain');
      if (seen.size >= 200_000) throw new Error('Runtime serializer block limit exceeded');
      seen.add(current);
      // Preserve native call order: serialization may normalize attributes before
      // the next sibling is read. Never rerun the serializer after partial effects.
      const value: unknown = Reflect.apply(capability.lines, current, []);
      // A plain native read needs only the source. Source-tracking ranges are
      // optional, and inspecting/allocating them changes the unobserved path.
      const descriptor = observe ? Object.getOwnPropertyDescriptor(current, 'cid') : undefined;
      const id =
        descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
          ? descriptor.value
          : undefined;
      if (id === undefined) precise = false;
      const start = lines.length;
      if (value instanceof Array) {
        for (let index = 0; index < value.length; index++) {
          const line: unknown = value[index];
          lines.push(line);
        }
        if (observe) contributions.push({ id, start, count: value.length, text: '' });
      } else if (typeof value === 'string') {
        strings.push(value);
        if (observe) contributions.push({ id, start, count: -1, text: value });
      } else throw new Error('Unexpected runtime serializer line contribution');
      current = Reflect.apply(current.get, current, ['after']);
    } while (current);
  }
  // Native coercion occurs only after every node has run. In particular, joining
  // each block eagerly would change observable object-toString side effects.
  const ending = lines.length && binding.useCRLF() ? '\r\n' : '\n';
  if (observe && precise) {
    for (let index = 0; index < lines.length; index++) {
      const value = lines[index];
      // Array.join uses ToString with a string hint, except for null/undefined.
      // Template conversion also throws for Symbol; String(value) would not.
      if (typeof value !== 'string') lines[index] = value == null ? '' : `${value}`;
    }
  }
  const joined = lines.length ? lines.join(ending) : '';
  const source = lines.length ? joined.replace(/\uE027/g, '') : strings.join('');
  if (observe && precise) {
    // One fact about this fresh join, never a cache across model reads. Most
    // documents contain no internal sentinel, so avoid a regex per source line.
    const sentinel = joined.includes('\uE027');
    let offset = 0;
    const blocks = contributions.map((entry) => {
      let length = lines.length ? 0 : entry.count < 0 ? entry.text.length : 0;
      if (lines.length && entry.count > 0) {
        for (let index = entry.start; index < entry.start + entry.count; index++)
          length += sentinel
            ? (lines[index] as string).replace(/\uE027/g, '').length
            : (lines[index] as string).length;
        length +=
          (entry.count - 1 + (entry.start + entry.count < lines.length ? 1 : 0)) * ending.length;
      }
      const from = offset;
      offset += length;
      return { id: entry.id as string, from, to: offset, text: source.slice(from, offset) };
    });
    observe({ source, blocks });
  }
  return source;
}

/**
 * undefined means the caller must use the nodeMap.toMark. Every such
 * return occurs before any node serialization, because the serializer
 * can normalize attributes and is not safely repeatable during one capture.
 */
export function trySerializeNativeBlocks(
  nodeMap: unknown,
  useCRLF: boolean,
  observe?: (result: NativeSerialization) => void,
  binding?: NativeLineBinding,
): string | undefined {
  const runtime = runtimeLines(nodeMap, binding, observe);
  if (runtime !== undefined) return runtime;
  if (!record(nodeMap) || !record(nodeMap.blocks)) return undefined;
  const blocks = nodeMap.blocks;
  if (typeof blocks.sortedFirst !== 'function') return undefined;
  const first: unknown = Reflect.apply(blocks.sortedFirst, blocks, []);
  if (!nativeNode(first)) return undefined;
  let current: unknown = first.getFirstBrother();
  const roots: NativeNode[] = [];
  const seen = new Set<NativeNode>();
  while (current !== undefined && current !== null) {
    if (!nativeNode(current)) return undefined;
    if (seen.has(current)) throw new Error('Invalid native serializer block chain');
    if (roots.length >= 200_000) return undefined;
    seen.add(current);
    roots.push(current);
    current = current.attributes.after;
  }
  if (!roots.length) return undefined;
  for (const node of roots) {
    if (typeof node.attributes.type !== 'string' || !topTypes.has(node.attributes.type))
      return undefined;
  }

  // Inspect every contribution before serialization. Empty array, one empty
  // line and string contributions cannot be distinguished after toMark joins.
  const pending: NativeNode[] = [...roots];
  const checked = new Set<NativeNode>();
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    if (checked.has(node)) throw new Error('Invalid native serializer node tree');
    if (checked.size >= 200_000) return undefined;
    checked.add(node);
    if (Object.hasOwn(node, 'toMark') || Object.hasOwn(node, 'get')) return undefined;
    const { type, children, text, pattern } = node.attributes;
    if (typeof type !== 'string' || (!topTypes.has(type) && !childTypes.has(type)))
      return undefined;
    if (!record(children) || typeof children.toArray !== 'function') return undefined;
    const descendants: unknown = Reflect.apply(children.toArray, children, []);
    if (!Array.isArray(descendants) || !descendants.every(nativeNode)) return undefined;
    if (containers.has(type) && !descendants.length) return undefined;
    if (textTypes.has(type) && (!withoutSentinel(text) || descendants.length)) return undefined;
    if (type === 'list_item' && !descendants.length && !withoutSentinel(text)) return undefined;
    if (
      typeof pattern === 'string' &&
      pattern &&
      !withoutSentinel(pattern.replace(/\{0\}/g, '')) &&
      !withoutSentinel(text)
    )
      return undefined;
    for (const descendant of descendants) pending.push(descendant);
  }

  const chunks: string[] = [];
  for (const node of roots) {
    const chunk = node.toMark();
    // Do not invoke the whole-document method after a partially
    // serialized model: that could normalize earlier blocks a second time.
    if (typeof chunk !== 'string' || !chunk)
      throw new Error('Unexpected native serializer contribution after preflight');
    chunks.push(chunk);
  }
  const ending = useCRLF ? '\r\n' : '\n';
  const source = chunks.join(ending);
  if (observe) {
    let offset = 0;
    const blocks = roots.map((node, index) => {
      const text = chunks[index] + (index + 1 < roots.length ? ending : '');
      const from = offset;
      offset += text.length;
      return { id: node.cid, from, to: offset, text };
    });
    observe({ source, blocks });
  }
  return source;
}
