import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { buildEngine } from '../../packages/editor-runtime/scripts/build-engine.mjs';
import { analyzeSource } from './source-symbols.mjs';

export const enginePath = new URL(
  '../../packages/editor-runtime/src/engine/main.js',
  import.meta.url,
);
const root = fileURLToPath(new URL('../../', import.meta.url));
export const engineSource = (await buildEngine({ root, entry: 'main.js' })).code;
export const engineAST = parse(engineSource, { ecmaVersion: 'latest' });
/** Select unambiguous capabilities from the compiled engine source. */
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

const sourceOverrides = new WeakMap();
export const sourceOf = (node) =>
  sourceOverrides.get(node) ?? engineSource.slice(node.start, node.end);
export const expressionOf = (node) => `(${sourceOf(node)})`;

const registrations = nodes(
  engineAST,
  (node) =>
    node.type === 'CallExpression' &&
    member(node.callee, 'define') &&
    node.callee.object.name === 'engineModules',
);
const registrationCache = new Map();
let referenceBindings;
let declarations;

/** Resolve the lexical declaration in the actual Rollup output. Function names
 * can repeat in nested scopes, so spelling alone is not sufficient evidence. */
function functionReference(node, seen = new Set()) {
  if (node?.type === 'FunctionDeclaration' || node?.type === 'FunctionExpression') return node;
  assert.equal(node?.type, 'Identifier', 'Expected an emitted factory function reference');
  if (!referenceBindings) {
    const analysis = analyzeSource('engine-runtime.js', engineSource);
    referenceBindings = new Map();
    declarations = new Map();
    for (const binding of analysis.bindings)
      for (const identifier of binding.occurrences)
        referenceBindings.set(identifier.getStart(analysis.source), {
          start: binding.decl.getStart(analysis.source),
          name: binding.name,
        });
    for (const declaration of nodes(
      engineAST,
      (candidate) =>
        candidate.type === 'FunctionDeclaration' ||
        candidate.type === 'FunctionExpression' ||
        candidate.type === 'VariableDeclarator',
    ))
      declarations.set(declaration.start, declaration);
  }
  const binding = referenceBindings.get(node.start);
  assert.ok(binding, `Unresolved emitted factory binding ${node.name}`);
  assert.ok(!seen.has(binding.start), `Cyclic emitted factory alias ${binding.name}`);
  seen.add(binding.start);
  const declaration = declarations.get(binding.start);
  assert.ok(declaration, `Missing emitted declaration for ${binding.name}`);
  return functionReference(
    declaration.type === 'VariableDeclarator' ? declaration.init : declaration,
    seen,
  );
}

/** Resolve each registration to its executable source initializer. */
export function engineModule(name) {
  if (registrationCache.has(name)) return registrationCache.get(name);
  const registration = unique(
    registrations.filter((node) => node.arguments[0]?.value === name),
    `engine module ${name}`,
  );
  const initializer = registration.arguments[3];
  if (initializer?.type === 'FunctionExpression') {
    registrationCache.set(name, registration);
    return registration;
  }
  const factory = functionReference(initializer);
  assert.equal(factory.params.length, 3, `Expected the runtime factory ABI for ${name}`);
  assert.equal(factory.async, false);
  assert.equal(factory.generator, false);
  const factoryView = { ...factory, type: 'FunctionExpression' };
  sourceOverrides.set(factoryView, expressionOf(factory));
  const view = {
    ...registration,
    arguments: [...registration.arguments.slice(0, 3), factoryView],
  };
  sourceOverrides.set(
    view,
    `${sourceOf(registration.callee)}(${view.arguments.map(sourceOf).join(', ')})`,
  );
  registrationCache.set(name, view);
  return view;
}

/** All real registrations, with source-backed bodies for either emitted shape. */
export function engineModuleRegistrations() {
  return registrations.map((registration) => engineModule(registration.arguments[0]?.value));
}

export function identifierRoot(node) {
  while (node.type === 'MemberExpression') node = node.object;
  assert.equal(node.type, 'Identifier', 'Expected a lexical binding');
  return node.name;
}

/** Locate a real module dependency without coupling fixtures to local spelling. */
export function engineImportBinding(id, dependency, property) {
  const factory = engineModule(id).arguments[3];
  const requireName = factory.params[0].name;
  const initialValue = (node) =>
    node?.type === 'SequenceExpression' ? node.expressions.at(-1) : node;
  const binding = unique(
    nodes(factory, (node) => {
      const value = initialValue(node.init);
      return (
        node.type === 'VariableDeclarator' &&
        value?.type === 'CallExpression' &&
        value.callee.name === requireName &&
        value.arguments[0]?.value === dependency
      );
    }),
    `${id} dependency ${dependency}`,
  ).id.name;
  if (!property) return binding;
  return unique(
    nodes(
      factory,
      (node) =>
        node.type === 'VariableDeclarator' &&
        member(node.init, property) &&
        node.init.object.name === binding,
    ),
    `${id} dependency ${dependency}.${property}`,
  ).id.name;
}

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
