import type { LegacyEditor } from './legacy-types.js';

interface ParserNode {
  get(name: string): unknown;
  set(name: string, value: unknown): unknown;
}
type NativeParse = (this: ParserNode, ...args: unknown[]) => unknown;
const installed = new WeakSet<object>();
const literalModule = '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623';

/** Only the proven native HR assignment calls this hook. The line is supplied
 * before the trim, including the parser's own container stripping. */
export function literalRulePattern(line: unknown, pattern: unknown): unknown {
  return typeof line === 'string' &&
    typeof pattern === 'string' &&
    line.includes('\uFEFF') &&
    line.trim() === pattern
    ? line
    : pattern;
}

function installNativeLiteral(): boolean {
  const capability: unknown = Reflect.get(globalThis, '__MARKLYRA_NATIVE_LITERAL__');
  if (capability === undefined) return false;
  if (
    !capability ||
    typeof capability !== 'object' ||
    Reflect.get(capability, 'version') !== 1 ||
    Reflect.get(capability, 'moduleSha256') !== literalModule ||
    Reflect.get(capability, 'sites') !== 2
  )
    throw new Error('Original literal rule parser ABI unavailable');
  const previous: unknown = Reflect.get(globalThis, '__MARKLYRA_LITERAL_RULE__');
  if (previous !== undefined && previous !== literalRulePattern)
    throw new Error('Original literal rule parser hook is already owned');
  if (!Reflect.set(globalThis, '__MARKLYRA_LITERAL_RULE__', literalRulePattern))
    throw new Error('Original literal rule parser hook cannot be installed');
  return true;
}

/** The shipped parser trims a thematic rule's pattern, including literal FEFF.
 * Preserve that exact attribute before the caller records native history. The
 * parser still decides the node type; its HTML, selection and history
 * algorithms remain in charge. See BOM-SOURCE-HISTORY.md for the observed ABI. */
export function installLiteralPrefix(editor: LegacyEditor): void {
  if (installNativeLiteral()) return;
  // Older untransformed runtimes retain only the previously proven first-line
  // fallback. Missing native identity never enables a later/nested-line guess.
  const first = editor.nodeMap.blocks.sortedFirst();
  let prototype: object | null = first ? Object.getPrototypeOf(first) : null;
  while (prototype && !Object.hasOwn(prototype, 'parseFrom'))
    prototype = Object.getPrototypeOf(prototype);
  if (!prototype || typeof Reflect.get(prototype, 'parseFrom') !== 'function')
    throw new Error('Original Markdown parser ABI unavailable');
  if (installed.has(prototype)) return;
  const original = Reflect.get(prototype, 'parseFrom') as NativeParse;
  Reflect.set(prototype, 'parseFrom', function (this: ParserNode, ...args: unknown[]) {
    const input = args[1] || this.get('text');
    const line =
      typeof input === 'string' && input.startsWith('\uFEFF')
        ? input.split(/\r\n|\r|\n/, 1)[0]
        : undefined;
    const result = original.apply(this, args);
    const node: unknown = Array.isArray(result) && Array.isArray(result[1]) ? result[1][0] : null;
    if (
      line &&
      node &&
      typeof node === 'object' &&
      typeof Reflect.get(node, 'get') === 'function' &&
      typeof Reflect.get(node, 'set') === 'function'
    ) {
      const parsed = node as ParserNode;
      if (parsed.get('type') === 'hr' && parsed.get('pattern') === line.trim())
        parsed.set('pattern', line);
    }
    return result;
  });
  installed.add(prototype);
}
