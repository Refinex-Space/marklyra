import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = 'f5b577032264de6389c75b02394dc5947f376b98779c995586b658786f243235';
const factorySha256 = '2fb6a91e6553b1b1f28266d1597634b904aba0a326744078644c22e8289833e7';
const handlerSha256 = '0c12816a8ec8967aa7e498c4c8c59e6c652c73bdee5ed6e076e76415341a5fe4';
const timerSha256 = '48cdff07d9032eda3352f97e31cc7d529c02af50437f5c6fe8835d9e21086427';
const callbackSha256 = '4fb67014efc622fcad4b5a0b6e5705da0bb1aab69cbc670d3cf27ea62b5594a7';
const capability = '__MARKLYRA_REPLAY_SOURCE_CONTEXT__';
const localPrefix = '__marklyraSourceContext';
const digest = (value) => createHash('sha256').update(value).digest('hex');

function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string') walk(child, visit);
}
const member = (node, property) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  !node.optional &&
  node.property.type === 'Identifier' &&
  node.property.name === property;
const identifier = (node, name) => node?.type === 'Identifier' && node.name === name;
function module49(source) {
  const modules = [];
  walk(parse(source, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, 'registerDynamic') &&
      identifier(node.callee.object, '$__System') &&
      node.arguments[0]?.value === '49'
    )
      modules.push(node);
  });
  if (modules.length !== 1)
    throw new Error('Runtime context cursor transform: ambiguous module 49');
  const module = modules[0],
    factory = module.arguments[3];
  if (
    module.arguments.length !== 4 ||
    factory?.type !== 'FunctionExpression' ||
    factory.params.length !== 3 ||
    factory.params.some((parameter) => parameter.type !== 'Identifier') ||
    digest(source.slice(module.start, module.end)) !== moduleSha256 ||
    digest(source.slice(factory.start, factory.end)) !== factorySha256
  )
    throw new Error('Runtime context cursor transform: unknown module 49 AST/SHA-256');
  const handlers = [];
  walk(factory, (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, 'on') &&
      member(node.callee.object, 'cm') &&
      node.callee.object.object.type === 'ThisExpression' &&
      node.arguments[0]?.value === 'contextmenu'
    )
      handlers.push(node.arguments[1]);
  });
  if (handlers.length !== 1)
    throw new Error('Runtime context cursor transform: ambiguous source context handler');
  const handler = handlers[0];
  if (
    handler?.type !== 'FunctionExpression' ||
    handler.params.length !== 2 ||
    !identifier(handler.params[0], 't') ||
    !identifier(handler.params[1], 'n') ||
    digest(source.slice(handler.start, handler.end)) !== handlerSha256
  )
    throw new Error('Runtime context cursor transform: unknown context handler AST/SHA-256');
  const timers = [];
  walk(handler, (node) => {
    if (node.type === 'CallExpression' && identifier(node.callee, 'setTimeout')) timers.push(node);
  });
  const timer = timers[0],
    callback = timer?.arguments[0];
  if (
    timers.length !== 1 ||
    timer.arguments.length !== 2 ||
    timer.arguments[1].type !== 'Literal' ||
    timer.arguments[1].value !== 180 ||
    callback?.type !== 'FunctionExpression' ||
    callback.params.length !== 0 ||
    callback.body.body.length !== 1 ||
    callback.body.body[0].type !== 'ExpressionStatement' ||
    digest(source.slice(timer.start, timer.end)) !== timerSha256 ||
    digest(source.slice(callback.start, callback.end)) !== callbackSha256
  )
    throw new Error('Runtime context cursor transform: unknown delayed callback AST/SHA-256');
  const call = callback.body.body[0].expression,
    options = call.arguments?.[2];
  if (
    call.type !== 'CallExpression' ||
    !member(call.callee, 'setSelection') ||
    !identifier(call.callee.object, handler.params[0].name) ||
    call.optional ||
    call.arguments.length !== 3 ||
    !identifier(call.arguments[0], 'i') ||
    !identifier(call.arguments[1], 'r') ||
    options?.type !== 'ObjectExpression' ||
    options.properties.length !== 1 ||
    options.properties[0].type !== 'Property' ||
    options.properties[0].computed ||
    options.properties[0].key.name !== 'scroll' ||
    options.properties[0].value.type !== 'UnaryExpression' ||
    options.properties[0].value.operator !== '!' ||
    options.properties[0].value.argument.value !== 1
  )
    throw new Error('Runtime context cursor transform: unexpected selection invocation');
  return { module, handler, timer, callback, call };
}
function replacement(cm, event, args) {
  return (
    `(function(${localPrefix}CM){` +
    `const ${localPrefix}Setter=${localPrefix}CM.setSelection;` +
    `return (function(${localPrefix}Anchor,${localPrefix}Head,${localPrefix}Options){` +
    `const ${localPrefix}Replay=window.${capability};` +
    `const ${localPrefix}Execute=()=>Reflect.apply(${localPrefix}Setter,${localPrefix}CM,` +
    `[${localPrefix}Anchor,${localPrefix}Head,${localPrefix}Options]);` +
    `return typeof ${localPrefix}Replay==="function"?` +
    `${localPrefix}Replay(${localPrefix}CM,${event},${localPrefix}Execute):${localPrefix}Execute();` +
    `})(${args.join(',')});` +
    `})(${cm})`
  );
}

/** Generated private-runtime adaptation: only the verified source context timer's
 * selection replay is delegated. Its scheduling and all unclaimed fallback stay original. */
export function transformRuntimeContextCursor(originalMain, currentMain = originalMain) {
  if (typeof originalMain !== 'string' || digest(originalMain) !== originalSha256)
    throw new Error('Runtime context cursor transform: unknown original main.js SHA-256');
  if (typeof currentMain !== 'string') throw new TypeError('Expected generated runtime source');
  if (currentMain.includes(capability) || currentMain.includes(localPrefix))
    throw new Error('Runtime context cursor transform: duplicate replay capability');
  const original = module49(originalMain),
    current = module49(currentMain);
  const edit = {
    start: current.call.start,
    end: current.call.end,
    text: replacement(
      currentMain.slice(current.call.callee.object.start, current.call.callee.object.end),
      current.handler.params[1].name,
      current.call.arguments.map((argument) => currentMain.slice(argument.start, argument.end)),
    ),
  };
  const code = currentMain.slice(0, edit.start) + edit.text + currentMain.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'module49-source-context-replay',
      version: 1,
      capability,
      originalSha256,
      inputSha256: digest(currentMain),
      transformedSha256: digest(code),
      moduleSha256,
      factorySha256,
      handlerSha256,
      timerSha256,
      callbackSha256,
      originalModuleRange: [original.module.start, original.module.end],
      moduleRange: [current.module.start, current.module.end],
      handlerRange: [current.handler.start, current.handler.end],
      originalHandlerRange: [original.handler.start, original.handler.end],
      callbackRange: [current.callback.start, current.callback.end],
      originalCallRange: [original.call.start, original.call.end],
      delay: 180,
      edits: [edit],
    },
  };
}
