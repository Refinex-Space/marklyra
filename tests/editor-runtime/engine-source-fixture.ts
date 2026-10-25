import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';

/** Fault injection for the real internal engine: remove one capability
 * declaration to exercise the adapter's fail-closed fallback. */
export async function engineWithoutCapability(
  name: '__MARKLYRA_NATIVE_SERIALIZATION__' | '__MARKLYRA_NATIVE_LITERAL__',
): Promise<string> {
  const source = await readFile(
    new URL('../../packages/editor-runtime/src/engine/main.js', import.meta.url),
    'utf8',
  );
  const matches: { start: number; end: number }[] = [];
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const callee = node.callee as
      | { type?: string; object?: { name?: string }; property?: { name?: string } }
      | undefined;
    const args = node.arguments as { name?: string; value?: unknown }[] | undefined;
    if (
      node.type === 'CallExpression' &&
      callee?.type === 'MemberExpression' &&
      callee.object?.name === 'Object' &&
      callee.property?.name === 'defineProperty' &&
      args?.[0]?.name === 'globalThis' &&
      args[1]?.value === name &&
      typeof node.start === 'number' &&
      typeof node.end === 'number'
    )
      matches.push({ start: node.start, end: node.end });
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
  }
  visit(parse(source, { ecmaVersion: 'latest' }));
  const match = matches[0];
  if (matches.length !== 1 || !match) throw Error(`Expected one engine capability: ${name}`);
  return `${source.slice(0, match.start)}void 0${source.slice(match.end)}`;
}
