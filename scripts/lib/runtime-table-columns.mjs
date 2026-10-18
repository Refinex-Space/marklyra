import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = '09d40e63b04edd197ffc1c1fbf64c2b4a6077359d0389b89d5c1ed97196ad5b8';
const methodSha256 = '91742b6dbc06246230cbed7bf4570538f52418df3c142720194882300c2e6155';
const digest = (value) => createHash('sha256').update(value).digest('hex');
function walk(node, visit, parent) {
  visit(node, parent);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string')
        walk(child, visit, node);
}
const member = (node, name) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  !node.optional &&
  node.property.type === 'Identifier' &&
  node.property.name === name;
function locate(code) {
  const modules = [];
  walk(parse(code, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, 'registerDynamic') &&
      node.callee.object.name === '$__System' &&
      node.arguments[0]?.value === '58'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw Error('Runtime table columns: ambiguous module 58');
  const module = modules[0];
  if (digest(code.slice(module.start, module.end)) !== moduleSha256)
    throw Error('Runtime table columns: unknown module 58 SHA-256');
  const methods = [];
  walk(module, (node, parent) => {
    if (node.type === 'AssignmentExpression' && member(node.left, 'addCol'))
      methods.push({ node, parent });
  });
  const method = methods[0];
  if (
    methods.length !== 1 ||
    method.node.left.object.name !== 'h' ||
    method.node.operator !== '=' ||
    method.node.right.type !== 'FunctionExpression' ||
    method.parent.type !== 'SequenceExpression' ||
    method.parent.expressions.length !== 13 ||
    method.parent.expressions[2] !== method.node ||
    digest(code.slice(method.node.right.start, method.node.right.end)) !== methodSha256
  )
    throw Error('Runtime table columns: unexpected addCol identity');
  const splices = [];
  walk(method.node.right, (node) => {
    if (node.type === 'CallExpression' && member(node.callee, 'splice')) splices.push(node);
  });
  if (
    splices.length !== 2 ||
    splices.some((node) => {
      const receiver = node.callee.object;
      return (
        receiver.type !== 'CallExpression' ||
        !member(receiver.callee, 'get') ||
        receiver.callee.object.name !== 'r' ||
        receiver.arguments.length !== 1 ||
        receiver.arguments[0]?.value !== 'align' ||
        node.arguments.length !== 3 ||
        node.arguments[0]?.type !== 'ConditionalExpression' ||
        node.arguments[1]?.value !== 0
      );
    }) ||
    splices[0].arguments[2]?.value !== null ||
    splices[1].arguments[2]?.name !== 'c' ||
    code.slice(splices[0].arguments[0].start, splices[0].arguments[0].end) !==
      code.slice(splices[1].arguments[0].start, splices[1].arguments[0].end)
  )
    throw Error('Runtime table columns: unexpected paired column splices');
  return { module, method: method.node.right, field: splices[1].callee.object.arguments[0] };
}

/** Correct the independently verified destination of the delimiter-text splice.
 * The original function is never copied into repository source. */
export function transformRuntimeTableColumns(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw Error('Runtime table columns: unknown original main.js SHA-256');
  if (typeof generated !== 'string') throw Error('Expected generated runtime source');
  const source = locate(original),
    target = locate(generated),
    edit = { start: target.field.start, end: target.field.end, text: '"alignText"' },
    code = generated.slice(0, edit.start) + edit.text + generated.slice(edit.end),
    delta = edit.text.length - (edit.end - edit.start);
  return {
    code,
    metadata: {
      transform: 'module58-column-delimiter-destination',
      version: 1,
      originalSha256,
      moduleSha256,
      methodSha256,
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      correctedModuleSha256: digest(code.slice(target.module.start, target.module.end + delta)),
      correctedMethodSha256: digest(code.slice(target.method.start, target.method.end + delta)),
      originalModuleRange: [source.module.start, source.module.end],
      originalMethodRange: [source.method.start, source.method.end],
      edits: [edit],
    },
  };
}
