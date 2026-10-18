import { afterEach, describe, expect, test } from 'vitest';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';
import { installLiteralPrefix, literalRulePattern } from '../src/runtime/literal-prefix.js';

describe('proven native HR line identity', () => {
  test.each(['\uFEFF---', '  \uFEFF* * *  ', '\uFEFF\uFEFF___', '---\uFEFF'])(
    'preserves the exact native line %j only with its exact trimmed pattern',
    (line) => {
      expect(literalRulePattern(line, line.trim())).toBe(line);
      expect(literalRulePattern(line, `${line.trim()}!`)).toBe(`${line.trim()}!`);
    },
  );
  test('does not invent a source line from an ordinary pattern or malformed ABI arguments', () => {
    expect(literalRulePattern('  ---  ', '---')).toBe('---');
    expect(literalRulePattern('\uFEFF---', undefined)).toBeUndefined();
    expect(literalRulePattern(null, '---')).toBe('---');
    expect(literalRulePattern({ text: '\uFEFF---' }, '---')).toBe('---');
  });
  test('a literal inside a rule is retained only when the native parser actually supplied it', () => {
    expect(literalRulePattern('Before\uFEFF---', '---')).toBe('---');
    expect(literalRulePattern('Before\n\uFEFF---', '---')).toBe('---');
  });
});

// Install behavior is tested independently from native parsing: the capability
// is an identity contract, not evidence that an arbitrary caller parsed a rule.
const moduleSha256 = '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623';

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__MARKLYRA_NATIVE_LITERAL__');
  Reflect.deleteProperty(globalThis, '__MARKLYRA_LITERAL_RULE__');
});

test('verified parser capability installs the exact pure callback without reading a document node', () => {
  Reflect.set(globalThis, '__MARKLYRA_NATIVE_LITERAL__', { version: 1, sites: 2, moduleSha256 });
  installLiteralPrefix({} as LegacyEditor);
  expect(Reflect.get(globalThis, '__MARKLYRA_LITERAL_RULE__')).toBe(literalRulePattern);
  installLiteralPrefix({} as LegacyEditor);
});

test('unknown native identities and a hook already owned by someone else fail closed', () => {
  for (const capability of [
    null,
    { version: 2, sites: 2, moduleSha256 },
    { version: 1, sites: 1, moduleSha256 },
    { version: 1, sites: 2, moduleSha256: 'other' },
  ]) {
    Reflect.set(globalThis, '__MARKLYRA_NATIVE_LITERAL__', capability);
    expect(() => installLiteralPrefix({} as LegacyEditor)).toThrow('parser ABI unavailable');
  }
  Reflect.set(globalThis, '__MARKLYRA_NATIVE_LITERAL__', { version: 1, sites: 2, moduleSha256 });
  Reflect.set(globalThis, '__MARKLYRA_LITERAL_RULE__', () => 'foreign');
  expect(() => installLiteralPrefix({} as LegacyEditor)).toThrow('already owned');
});

test('an older runtime retains only the first-line fallback and returns its native result', () => {
  class NativeNode {
    attributes: Record<string, unknown>;
    constructor(attributes: Record<string, unknown>) {
      this.attributes = attributes;
    }
    get(name: string) {
      return this.attributes[name];
    }
    set(name: string, value: unknown) {
      this.attributes[name] = value;
    }
    parseFrom(_options?: unknown, _input?: string) {
      return this.result;
    }
    result: unknown = null;
  }
  const first = new NativeNode({ type: 'paragraph' });
  const editor = { nodeMap: { blocks: { sortedFirst: () => first } } } as unknown as LegacyEditor;
  installLiteralPrefix(editor);
  const node = new NativeNode({ type: 'hr', pattern: '---' });
  first.result = ['same HTML', [node]];
  const result = first.parseFrom({}, '\uFEFF---\n\nEnd');
  expect(result).toBe(first.result);
  expect(node.get('pattern')).toBe('\uFEFF---');
  node.set('pattern', '---');
  first.parseFrom({}, 'Before\n\n\uFEFF---');
  expect(node.get('pattern')).toBe('---');
  expect(Reflect.get(globalThis, '__MARKLYRA_LITERAL_RULE__')).toBeUndefined();
});
