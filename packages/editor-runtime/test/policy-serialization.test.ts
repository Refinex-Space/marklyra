import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import {
  capturePolicyModel,
  serializePolicyModel,
  serializePolicyNodes,
} from '../src/runtime/policy-serialization.js';

const policy = { indentSize: 4, indentByTab: false, prettyIndent: true } as const;
function fixture() {
  let constructions = 0;
  const options = {
    indentSize: 2,
    indentByTab: false,
    prettyIndent: false,
    headingStyle: 0,
    ulStyle: 0,
    olStyle: 0,
    enableInlineMath: false,
  };
  let fault = false;
  let during: (() => void) | undefined;
  class Collection {
    _set: ModelNode[] = [];
    _map = new Map<string, ModelNode>();
    constructor() {
      constructions++;
      Object.defineProperty(this, 'length', { get: () => this._set.length });
    }
    get(id: string) {
      return this._map.get(id);
    }
    remove() {
      throw new Error('native remove must not run');
    }
    sortedFirst() {
      return this._set[0];
    }
    add(node: ModelNode) {
      this._set.push(node);
      this._map.set(node.cid, node);
    }
  }
  class ModelNode {
    static pool = new Map<string, ModelNode>();
    id = 'n0';
    cid = 'n0';
    attributes: Record<string, unknown>;
    constructor(map: ModelMap) {
      constructions++;
      this.attributes = {
        type: 'paragraph',
        text: 'Alpha',
        children: new Collection(),
        in: map,
        attachTo: map,
        parent: null,
        before: null,
        after: null,
        userIndent: ['loaded'],
      };
      ModelNode.pool.set(this.cid, this);
    }
    get(key: string) {
      return this.attributes[key];
    }
    getFirstBrother() {
      return this;
    }
    toMark() {
      return lines.call(this).join('\n');
    }
  }
  class ModelMap {
    blocks = new Collection();
    allNodes = new Collection();
    foot_list = new Collection();
    link_list = new Collection();
    toc = {
      refresh() {
        throw new Error('activity toc callback');
      },
    };
    toMark() {
      return this.blocks._set.map((node) => node.toMark()).join('\n');
    }
  }
  function lines(this: ModelNode) {
    const attrs = this.attributes;
    const map = attrs.in as ModelMap;
    expect(map.toc).toBeUndefined();
    attrs.tight = true;
    (attrs.userIndent as string[]).push('clone-only');
    during?.();
    if (fault) throw new Error('controlled native serializer failure');
    return [`${' '.repeat(options.indentSize)}${String(attrs.text)}`];
  }
  const map = new ModelMap(),
    node = new ModelNode(map);
  map.blocks.add(node);
  map.allNodes.add(node);
  const capability = Object.freeze({
    version: 1,
    moduleSha256: 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb',
    array: Array,
    mapPrototype: ModelMap.prototype,
    nodePrototype: ModelNode.prototype,
    mapToMark: ModelMap.prototype.toMark,
    nodeToMark: ModelNode.prototype.toMark,
    lines,
  });
  const editor = {
    nodeMap: map,
    isIME: false,
    sourceView: { inSourceMode: false },
    warpContentWithOption: (source: string) => `${source}\n`,
  };
  const file = { option: options, useCRLF: false, finalNewline: true, _onInitParse: false };
  const runtime = {
    File: file,
    editor,
    __MARKLYRA_NATIVE_SERIALIZATION__: capability,
  } as unknown as LegacyGlobals;
  return {
    runtime,
    map,
    node,
    options,
    capability,
    editor,
    file,
    ModelNode,
    constructions: () => constructions,
    fault: () => {
      fault = true;
    },
    during: (callback: () => void) => {
      during = callback;
    },
  };
}
describe('closed runtime policy model oracle', () => {
  it('clones cyclic relationships and collections without constructors or activity writes', () => {
    const f = fixture(),
      count = f.constructions();
    const before = Object.getOwnPropertyDescriptors(f.options);
    const snapshot = capturePolicyModel(f.runtime);
    const first = serializePolicyModel(f.runtime, snapshot, policy);
    const second = serializePolicyModel(f.runtime, snapshot, policy);
    expect(first).toEqual({
      canonical: '    Alpha\n',
      blocks: [{ id: 'n0', from: 0, to: 10, text: '    Alpha\n' }],
    });
    expect(second).toEqual(first);
    expect(f.constructions()).toBe(count);
    expect(f.node.attributes.tight).toBeUndefined();
    expect(f.node.attributes.userIndent).toEqual(['loaded']);
    expect(f.node.attributes.in).toBe(f.map);
    expect(f.ModelNode.pool.get('n0')).toBe(f.node);
    expect(Object.getOwnPropertyDescriptors(f.options)).toEqual(before);
  });
  it('restores every exact option descriptor after native serialization throws', () => {
    const f = fixture(),
      before = Object.getOwnPropertyDescriptors(f.options);
    const snapshot = capturePolicyModel(f.runtime);
    f.fault();
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('controlled native');
    expect(Object.getOwnPropertyDescriptors(f.options)).toEqual(before);
    expect(f.node.attributes.userIndent).toEqual(['loaded']);
  });
  it('rejects a stale or forged snapshot before changing options', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    f.node.attributes.text = 'New activity';
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('stale model');
    expect(() => serializePolicyModel(f.runtime, {} as typeof snapshot, policy)).toThrow(
      'stale snapshot',
    );
    expect(f.options.indentSize).toBe(2);
  });
  it('binds snapshots to their runtime and catches changed helper prototypes', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    expect(() => serializePolicyModel(fixture().runtime, snapshot, policy)).toThrow(
      'stale snapshot',
    );
    Object.defineProperty(f.ModelNode.prototype, 'extra', {
      value: () => null,
      configurable: true,
    });
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('stale model fields');
  });
  it('prevents reentrant counterfactual policies and restores the outer policy', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    f.during(() => serializePolicyModel(f.runtime, snapshot, policy));
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('reentrant');
    expect(f.options.indentSize).toBe(2);
  });
  it('rejects readonly options before a partial policy write', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    Object.defineProperty(f.options, 'prettyIndent', { writable: false });
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('writable data');
    expect(f.options.indentSize).toBe(2);
  });
  it('requires the pinned immutable serializer capability', () => {
    const f = fixture();
    Reflect.set(f.runtime, '__MARKLYRA_NATIVE_SERIALIZATION__', { ...f.capability });
    expect(() => capturePolicyModel(f.runtime)).toThrow('serializer ABI');
  });
  for (const [name, value] of [
    ['callback', () => null],
    ['Date', new Date()],
    ['symbol', Symbol()],
  ] as const)
    it(`rejects an unknown ${name} in model data`, () => {
      const f = fixture();
      f.node.attributes.custom = value;
      expect(() => capturePolicyModel(f.runtime)).toThrow('Unsupported runtime');
    });
  it('never invokes accessors from model data', () => {
    const f = fixture();
    let reads = 0;
    Object.defineProperty(f.node.attributes, 'custom', {
      enumerable: true,
      get() {
        reads++;
        return 1;
      },
    });
    expect(() => capturePolicyModel(f.runtime)).toThrow('model accessor');
    expect(reads).toBe(0);
  });
  it('rejects disconnected nodes and foreign owner references', () => {
    const f = fixture();
    f.node.attributes.in = {};
    expect(() => capturePolicyModel(f.runtime)).toThrow('node identity/type');
    f.node.attributes.in = f.map;
    f.node.attributes.after = f.node;
    expect(() => capturePolicyModel(f.runtime)).toThrow('after relation');
  });
  it('rejects invalid policies and stale non-policy serializer environments', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    expect(() =>
      serializePolicyModel(f.runtime, snapshot, {
        ...policy,
        indentSize: 0,
      } as unknown as typeof policy),
    ).toThrow('invalid policy');
    f.options.ulStyle = 1;
    expect(() => serializePolicyModel(f.runtime, snapshot, policy)).toThrow('stale snapshot');
  });
  it('rejects source/composition capture without serializing or changing activity', () => {
    const f = fixture();
    f.editor.sourceView.inSourceMode = true;
    expect(() => capturePolicyModel(f.runtime)).toThrow('inactive live');
    f.editor.sourceView.inSourceMode = false;
    f.editor.isIME = true;
    expect(() => capturePolicyModel(f.runtime)).toThrow('inactive live');
  });
  it('bounds captured text independently of native parser behavior', () => {
    const f = fixture();
    f.node.attributes.text = 'x'.repeat(32 * 1024 * 1024 + 1);
    expect(() => capturePolicyModel(f.runtime)).toThrow('text budget');
  });
});

describe('isolated per-node source reads', () => {
  it('uses fresh clones at current policy and returns only id/string pairs', () => {
    const f = fixture(),
      count = f.constructions(),
      options = Object.getOwnPropertyDescriptors(f.options);
    const snapshot = capturePolicyModel(f.runtime);
    expect([...serializePolicyNodes(f.runtime, snapshot, ['n0'])]).toEqual([['n0', '  Alpha']]);
    expect([...serializePolicyNodes(f.runtime, snapshot, ['n0'])]).toEqual([['n0', '  Alpha']]);
    expect(f.node.attributes.userIndent).toEqual(['loaded']);
    expect(f.node.attributes.tight).toBeUndefined();
    expect(f.ModelNode.pool.get('n0')).toBe(f.node);
    expect(f.constructions()).toBe(count);
    expect(Object.getOwnPropertyDescriptors(f.options)).toEqual(options);
  });
  it('restores exact descriptors when node serialization throws', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime),
      options = Object.getOwnPropertyDescriptors(f.options);
    f.fault();
    expect(() => serializePolicyNodes(f.runtime, snapshot, ['n0'])).toThrow('controlled native');
    expect(Object.getOwnPropertyDescriptors(f.options)).toEqual(options);
    expect(f.node.attributes.userIndent).toEqual(['loaded']);
  });
  it.each([['missing'], ['n0', 'n0'], [''], ['x'.repeat(257)]])(
    'rejects unknown or malformed id batch %j',
    (...ids) => {
      const f = fixture(),
        snapshot = capturePolicyModel(f.runtime);
      expect(() => serializePolicyNodes(f.runtime, snapshot, ids)).toThrow('node id');
      expect(f.node.attributes.userIndent).toEqual(['loaded']);
      expect(f.options.indentSize).toBe(2);
    },
  );
  it('binds node reads to the captured graph and runtime', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    expect(() => serializePolicyNodes(fixture().runtime, snapshot, ['n0'])).toThrow(
      'stale snapshot',
    );
    f.node.attributes.text = 'changed';
    expect(() => serializePolicyNodes(f.runtime, snapshot, ['n0'])).toThrow('stale model');
  });
  it('rejects reentry without writing activity attributes', () => {
    const f = fixture(),
      snapshot = capturePolicyModel(f.runtime);
    f.during(() => serializePolicyNodes(f.runtime, snapshot, ['n0']));
    expect(() => serializePolicyNodes(f.runtime, snapshot, ['n0'])).toThrow('reentrant');
    expect(f.node.attributes.userIndent).toEqual(['loaded']);
    expect(f.options.indentSize).toBe(2);
  });
});
