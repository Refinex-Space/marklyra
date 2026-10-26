import type { MarkdownSerializationPolicy } from '../markdown-preferences.js';
import type { LegacyGlobals } from './legacy-types.js';
import { readMarkdownPolicy, writeMarkdownPolicy } from './policy-options.js';
import { type SerializedBlock, trySerializeNativeBlocks } from './serialization.js';

declare const snapshotBrand: unique symbol;
/** An opaque, short-lived model receipt. It cannot be constructed from renderer JSON. */
export interface PolicyModelSnapshot {
  readonly [snapshotBrand]: true;
}
interface Capability {
  version: number;
  moduleSha256: string;
  array: unknown;
  mapPrototype: object;
  nodePrototype: object;
  mapToMark: (...args: unknown[]) => unknown;
  nodeToMark: (...args: unknown[]) => unknown;
  lines: (...args: unknown[]) => unknown;
}
interface Shape {
  capability: Capability;
  collections: Set<object>;
  prototypes: Set<object | null>;
}
interface Observation {
  object: object;
  descriptors: PropertyDescriptorMap;
  entries?: [unknown, unknown][];
}
interface Captured {
  runtime: LegacyGlobals;
  editor: NonNullable<LegacyGlobals['editor']>;
  file: NonNullable<LegacyGlobals['File']>;
  map: object;
  model: object;
  shape: Shape;
  observations: Observation[];
  prototypes: Observation[];
  poolOwner: object;
  pool: Map<unknown, unknown>;
  poolEntries: [unknown, unknown][];
  useCRLF: unknown;
  finalNewline: unknown;
  environment: [string, unknown][];
}
const snapshots = new WeakMap<PolicyModelSnapshot, Captured>();
const serializing = new WeakSet<object>();
const MAX_OBJECTS = 200_000;
const MAX_TEXT = 32 * 1024 * 1024;
const environmentKeys = ['headingStyle', 'ulStyle', 'olStyle', 'enableInlineMath'] as const;
const nodeTypes = new Set([
  'paragraph',
  'heading',
  'list',
  'list_item',
  'blockquote',
  'table',
  'table_row',
  'table_cell',
  'fences',
  'math_block',
  'meta_block',
  'def_link',
  'def_footnote',
  'hr',
  'toc',
  'html_block',
]);
function fail(detail: string): never {
  throw new Error(`Unsupported runtime policy serialization: ${detail}`);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
/** Inspect data without invoking model getters or foreign accessors. */
function data(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor)) return fail(`missing data ${key}`);
  return descriptor.value;
}
function descriptors(value: object): PropertyDescriptorMap {
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) fail('symbol model field');
  return Object.getOwnPropertyDescriptors(value);
}
function shape(runtime: LegacyGlobals, map: object): Shape {
  const input: unknown = Reflect.get(runtime, '__MARKLYRA_NATIVE_SERIALIZATION__');
  if (
    !object(input) ||
    !Object.isFrozen(input) ||
    input.version !== 1 ||
    input.moduleSha256 !== 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb' ||
    input.array !== Array ||
    !object(input.mapPrototype) ||
    !object(input.nodePrototype) ||
    typeof input.mapToMark !== 'function' ||
    typeof input.nodeToMark !== 'function' ||
    typeof input.lines !== 'function' ||
    Object.getPrototypeOf(map) !== input.mapPrototype ||
    data(input.mapPrototype, 'toMark') !== input.mapToMark ||
    data(input.nodePrototype, 'toMark') !== input.nodeToMark
  )
    return fail('serializer ABI');
  const capability = input as unknown as Capability;
  const collections = new Set<object>();
  for (const key of ['blocks', 'allNodes', 'foot_list', 'link_list']) {
    const collection = data(map, key);
    if (!object(collection)) fail(`collection ${key}`);
    if (!Array.isArray(collection)) {
      const prototype: unknown = Object.getPrototypeOf(collection);
      if (
        !object(prototype) ||
        typeof data(prototype, 'get') !== 'function' ||
        typeof data(prototype, 'remove') !== 'function'
      )
        return fail(`collection prototype ${key}`);
      collections.add(prototype);
    }
  }
  return {
    capability,
    collections,
    prototypes: new Set([
      capability.mapPrototype,
      capability.nodePrototype,
      ...collections,
      Object.prototype,
      null,
    ]),
  };
}

/** Closed graph copy, never a native constructor, restore, set or remove call.
 * The collection's own length accessor is projected over the copied array.
 * The toc controller and the active map's tracking wrapper never enter the copy. */
function copyGraph(root: object, abi: Shape): { model: object; observations: Observation[] } {
  const copies = new Map<object, object>();
  const queue: { source: object; target: object; map: boolean }[] = [];
  const observations: Observation[] = [];
  let text = 0;
  const copy = (value: unknown): unknown => {
    if (typeof value === 'string') {
      text += value.length;
      if (text > MAX_TEXT) fail('text budget');
      return value;
    }
    if (value === null || value === undefined || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!object(value)) return fail('non-data model value');
    const previous = copies.get(value);
    if (previous) return previous;
    if (copies.size >= MAX_OBJECTS) fail('object budget');
    const prototype: unknown = Object.getPrototypeOf(value);
    const isMap = prototype === Map.prototype;
    if (
      !isMap &&
      !(Array.isArray(value) && prototype === Array.prototype) &&
      !abi.prototypes.has(prototype as object | null)
    )
      fail('foreign model prototype');
    const target: object = isMap
      ? new Map()
      : Array.isArray(value)
        ? []
        : Object.create(prototype as object | null);
    copies.set(value, target);
    queue.push({ source: value, target, map: isMap });
    return target;
  };
  const model = copy(root) as object;
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    if (!item) return fail('copy queue');
    const fields = descriptors(item.source);
    const observation: Observation = { object: item.source, descriptors: fields };
    observations.push(observation);
    if (item.map) {
      if (Reflect.ownKeys(item.source).length) fail('custom Map fields');
      const entries = [...Map.prototype.entries.call(item.source)] as [unknown, unknown][];
      observation.entries = entries;
      for (const [key, value] of entries)
        Map.prototype.set.call(item.target, copy(key), copy(value));
      continue;
    }
    for (const [key, descriptor] of Object.entries(fields)) {
      if (item.source === root && key === 'toc') {
        if (!('value' in descriptor)) fail('toc accessor');
        Object.defineProperty(item.target, key, { ...descriptor, value: undefined });
      } else if (item.source === root && key === 'toMark') {
        if (!('value' in descriptor) || typeof descriptor.value !== 'function')
          fail('map serializer override');
      } else if ('value' in descriptor) {
        Object.defineProperty(item.target, key, { ...descriptor, value: copy(descriptor.value) });
      } else if (
        key === 'length' &&
        abi.collections.has(Object.getPrototypeOf(item.source)) &&
        typeof descriptor.get === 'function' &&
        descriptor.set === undefined
      ) {
        Object.defineProperty(item.target, key, {
          configurable: Boolean(descriptor.configurable),
          enumerable: Boolean(descriptor.enumerable),
          get(this: Record<string, unknown>) {
            const values = data(this, '_set');
            if (!Array.isArray(values)) return fail('collection items');
            return values.length;
          },
        });
      } else fail(`model accessor ${key}`);
    }
  }
  return { model, observations };
}

function members(value: unknown, abi: Shape): unknown[] {
  if (Array.isArray(value)) return value;
  if (!object(value) || !abi.collections.has(Object.getPrototypeOf(value)))
    return fail('collection membership');
  const items = data(value, '_set'),
    index = data(value, '_map');
  if (!Array.isArray(items) || !(index instanceof Map) || index.size !== items.length)
    return fail('collection index');
  const seen = new Set<unknown>();
  for (const item of items) {
    if (!object(item) || seen.has(item) || index.get(data(item, 'cid')) !== item)
      fail('collection identity');
    seen.add(item);
  }
  return items;
}
function validateGraph(map: object, abi: Shape): void {
  if (Object.getPrototypeOf(map) !== abi.capability.mapPrototype) fail('map prototype');
  for (const key of Reflect.ownKeys(map))
    if (!['blocks', 'allNodes', 'foot_list', 'link_list', 'toc'].includes(String(key)))
      fail('map field');
  const nodes = members(data(map, 'allNodes'), abi),
    owned = new Set(nodes);
  const roots = members(data(map, 'blocks'), abi);
  const ids = new Set<string>();
  const attrs = (node: unknown): Record<string, unknown> => {
    if (!object(node) || Object.getPrototypeOf(node) !== abi.capability.nodePrototype)
      return fail('node prototype');
    const attributes = data(node, 'attributes');
    if (!object(attributes) || Object.getPrototypeOf(attributes) !== Object.prototype)
      return fail('node attributes');
    return attributes;
  };
  const group = (items: unknown[], parent: unknown) => {
    const set = new Set(items);
    if (set.size !== items.length) fail('duplicate child');
    let first: unknown;
    for (const node of items) {
      const a = attrs(node);
      if (!owned.has(node) || (a.parent ?? null) !== parent) fail('parent relation');
      if (a.before == null) {
        if (first) fail('multiple first siblings');
        first = node;
      } else if (!set.has(a.before) || attrs(a.before).after !== node) fail('before relation');
      if (a.after != null && (!set.has(a.after) || attrs(a.after).before !== node))
        fail('after relation');
    }
    const seen = new Set();
    for (let node = first; node != null; node = attrs(node).after) {
      if (seen.has(node)) fail('sibling cycle');
      seen.add(node);
    }
    if (seen.size !== items.length) fail('disconnected siblings');
  };
  group(roots, null);
  for (const node of nodes) {
    if (!object(node)) fail('node data');
    const a = attrs(node),
      cid = data(node, 'cid');
    if (
      typeof cid !== 'string' ||
      !cid ||
      data(node, 'id') !== cid ||
      ids.has(cid) ||
      typeof a.type !== 'string' ||
      !nodeTypes.has(a.type) ||
      a.in !== map
    )
      fail('node identity/type');
    ids.add(cid);
    if (a.parent == null ? a.attachTo !== map : a.attachTo != null) fail('root attachment');
    group(members(a.children, abi), node);
  }
  const reached = new Set(),
    pending = [...roots];
  for (let index = 0; index < pending.length; index++) {
    const node = pending[index];
    if (reached.has(node)) fail('tree cycle');
    reached.add(node);
    for (const child of members(attrs(node).children, abi)) pending.push(child);
  }
  if (reached.size !== nodes.length) fail('unreachable node');
  for (const key of ['foot_list', 'link_list'])
    for (const node of members(data(map, key), abi))
      if (!owned.has(node)) fail('foreign reference node');
}
function unchanged(observations: readonly Observation[]): void {
  for (const item of observations) {
    const current = descriptors(item.object);
    if (Reflect.ownKeys(current).length !== Reflect.ownKeys(item.descriptors).length)
      fail('stale model fields');
    for (const [key, before] of Object.entries(item.descriptors)) {
      const after = current[key];
      if (
        !after ||
        before.configurable !== after.configurable ||
        before.enumerable !== after.enumerable ||
        before.writable !== after.writable ||
        before.get !== after.get ||
        before.set !== after.set ||
        before.value !== after.value
      )
        fail('stale model data');
    }
    if (item.entries) {
      const entries = [...Map.prototype.entries.call(item.object)] as [unknown, unknown][];
      if (
        entries.length !== item.entries.length ||
        entries.some(
          ([key, value], index) =>
            key !== item.entries?.[index]?.[0] || value !== item.entries?.[index]?.[1],
        )
      )
        fail('stale model Map');
    }
  }
}

export function capturePolicyModel(runtime: LegacyGlobals): PolicyModelSnapshot {
  const editor = runtime.editor,
    file = runtime.File;
  if (
    !editor ||
    !file ||
    editor.sourceView.inSourceMode ||
    file._onInitParse ||
    editor.isIME ||
    serializing.has(file.option)
  )
    return fail('inactive live model');
  const map = editor.nodeMap,
    abi = shape(runtime, map);
  const copied = copyGraph(map, abi);
  validateGraph(copied.model, abi);
  const poolOwner: unknown = data(abi.capability.nodePrototype, 'constructor');
  if (typeof poolOwner !== 'function') return fail('node constructor identity');
  const pool: unknown = data(poolOwner, 'pool');
  if (!(pool instanceof Map) || pool.size > MAX_OBJECTS) return fail('node pool identity/budget');
  const token = Object.freeze({}) as PolicyModelSnapshot;
  snapshots.set(token, {
    runtime,
    editor,
    file,
    map,
    model: copied.model,
    shape: abi,
    observations: copied.observations,
    prototypes: [...abi.prototypes]
      .filter((p): p is object => p !== null && p !== Object.prototype)
      .map((p) => ({ object: p, descriptors: descriptors(p) })),
    poolOwner,
    pool,
    poolEntries: [...pool],
    useCRLF: file.useCRLF,
    finalNewline: Reflect.get(file, 'finalNewline'),
    environment: environmentKeys.map((key) => [key, Reflect.get(file.option, key)]),
  });
  return token;
}

/** Synchronous oracle only. No constructors, model restore, Undo, DOM writes or async work. */
function withPolicyModel<T>(
  runtime: LegacyGlobals,
  snapshot: PolicyModelSnapshot,
  policy: MarkdownSerializationPolicy,
  read: (model: object, capability: Capability) => T,
): T {
  const captured = snapshots.get(snapshot);
  if (
    !captured ||
    captured.runtime !== runtime ||
    runtime.editor !== captured.editor ||
    runtime.File !== captured.file ||
    runtime.editor.nodeMap !== captured.map ||
    runtime.editor.sourceView.inSourceMode ||
    runtime.editor.isIME ||
    runtime.File.useCRLF !== captured.useCRLF ||
    Reflect.get(runtime.File, 'finalNewline') !== captured.finalNewline ||
    captured.environment.some(
      ([key, value]) => Reflect.get(runtime.File?.option ?? {}, key) !== value,
    )
  )
    return fail('stale snapshot environment');
  if (
    (policy.indentSize !== 2 &&
      policy.indentSize !== 3 &&
      policy.indentSize !== 4 &&
      policy.indentSize !== 5) ||
    typeof policy.indentByTab !== 'boolean' ||
    typeof policy.prettyIndent !== 'boolean' ||
    ![0, 1, 2, 3].includes(policy.headingStyle ?? 0) ||
    ![0, 1, 2].includes(policy.ulStyle ?? 0) ||
    ![0, 1].includes(policy.olStyle ?? 0)
  )
    return fail('invalid policy');
  unchanged(captured.observations);
  unchanged(captured.prototypes);
  if (
    data(captured.poolOwner, 'pool') !== captured.pool ||
    captured.pool.size !== captured.poolEntries.length ||
    captured.poolEntries.some(([key, value]) => captured.pool.get(key) !== value)
  )
    return fail('stale node pool');
  const abi = shape(runtime, captured.map);
  if (abi.capability !== captured.shape.capability) return fail('changed serializer capability');
  if (serializing.has(runtime.File.option)) return fail('reentrant serialization');
  const { model } = copyGraph(captured.model, captured.shape);
  serializing.add(runtime.File.option);
  let restore: (() => void) | undefined;
  try {
    restore = writeMarkdownPolicy(runtime, policy);
    const result = read(model, abi.capability);
    unchanged(captured.observations);
    unchanged(captured.prototypes);
    if (
      data(captured.poolOwner, 'pool') !== captured.pool ||
      captured.pool.size !== captured.poolEntries.length ||
      captured.poolEntries.some(([key, value]) => captured.pool.get(key) !== value)
    )
      return fail('serializer touched active node pool');
    return result;
  } finally {
    try {
      restore?.();
    } finally {
      serializing.delete(runtime.File.option);
    }
  }
}

/** Serialize the complete cloned model under one explicit policy. */
export function serializePolicyModel(
  runtime: LegacyGlobals,
  snapshot: PolicyModelSnapshot,
  policy: MarkdownSerializationPolicy,
): { canonical: string; blocks: SerializedBlock[] } {
  return withPolicyModel(runtime, snapshot, policy, (model, capability) => {
    let blocks: SerializedBlock[] | undefined;
    const source = trySerializeNativeBlocks(
      model,
      Boolean(runtime.File?.useCRLF),
      (receipt) => {
        blocks = receipt.blocks;
      },
      {
        capability,
        original: capability.mapToMark,
        useCRLF: () => Boolean(runtime.File?.useCRLF),
      },
    );
    if (source === undefined || !blocks) return fail('missing native serialization receipt');
    const canonical = runtime.editor?.warpContentWithOption(source);
    if (typeof canonical !== 'string' || !canonical.startsWith(source))
      return fail('canonical wrapper');
    const last = blocks.at(-1);
    if (last) {
      last.text += canonical.slice(source.length);
      last.to = canonical.length;
    } else if (canonical) return fail('wrapper without a block');
    return { canonical, blocks };
  });
}

/** Read native per-node source on one fresh closed clone under the current
 * policy. Only strings leave the clone; no cloned or active node is exposed. */
export function serializePolicyNodes(
  runtime: LegacyGlobals,
  snapshot: PolicyModelSnapshot,
  ids: readonly string[],
): ReadonlyMap<string, string> {
  if (
    !Array.isArray(ids) ||
    ids.length > MAX_OBJECTS ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== 'string' || !id || id.length > 256)
  )
    return fail('invalid node ids');
  return withPolicyModel(runtime, snapshot, readMarkdownPolicy(runtime), (model, capability) => {
    const all = data(model, 'allNodes');
    if (!object(all)) return fail('node collection');
    const index = data(all, '_map');
    if (!(index instanceof Map)) return fail('node index');
    const output = new Map<string, string>();
    let length = 0;
    for (const id of ids) {
      const node: unknown = index.get(id);
      if (
        !object(node) ||
        Object.getPrototypeOf(node) !== capability.nodePrototype ||
        data(node, 'cid') !== id
      )
        return fail('unknown node id');
      const mark: unknown = Reflect.apply(capability.nodeToMark, node, []);
      if (typeof mark !== 'string') return fail('non-string node serialization');
      length += mark.length;
      if (length > MAX_TEXT) return fail('node serialization budget');
      output.set(id, mark);
    }
    return output;
  });
}
