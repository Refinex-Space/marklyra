import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
// The focus transform changes only proven cursor dispatches in this module.
const methodByModule = new Map([
  [
    'c8ed1ea972abe00f09b930b72b108f35b19689489344963dba42a5df984253e1',
    'afb67b8ad1b78d471bc7075258dd686fef0b67fbd303296ae369d29b8ee1e5e1',
  ],
  [
    'aba45ca05e660ea376e1ebca911263fa6575d48a7fe500c3d6cb4fca5187ece9',
    '8cd2cc8a9801366c7b3b46c02b994acee2022b649f3d0e631cbb325e96467612',
  ],
]);
const batch = '__marklyraBrushBatch',
  consumed = '__marklyraBrushConsumed',
  task = '__marklyraBrushTask',
  digest = (value) => createHash('sha256').update(value).digest('hex');

function walk(node, visit, parents = []) {
  visit(node, parents);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string')
        walk(child, visit, [...parents, node]);
}
const member = (node, owner, property) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  !node.optional &&
  node.object.type === 'Identifier' &&
  node.object.name === owner &&
  node.property.name === property;

function locate(code) {
  const modules = [];
  walk(parse(code, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, '$__System', 'registerDynamic') &&
      node.arguments[0]?.value === '2b'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw Error('Runtime brush queue: ambiguous module 2b');
  const module = modules[0],
    moduleSha256 = digest(code.slice(module.start, module.end));
  if (!methodByModule.has(moduleSha256))
    throw Error('Runtime brush queue: unknown module 2b SHA-256');
  const methods = [];
  walk(module, (node) => {
    if (
      node.type === 'AssignmentExpression' &&
      member(node.left, 'h', 'prototype') &&
      node.right.type === 'ObjectExpression'
    )
      for (const property of node.right.properties)
        if (property.key?.name === 'brushQueue') methods.push(property.value);
  });
  const method = methods[0];
  if (
    methods.length !== 1 ||
    method.type !== 'FunctionExpression' ||
    !method.async ||
    method.params.length !== 0 ||
    digest(code.slice(method.start, method.end)) !== methodByModule.get(moduleSha256)
  )
    throw Error('Runtime brush queue: unknown brushQueue method');
  const waits = [],
    clears = [];
  walk(method, (node, parents) => {
    if (
      node.type === 'AwaitExpression' &&
      node.argument.type === 'CallExpression' &&
      member(node.argument.callee, 'Promise', 'all')
    )
      waits.push({ node, parents });
    if (
      node.type === 'AssignmentExpression' &&
      member(node.left, 'e', 'queue') &&
      node.right.type === 'ArrayExpression' &&
      node.right.elements.length === 0
    )
      clears.push(node);
  });
  const wait = waits[0],
    clear = clears[0],
    map = wait?.node.argument.arguments[0],
    sequence = wait?.parents.at(-1),
    statement = wait?.parents.at(-2);
  if (
    waits.length !== 1 ||
    clears.length !== 1 ||
    wait.node.argument.arguments.length !== 1 ||
    map?.type !== 'CallExpression' ||
    map.callee.type !== 'MemberExpression' ||
    map.callee.computed ||
    map.callee.property.name !== 'map' ||
    !member(map.callee.object, 'e', 'queue') ||
    map.arguments.length !== 1 ||
    sequence?.type !== 'SequenceExpression' ||
    sequence.expressions.length !== 4 ||
    sequence.expressions[0] !== wait.node ||
    sequence.expressions[1] !== clear ||
    statement?.type !== 'ExpressionStatement' ||
    statement.expression !== sequence
  )
    throw Error('Runtime brush queue: unexpected batch await/clear AST');
  return { module, moduleSha256, method, statement, queue: map.callee.object, clear: clear.right };
}

/** Keep tasks enqueued while the native brush awaits inline rendering.
 * A successful batch consumes only its original task objects. Failed batches
 * retain the native queue, and a restarted queue keeps its newly created tasks. */
export function transformRuntimeBrushQueue(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw Error('Runtime brush queue: unknown original main.js SHA-256');
  if (typeof generated !== 'string') throw Error('Expected generated runtime source');
  if ([batch, consumed, task].some((name) => generated.includes(name)))
    throw Error('Runtime brush queue: duplicate batch transform');
  const source = locate(original),
    target = locate(generated),
    edits = [
      {
        start: target.statement.start,
        end: target.statement.start,
        text: `var ${batch}=e.queue.slice(),${consumed}=new Set(${batch});`,
      },
      { start: target.queue.start, end: target.queue.end, text: batch },
      {
        start: target.clear.start,
        end: target.clear.end,
        text: `e.queue.filter(function(${task}){return !${consumed}.has(${task})})`,
      },
    ];
  let code = generated;
  for (const edit of edits.toReversed())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'module2b-brush-batch-ownership',
      version: 1,
      originalSha256,
      originalModuleSha256: source.moduleSha256,
      inputModuleSha256: target.moduleSha256,
      originalMethodSha256: methodByModule.get(source.moduleSha256),
      inputMethodSha256: methodByModule.get(target.moduleSha256),
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      originalMethodRange: [source.method.start, source.method.end],
      inputMethodRange: [target.method.start, target.method.end],
      edits,
    },
  };
}
