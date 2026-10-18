import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import {
  type NativeLineBinding,
  type NativeSerialization,
  trySerializeNativeBlocks,
} from '../src/runtime/serialization.js';
import { RuntimeSerializationRead } from '../src/runtime/serialization-read.js';

class NativeNode {
  calls = 0;
  attributes: Record<string, unknown> = {
    type: 'paragraph',
    text: 'fallback',
    children: { toArray: () => [] },
  };
  constructor(
    readonly cid: string,
    readonly lines: unknown,
  ) {}
  getFirstBrother() {
    return this;
  }
  get(key: string): unknown {
    return this.attributes[key];
  }
  toMark() {
    return 'fallback';
  }
}
class NativeMap {
  blocks: { length: number; sortedFirst(): NativeNode | undefined };
  constructor(nodes: NativeNode[]) {
    this.blocks = { length: nodes.length, sortedFirst: () => nodes[0] };
  }
  toMark() {
    return 'original fallback';
  }
}
function fixture(values: unknown[]) {
  const nodes = values.map((value, index) => new NativeNode(String(index), value));
  nodes.forEach((node, index) => {
    node.attributes.after = nodes[index + 1];
  });
  const map = new NativeMap(nodes),
    effects: string[] = [];
  const capability = Object.freeze({
    version: 1,
    moduleSha256: 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb',
    array: Array,
    nodePrototype: NativeNode.prototype,
    mapPrototype: NativeMap.prototype,
    nodeToMark: NativeNode.prototype.toMark,
    mapToMark: NativeMap.prototype.toMark,
    lines(this: NativeNode): unknown {
      this.calls++;
      effects.push(this.cid);
      return typeof this.lines === 'function' ? this.lines() : this.lines;
    },
  });
  const binding: NativeLineBinding = {
    capability,
    original: NativeMap.prototype.toMark,
    useCRLF: () => false,
  };
  const serialize = () => {
    let receipt: NativeSerialization | undefined;
    const source = trySerializeNativeBlocks(map, false, (value) => (receipt = value), binding);
    return { source, receipt };
  };
  return { map, nodes, effects, capability, binding, serialize };
}

describe('verified native line-array aggregation', () => {
  it('does not inspect cid metadata for an unobserved native string read', () => {
    const f = fixture([['Alpha'], ['尾😀']]);
    const first = f.nodes[0];
    if (!first) throw Error('Missing fixture');
    const wrapped = new Proxy(first, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'cid') throw Error('cid metadata was not requested');
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    f.map.blocks.sortedFirst = () => wrapped;
    expect(trySerializeNativeBlocks(f.map, false, undefined, f.binding)).toBe('Alpha\n尾😀');
    expect(f.effects).toEqual(['0', '1']);
    expect(f.nodes.map((node) => node.calls)).toEqual([1, 1]);
  });

  it('preserves observed and unobserved output and UTF-16 block ranges across native contributions', () => {
    const line = fc.oneof(
      fc.constantFrom('', 'Alpha', '中文😀', '\uE027', 'A\uE027B', 'line\ninside'),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
    );
    const value = fc.oneof(fc.array(line, { maxLength: 8 }), fc.string({ maxLength: 16 }));
    fc.assert(
      fc.property(fc.array(value, { maxLength: 40 }), fc.boolean(), (values, crlf) => {
        const eol = crlf ? '\r\n' : '\n',
          lines = values.flatMap((v) => (Array.isArray(v) ? v : []));
        const expected = lines.length
          ? lines.join(eol).replace(/\uE027/g, '')
          : values.filter((v) => typeof v === 'string').join('');
        const observed = fixture(values);
        observed.binding.useCRLF = () => crlf;
        const actual = observed.serialize();
        expect(actual.source).toBe(expected);
        expect(actual.receipt?.blocks.map((b) => b.text).join('')).toBe(expected);
        expect(actual.receipt?.blocks.at(-1)?.to ?? 0).toBe(expected.length);
        expect(observed.nodes.every((node) => node.calls === 1)).toBe(true);
        const plain = fixture(values);
        plain.binding.useCRLF = () => crlf;
        expect(trySerializeNativeBlocks(plain.map, false, undefined, plain.binding)).toBe(expected);
        expect(plain.nodes.every((node) => node.calls === 1)).toBe(true);
      }),
      { seed: 20261017, numRuns: 1000 },
    );
  });
  it.each([
    { input: [['A'], [], ['B'], 'discarded'], source: 'A\nB', chunks: ['A\n', '', 'B', ''] },
    { input: [['\uE027'], 'discarded'], source: '', chunks: ['', ''] },
    {
      input: [[], 'string\uE027', [], '尾'],
      source: 'string\uE027尾',
      chunks: ['', 'string\uE027', '', '尾'],
    },
    { input: [['', ''], []], source: '\n', chunks: ['\n', ''] },
    { input: [], source: '', chunks: [] },
  ])(
    'preserves empty arrays, empty lines and string branch: $source',
    ({ input, source, chunks }) => {
      const f = fixture(input);
      const actual = f.serialize();
      expect(actual.source).toBe(source);
      expect(actual.receipt?.blocks.map((block) => block.text)).toEqual(chunks);
      expect(actual.receipt?.blocks.map((block) => block.text).join('')).toBe(source);
      expect(actual.receipt?.blocks.at(-1)?.to ?? 0).toBe(source.length);
      expect(f.nodes.map((node) => node.calls)).toEqual(input.map(() => 1));
      f.serialize();
      expect(f.nodes.map((node) => node.calls)).toEqual(input.map(() => 2));
    },
  );

  it('converts once with string hint only after every original node and the ending read', () => {
    const log: string[] = [];
    const value = {
      get [Symbol.toPrimitive]() {
        log.push('get primitive');
        return (hint: string) => {
          log.push(`convert ${hint}`);
          return '😀\uE027';
        };
      },
    };
    const f = fixture([
      () => {
        log.push('first node');
        return [value, null];
      },
      () => {
        log.push('second node');
        return ['中文'];
      },
    ]);
    f.binding.useCRLF = () => {
      log.push('ending');
      return true;
    };
    const actual = f.serialize();
    expect(log).toEqual(['first node', 'second node', 'ending', 'get primitive', 'convert string']);
    expect(actual.source).toBe('😀\r\n\r\n中文');
    expect(actual.receipt?.blocks.map((block) => block.text)).toEqual(['😀\r\n\r\n', '中文']);
    expect(actual.receipt?.blocks[1]?.from).toBe(6);
  });

  const coercions: { name: string; make(log: string[]): unknown[] }[] = [
    {
      name: 'holes and primitives',
      make: () => {
        const values = new Array<unknown>(3);
        values.push(null, undefined, 0, false, 12n, '尾');
        return values;
      },
    },
    {
      name: 'toPrimitive string hint',
      make: (log) => [
        {
          get [Symbol.toPrimitive]() {
            log.push('get primitive');
            return (hint: string) => {
              log.push(hint);
              return 7;
            };
          },
        },
      ],
    },
    {
      name: 'toString then valueOf',
      make: (log) => [
        {
          get toString() {
            log.push('get toString');
            return () => {
              log.push('toString');
              return {};
            };
          },
          get valueOf() {
            log.push('get valueOf');
            return () => {
              log.push('valueOf');
              return 9;
            };
          },
        },
      ],
    },
    {
      name: 'symbol primitive',
      make: (log) => [
        'before',
        Symbol('no string conversion'),
        {
          toString: () => {
            log.push('must not reach');
            return 'after';
          },
        },
      ],
    },
    {
      name: 'toPrimitive yields symbol',
      make: (log) => [
        {
          [Symbol.toPrimitive](hint: string) {
            log.push(hint);
            return Symbol('symbol');
          },
        },
        {
          toString: () => {
            log.push('must not reach');
            return 'after';
          },
        },
      ],
    },
    {
      name: 'toPrimitive getter throws',
      make: (log) => [
        {
          get [Symbol.toPrimitive]() {
            log.push('getter');
            throw new RangeError('conversion failed');
          },
        },
        {
          toString: () => {
            log.push('must not reach');
            return 'after';
          },
        },
      ],
    },
    {
      name: 'toString throws',
      make: (log) => [
        {
          toString() {
            log.push('toString');
            throw new SyntaxError('conversion failed');
          },
        },
        {
          toString: () => {
            log.push('must not reach');
            return 'after';
          },
        },
      ],
    },
  ];
  it.each(coercions)(
    'matches native Array.join output, errors and call order: $name',
    ({ make }) => {
      const expectedLog: string[] = [],
        actualLog: string[] = [];
      const read = (operation: () => unknown) => {
        try {
          return { value: operation() };
        } catch (error) {
          return { error: error instanceof Error ? error.name : String(error) };
        }
      };
      const expected = read(() =>
        make(expectedLog)
          .join('\r\n')
          .replace(/\uE027/g, ''),
      );
      const f = fixture([make(actualLog)]);
      f.binding.useCRLF = () => true;
      let receipt: NativeSerialization | undefined;
      const actual = read(() => {
        const value = f.serialize();
        receipt = value.receipt;
        return value.source;
      });
      expect(actual).toEqual(expected);
      expect(actualLog).toEqual(expectedLog);
      expect(f.nodes[0]?.calls).toBe(1);
      if ('value' in actual)
        expect(receipt?.blocks.map((block) => block.text).join('')).toBe(actual.value);
      else expect(receipt).toBeUndefined();
    },
  );

  it.each([
    'absent',
    'mutable',
    'version',
    'hash',
    'original',
    'map identity',
    'node method',
  ] as const)('does not grant a native capability for %s', (kind) => {
    const f = fixture([['A']]);
    const first = f.nodes[0];
    if (!first) throw Error('Missing fixture');
    first.attributes.type = 'unsupported_fallback';
    if (kind === 'absent') f.binding.capability = undefined;
    if (kind === 'mutable') f.binding.capability = { ...f.capability };
    if (kind === 'version') f.binding.capability = Object.freeze({ ...f.capability, version: 2 });
    if (kind === 'hash')
      f.binding.capability = Object.freeze({ ...f.capability, moduleSha256: 'different' });
    if (kind === 'original') f.binding.original = () => 'different';
    if (kind === 'map identity')
      f.binding.capability = Object.freeze({ ...f.capability, mapPrototype: {} });
    if (kind === 'node method')
      f.binding.capability = Object.freeze({ ...f.capability, nodeToMark: () => 'different' });
    expect(f.serialize().source).toBeUndefined();
    expect(f.effects).toEqual([]);
  });

  it('never retries the original after native effects followed by a failure', () => {
    const f = fixture([
      ['first'],
      () => {
        throw Error('native failure');
      },
    ]);
    expect(() => f.serialize()).toThrow('native failure');
    expect(f.nodes.map((node) => node.calls)).toEqual([1, 1]);
    expect(f.effects).toEqual(['0', '1']);
  });
  it('hands a single coercion result to tracking and clears a throwing read', () => {
    const log: string[] = [];
    const values: unknown[] = [
      {
        [Symbol.toPrimitive](hint: string) {
          log.push(hint);
          return 'text';
        },
      },
    ];
    const f = fixture([values]);
    const editor = {
      nodeMap: f.map,
      sourceView: { inSourceMode: false },
      warpContentWithOption: (source: string) => source,
    };
    const runtime = {
      editor,
      File: { useCRLF: false },
      __MARKLYRA_NATIVE_SERIALIZATION__: f.capability,
    } as unknown as LegacyGlobals;
    const reader = new RuntimeSerializationRead(runtime);
    const first = reader.read(() => f.map.toMark());
    expect(first.canonical).toBe('text');
    expect(first.blocks?.map((block) => block.text)).toEqual(['text']);
    expect(log).toEqual(['string']);
    expect(f.nodes[0]?.calls).toBe(1);
    values[0] = Symbol('cannot join');
    expect(() => reader.read(() => f.map.toMark())).toThrow(TypeError);
    values[0] = 'runtime';
    const next = reader.read(() => f.map.toMark());
    expect(next.canonical).toBe('runtime');
    expect(next.blocks?.map((block) => block.text)).toEqual(['runtime']);
    expect(f.nodes[0]?.calls).toBe(3);
  });
});
