import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { wrapPairingHistory } from './pairing-history.mjs';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = 'aadb0afb139ae45cef5b45c1e7625866c05692ab60ffb0614b7347d2dc2b0f40';
const factorySha256 = '96bdb643b8f5299c2f3283b32938fbfba9627c5c25bfa30021e1e9d715677969';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function children(node) {
  return Object.values(node)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value && typeof value === 'object' && typeof value.type === 'string');
}

function walk(node, visit) {
  visit(node);
  for (const child of children(node)) walk(child, visit);
}

function module56(source) {
  const modules = [];
  walk(parse(source, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === '$__System' &&
      node.callee.property.name === 'registerDynamic' &&
      node.arguments[0]?.type === 'Literal' &&
      node.arguments[0].value === '56'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw new Error('Runtime pairing transform: ambiguous module 56');
  const call = modules[0],
    factory = call.arguments[3];
  if (
    call.arguments.length !== 4 ||
    factory?.type !== 'FunctionExpression' ||
    factory.params.length !== 3 ||
    factory.params.some((node) => node.type !== 'Identifier') ||
    digest(source.slice(call.start, call.end)) !== moduleSha256 ||
    digest(source.slice(factory.start, factory.end)) !== factorySha256
  )
    throw new Error('Runtime pairing transform: unknown module 56 AST/SHA-256');
  return { call, factory };
}

function localNames(fn) {
  const names = new Set(
    fn.params.filter((node) => node.type === 'Identifier').map((node) => node.name),
  );
  const collect = (node) => {
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
    if (node.type === 'FunctionDeclaration') {
      if (node.id) names.add(node.id.name);
      return;
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
      names.add(node.id.name);
    for (const child of children(node)) collect(child);
  };
  collect(fn.body);
  return names;
}

function cacheReferences(fn, name) {
  const result = { test: 0, assign: 0, returned: 0 };
  const visit = (node, shadowed = false) => {
    if (
      ['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type)
    )
      shadowed ||= localNames(node).has(name);
    if (!shadowed) {
      if (
        node.type === 'UnaryExpression' &&
        node.operator === '!' &&
        node.argument.type === 'Identifier' &&
        node.argument.name === name
      )
        result.test++;
      if (
        node.type === 'AssignmentExpression' &&
        node.operator === '=' &&
        node.left.type === 'Identifier' &&
        node.left.name === name &&
        node.right.type === 'NewExpression' &&
        node.right.callee.name === 'RegExp'
      )
        result.assign++;
      if (
        node.type === 'ReturnStatement' &&
        node.argument?.type === 'Identifier' &&
        node.argument.name === name
      )
        result.returned++;
    }
    for (const child of children(node)) visit(child, shadowed);
  };
  visit(fn);
  return result;
}

function bindings(factory) {
  const declarations = factory.body.body
    .filter((node) => node.type === 'VariableDeclaration')
    .flatMap((node) => node.declarations);
  const caches = declarations.filter(
    (node) => node.init?.type === 'Literal' && node.init.value === null,
  );
  if (caches.length !== 3 || caches.map((node) => node.id.name).join(',') !== 's,l,c')
    throw new Error('Runtime pairing transform: ambiguous cache bindings');
  const expected = { handlePair: 'c', surroundPair: 's', tryRemovePairStart: 'l' };
  const references = {};
  for (const [method, cache] of Object.entries(expected)) {
    const methods = [];
    walk(factory.body, (node) => {
      if (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.name === factory.params[1].name &&
        node.left.property.name === method &&
        node.right.type === 'FunctionExpression'
      )
        methods.push(node.right);
    });
    if (methods.length !== 1) throw new Error(`Runtime pairing transform: ambiguous ${method}`);
    references[method] = { cache, ...cacheReferences(methods[0], cache) };
    const counts = references[method];
    if (counts.test !== 1 || counts.assign !== 1 || counts.returned !== 1)
      throw new Error(`Runtime pairing transform: unexpected ${method} cache references`);
  }
  return references;
}

/** Compose with other independently verified transforms without assuming their insertion offsets.
 * Original provenance is checked separately; the current module must still be byte-exact original.
 * This only returns generated private-runtime code; it never rewrites the original artifact. */
export function transformRuntimePairing(originalMain, currentMain = originalMain) {
  if (typeof originalMain !== 'string' || digest(originalMain) !== originalSha256)
    throw new Error('Runtime pairing transform: unknown original main.js SHA-256');
  if (typeof currentMain !== 'string') throw new TypeError('Expected generated runtime source');
  const original = module56(originalMain),
    current = module56(currentMain);
  const references = bindings(current.factory);
  if (currentMain.includes('__MARKLYRA_RESET_PAIRING__'))
    throw new Error('Runtime pairing transform: duplicate reset capability');
  const insertionUtf16Offset = current.factory.body.end - 1;
  const originalInsertionUtf16Offset = original.factory.body.end - 1;
  const insertion =
    ';Object.defineProperty(globalThis,"__MARKLYRA_RESET_PAIRING__",{' +
    'value:Object.freeze(function(){s=null;l=null;c=null;}),writable:false,configurable:false,enumerable:false});' +
    `${current.factory.params[1].name}.surroundPair=(${wrapPairingHistory.toString()})(${current.factory.params[1].name}.surroundPair);`;
  if (currentMain[insertionUtf16Offset] !== '}')
    throw new Error('Unexpected pairing insertion boundary');
  const code =
    currentMain.slice(0, insertionUtf16Offset) +
    insertion +
    currentMain.slice(insertionUtf16Offset);
  return {
    code,
    metadata: {
      transform: 'module56-reset-pairing',
      version: 2,
      originalSha256,
      inputSha256: digest(currentMain),
      transformedSha256: digest(code),
      moduleSha256,
      factorySha256,
      originalModuleRange: [original.call.start, original.call.end],
      moduleRange: [current.call.start, current.call.end],
      originalInsertionUtf16Offset,
      insertionUtf16Offset,
      insertionUtf8Offset: Buffer.byteLength(currentMain.slice(0, insertionUtf16Offset)),
      insertedBytes: Buffer.byteLength(insertion),
      references,
      historyFilter: 'equivalent-surround-tail-v1',
      historyWrapperSha256: digest(wrapPairingHistory.toString()),
      edits: [{ start: insertionUtf16Offset, end: insertionUtf16Offset, text: insertion }],
    },
  };
}
