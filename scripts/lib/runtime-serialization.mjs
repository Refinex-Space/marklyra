import { createHash } from 'node:crypto';
import { parseExpressionAt } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = 'd7402487d948173fb41732f84f601ecbc409cc22cfd3b54cbc1df8b1caffa5eb';
const moduleStart = 24_879;
const moduleEnd = 35_704;
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** Expose an existing private closure without reproducing or changing its body.
 * Only the verified 1.11.7 artifact is supported. Caller writes the returned code
 * to its private generated runtime, never back to the runtime source snapshot.
 * @param {string} source
 */
export function transformRuntimeSerialization(source) {
  if (typeof source !== 'string' || digest(source) !== originalSha256)
    throw new Error('Runtime serializer transform: unknown original main.js SHA-256');
  const module = source.slice(moduleStart, moduleEnd);
  if (digest(module) !== moduleSha256)
    throw new Error('Runtime serializer transform: unknown module 12 SHA-256');
  const call = parseExpressionAt(module, 0, { ecmaVersion: 'latest' });
  const callback = call.type === 'CallExpression' ? call.arguments[3] : undefined;
  if (
    call.type !== 'CallExpression' ||
    call.start !== 0 ||
    call.end !== module.length ||
    call.callee.type !== 'MemberExpression' ||
    call.callee.computed ||
    call.callee.object.type !== 'Identifier' ||
    call.callee.object.name !== '$__System' ||
    call.callee.property.type !== 'Identifier' ||
    call.callee.property.name !== 'registerDynamic' ||
    call.arguments.length !== 4 ||
    call.arguments[0].type !== 'Literal' ||
    call.arguments[0].value !== '12' ||
    callback?.type !== 'FunctionExpression' ||
    callback.params.length !== 3
  )
    throw new Error('Runtime serializer transform: unexpected module registration AST');
  const declarations = callback.body.body
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations);
  const named = (name) =>
    declarations.filter(
      (declaration) => declaration.id.type === 'Identifier' && declaration.id.name === name,
    );
  const lines = named('u');
  const node = named('r');
  const map = named('o');
  if (
    lines.length !== 1 ||
    lines[0].init?.type !== 'FunctionExpression' ||
    node.length !== 1 ||
    node[0].init?.type !== 'MemberExpression' ||
    node[0].init.property.type !== 'Identifier' ||
    node[0].init.property.name !== 'Node' ||
    map.length !== 1 ||
    map[0].init?.type !== 'MemberExpression' ||
    map[0].init.property.type !== 'Identifier' ||
    map[0].init.property.name !== 'NodeMap'
  )
    throw new Error('Runtime serializer transform: ambiguous native capability bindings');
  const insertionUtf16Offset = moduleStart + callback.body.end - 1;
  if (insertionUtf16Offset !== 35_702 || source[insertionUtf16Offset] !== '}')
    throw new Error('Runtime serializer transform: unexpected insertion boundary');
  const insertion =
    ';Object.defineProperty(globalThis,"__MARKLYRA_NATIVE_SERIALIZATION__",{value:Object.freeze({' +
    `version:1,moduleSha256:"${moduleSha256}",` +
    'nodePrototype:r.prototype,mapPrototype:o.prototype,nodeToMark:r.prototype.toMark,' +
    'mapToMark:o.prototype.toMark,lines:u,array:Array})});';
  const code =
    source.slice(0, insertionUtf16Offset) + insertion + source.slice(insertionUtf16Offset);
  return {
    code,
    metadata: {
      transform: 'module12-native-lines',
      version: 1,
      originalSha256,
      transformedSha256: digest(code),
      moduleSha256,
      insertionUtf16Offset,
      insertionUtf8Offset: Buffer.byteLength(source.slice(0, insertionUtf16Offset)),
      insertedBytes: Buffer.byteLength(insertion),
    },
  };
}
