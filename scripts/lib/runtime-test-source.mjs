import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';

export const enginePath = new URL(
  '../../packages/editor-runtime/src/engine/main.js',
  import.meta.url,
);
export const engineSource = await readFile(enginePath, 'utf8');
export const engineAST = parse(engineSource, { ecmaVersion: 'latest' });

/** Tests execute nodes from the checked-in engine, rather than reconstruction
 * strings or build-time patches. Every selected capability must be unambiguous. */
export function nodes(root, predicate, found = []) {
  if (predicate(root)) found.push(root);
  for (const value of Object.values(root))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string')
        nodes(child, predicate, found);
  return found;
}

export function unique(values, description) {
  assert.equal(values.length, 1, `Expected one ${description}, found ${values.length}`);
  return values[0];
}

export const member = (node, name) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  !node.optional &&
  node.property?.name === name;

export function engineModule(id) {
  return unique(
    nodes(
      engineAST,
      (node) =>
        node.type === 'CallExpression' &&
        member(node.callee, 'registerDynamic') &&
        node.callee.object.name === '$__System' &&
        node.arguments[0]?.value === id,
    ),
    `engine module ${id}`,
  );
}

export const sourceOf = (node) => engineSource.slice(node.start, node.end);
export const expressionOf = (node) => `(${sourceOf(node)})`;

export function hasHook(node, name) {
  return nodes(node, (child) => member(child, name)).length > 0;
}

export function capability(name, module) {
  return unique(
    nodes(
      module,
      (node) =>
        node.type === 'CallExpression' &&
        member(node.callee, 'defineProperty') &&
        node.callee.object.name === 'Object' &&
        node.arguments[0]?.name === 'globalThis' &&
        node.arguments[1]?.value === name,
    ),
    name,
  );
}
