import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = 'c8ed1ea972abe00f09b930b72b108f35b19689489344963dba42a5df984253e1';
const factorySha256 = '58a9b83a6c4e72f7c6fe5b97ebb84d05299bd323e6ca17078a44182c09eb3734';
const capability = '__MARKLYRA_RESTORE_BRUSH_CURSOR__';
const localPrefix = '__marklyraBrush';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function walk(node, visit, parents = []) {
  visit(node, parents);
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === 'object' && typeof child.type === 'string')
        walk(child, visit, [...parents, node]);
    }
  }
}

function member(node, property) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    !node.optional &&
    node.property.type === 'Identifier' &&
    node.property.name === property
  );
}

function expressionPath(node) {
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && !node.optional)
    return `${expressionPath(node.object)}.${node.property.name}`;
  throw new Error('Runtime focus transform: unexpected editor expression');
}

function module2b(source) {
  const modules = [];
  walk(parse(source, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, 'registerDynamic') &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === '$__System' &&
      node.arguments[0]?.type === 'Literal' &&
      node.arguments[0].value === '2b'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw new Error('Runtime focus transform: ambiguous module 2b');
  const call = modules[0],
    factory = call.arguments[3];
  if (
    call.arguments.length !== 4 ||
    factory?.type !== 'FunctionExpression' ||
    factory.params.length !== 3 ||
    factory.params.some((parameter) => parameter.type !== 'Identifier') ||
    digest(source.slice(call.start, call.end)) !== moduleSha256 ||
    digest(source.slice(factory.start, factory.end)) !== factorySha256
  )
    throw new Error('Runtime focus transform: unknown module 2b AST/SHA-256');

  const calls = [];
  walk(factory, (node, parents) => {
    if (node.type !== 'CallExpression' || !member(node.callee, 'exeCommand')) return;
    const undo = node.callee.object;
    if (
      !member(undo, 'undo') ||
      node.optional ||
      node.arguments.length !== 1 ||
      node.arguments[0].type !== 'Identifier'
    )
      throw new Error('Runtime focus transform: unexpected cursor invocation');
    const method = parents
      .toReversed()
      .find(
        (parent) =>
          parent.type === 'Property' &&
          ['brushNode', 'brushQueue', 'expand'].includes(parent.key?.name),
      )?.key.name;
    calls.push({ node, role: method ?? 'inline', editor: undo.object });
  });
  const actual = calls.map(({ node, role, editor }) => [
    role,
    expressionPath(editor),
    node.arguments[0].name,
  ]);
  const expected = [
    ['brushNode', 'this.editor', 't'],
    ['brushQueue', 'e.editor', 'o'],
    ['expand', 'editor', 'o'],
    ['inline', 'r', 'e'],
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Runtime focus transform: unexpected cursor call sites');
  return { call, factory, calls };
}

function replacement(editor, bookmark) {
  // Capture the original receiver/method before its argument, once each. The hook
  // chooses input ownership; an absent hook executes the original method with its receiver.
  return (
    `(function(${localPrefix}Editor){` +
    `const ${localPrefix}Undo=${localPrefix}Editor.undo;` +
    `return (function(${localPrefix}Command,${localPrefix}Bookmark){` +
    `const ${localPrefix}Restore=window.${capability};` +
    `return typeof ${localPrefix}Restore==="function"?` +
    `${localPrefix}Restore(${localPrefix}Editor,${localPrefix}Bookmark,` +
    `${localPrefix}Next=>Reflect.apply(${localPrefix}Command,${localPrefix}Undo,[${localPrefix}Next])):` +
    `Reflect.apply(${localPrefix}Command,${localPrefix}Undo,[${localPrefix}Bookmark]);` +
    `})(${localPrefix}Undo.exeCommand,${bookmark});` +
    `})(${editor})`
  );
}

/** Rewrites three proven brush cursor dispatches only in a generated private runtime.
 * The original artifact and all parse/model/history statements remain untouched.
 * The separate expand/simpleParse cursor dispatch intentionally remains original. */
export function transformRuntimeFocus(originalMain, currentMain = originalMain) {
  if (typeof originalMain !== 'string' || digest(originalMain) !== originalSha256)
    throw new Error('Runtime focus transform: unknown original main.js SHA-256');
  if (typeof currentMain !== 'string') throw new TypeError('Expected generated runtime source');
  if (currentMain.includes(capability) || currentMain.includes(localPrefix))
    throw new Error('Runtime focus transform: duplicate focus capability');
  const original = module2b(originalMain),
    current = module2b(currentMain);
  const edits = current.calls
    .filter(({ role }) => role !== 'expand')
    .map(({ node, role, editor }) => ({
      role,
      start: node.start,
      end: node.end,
      text: replacement(
        currentMain.slice(editor.start, editor.end),
        currentMain.slice(node.arguments[0].start, node.arguments[0].end),
      ),
    }));
  let code = currentMain;
  for (const edit of edits.toReversed())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'module2b-host-brush-cursor',
      version: 2,
      capability,
      originalSha256,
      inputSha256: digest(currentMain),
      transformedSha256: digest(code),
      moduleSha256,
      factorySha256,
      originalModuleRange: [original.call.start, original.call.end],
      moduleRange: [current.call.start, current.call.end],
      originalCallRanges: original.calls
        .filter(({ role }) => role !== 'expand')
        .map(({ node }) => [node.start, node.end]),
      untouchedCallRanges: current.calls
        .filter(({ role }) => role === 'expand')
        .map(({ node }) => [node.start, node.end]),
      edits,
    },
  };
}
