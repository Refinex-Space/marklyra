import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = 'd8cec4f521f8522faaf0da20bcd157d1af1bba0dda8a7a6437991ce6a4cd38a9';
const methodSha256 = '4679433d76935f78fa8e779968d5e629f67367960db985a7a82360c352600108';
const callbackSha256 = '1915d23deb9c6a7b1a8f099b422ba2410d713e62849587c45b88d5c8d875fdc7';
const hook = '__MARKLYRA_HTML_CALLBACK__';
const messageHook = '__MARKLYRA_HTML_MESSAGE__';
const messageSha256 = 'e673419f3921b339fbedc1111a407245f585ff51d55105ccaa4b0e7539f51d05';
const messageCallbackSha256 = '8de567121d957cf4151374bee356d249d25c5ea51cb56bf66381156557d93317';
const digest = (source) => createHash('sha256').update(source).digest('hex');
function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string') walk(child, visit);
}
function locate(source) {
  const modules = [];
  walk(parse(source, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object.name === '$__System' &&
      node.callee.property.name === 'registerDynamic' &&
      node.arguments[0]?.value === '17'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw Error('Runtime HTML lifecycle: ambiguous module17');
  const module = modules[0];
  if (digest(source.slice(module.start, module.end)) !== moduleSha256)
    throw Error('Runtime HTML lifecycle: unknown module17 SHA-256');
  const methods = [];
  walk(module, (node) => {
    if (node.type === 'MethodDefinition' && !node.computed && node.key.name === 'startEditing')
      methods.push(node.value);
  });
  const method = methods[0];
  if (
    methods.length !== 1 ||
    method.type !== 'FunctionExpression' ||
    digest(source.slice(method.start, method.end)) !== methodSha256
  )
    throw Error('Runtime HTML lifecycle: unknown startEditing identity');
  const timers = [];
  walk(method, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'setTimeout' &&
      node.arguments[1]?.value === 20
    )
      timers.push(node);
  });
  const timer = timers[0],
    callback = timer?.arguments[0];
  if (
    timers.length !== 1 ||
    timer.arguments.length !== 2 ||
    callback?.type !== 'FunctionExpression' ||
    callback.params.length ||
    digest(source.slice(callback.start, callback.end)) !== callbackSha256
  )
    throw Error('Runtime HTML lifecycle: unknown Enter callback');
  const listeners = [];
  walk(module, (node) => {
    if (node.type === 'MethodDefinition' && !node.computed && node.key.name === 'listenMessage')
      listeners.push(node.value);
  });
  const registration = listeners[0];
  if (
    listeners.length !== 1 ||
    registration.type !== 'FunctionExpression' ||
    registration.params.length !== 0 ||
    digest(source.slice(registration.start, registration.end)) !== messageSha256
  )
    throw Error('Runtime HTML lifecycle: unknown message listener');
  const callbacks = [];
  walk(registration, (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'addEventListener' &&
      node.arguments[0]?.value === 'message'
    )
      callbacks.push(node.arguments[1]);
  });
  const listener = callbacks[0];
  if (
    callbacks.length !== 1 ||
    listener?.type !== 'FunctionExpression' ||
    listener.params.length !== 1 ||
    listener.params[0].name !== 't' ||
    digest(source.slice(listener.start, listener.end)) !== messageCallbackSha256
  )
    throw Error('Runtime HTML lifecycle: unknown message callback');
  return { module, method, timer, callback, listener };
}
/** Generated callback source remains private. Only its exact scheduling argument
 * changes; the original Enter/ShiftEnter and callback body remain intact. */
export function transformRuntimeHTMLLifecycle(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw Error('Runtime HTML lifecycle: unknown original SHA-256');
  if (typeof generated !== 'string') throw Error('Expected generated runtime source');
  if (generated.includes(hook) || generated.includes(messageHook))
    throw Error('Runtime HTML lifecycle: duplicate hook');
  const from = locate(original),
    target = locate(generated),
    callback = generated.slice(target.callback.start, target.callback.end),
    text = `(typeof globalThis.${hook}==="function"?globalThis.${hook}(${callback}):${callback})`,
    edit = { start: target.callback.start, end: target.callback.end, text },
    messageEdit = {
      start: target.listener.body.start + 1,
      end: target.listener.body.start + 1,
      text: `if(typeof globalThis.${messageHook}==="function"&&!globalThis.${messageHook}(t))return;`,
    },
    edits = [edit, messageEdit];
  let code = generated;
  for (const change of [...edits].reverse())
    code = code.slice(0, change.start) + change.text + code.slice(change.end);
  const delta = edits.reduce(
    (sum, change) => sum + change.text.length - (change.end - change.start),
    0,
  );
  return {
    code,
    metadata: {
      transform: 'module17-html-enter-lifecycle',
      version: 1,
      originalSha256,
      moduleSha256,
      methodSha256,
      callbackSha256,
      hook,
      originalCallbackRange: [from.callback.start, from.callback.end],
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      correctedModuleSha256: digest(code.slice(target.module.start, target.module.end + delta)),
      messageHook,
      messageSha256,
      messageCallbackSha256,
      edits,
    },
  };
}
