import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79';
const moduleSha256 = '713a28919e6cd278377be1590412dbecce450724015463f289d1bc7b0a1b5623';
const capability = '__MARKLYRA_NATIVE_LITERAL__';
const hook = '__MARKLYRA_LITERAL_RULE__';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sites = [
  {
    range: [891856, 891865],
    identifier: 'te',
    sha256: '5f90f95d9619139179a2ed700b4330f139d8896cc720775d2cf0b6d93640266b',
  },
  {
    range: [891999, 892007],
    identifier: 'e',
    sha256: '3cb8d6e5e4a6b320252d736348b21a9153833e002d4400d3e08e969e6902883c',
  },
];
function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string') walk(child, visit);
}
const member = (node, name) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  !node.optional &&
  node.property.type === 'Identifier' &&
  node.property.name === name;
function locate(source) {
  const modules = [];
  walk(parse(source, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee, 'registerDynamic') &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === '$__System' &&
      node.arguments[0]?.value === '19'
    )
      modules.push(node);
  });
  if (modules.length !== 1) throw new Error('Runtime literal transform: ambiguous module 19');
  const module = modules[0],
    factory = module.arguments[3];
  if (
    module.arguments.length !== 4 ||
    factory?.type !== 'FunctionExpression' ||
    factory.params.length !== 3 ||
    digest(source.slice(module.start, module.end)) !== moduleSha256
  )
    throw new Error('Runtime literal transform: unknown module 19 AST/SHA-256');
  const patterns = [];
  walk(factory, (node) => {
    if (
      node.type !== 'ObjectExpression' ||
      !node.properties.some(
        (property) =>
          property.type === 'Property' &&
          !property.computed &&
          property.key.type === 'Identifier' &&
          property.key.name === 'type' &&
          member(property.value, 'hr') &&
          property.value.object.type === 'Identifier' &&
          property.value.object.name === 'a',
      )
    )
      return;
    const candidates = node.properties.filter(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        property.key.type === 'Identifier' &&
        property.key.name === 'pattern',
    );
    if (candidates.length !== 1) throw new Error('Runtime literal transform: ambiguous HR pattern');
    patterns.push(candidates[0].value);
  });
  if (patterns.length !== 2) throw new Error('Runtime literal transform: unexpected HR site count');
  for (const [index, pattern] of patterns.entries()) {
    const site = sites[index];
    if (
      !site ||
      pattern.type !== 'CallExpression' ||
      pattern.optional ||
      pattern.arguments.length !== 0 ||
      !member(pattern.callee, 'trim') ||
      pattern.callee.object.type !== 'Identifier' ||
      pattern.callee.object.name !== site.identifier ||
      pattern.start - module.start !== site.range[0] - 873809 ||
      pattern.end - module.start !== site.range[1] - 873809 ||
      digest(source.slice(pattern.start, pattern.end)) !== site.sha256
    )
      throw new Error('Runtime literal transform: unexpected HR expression identity');
  }
  return { module, factory, patterns };
}

/** Keep the original parser's exact HR line available at the two proven pattern
 * assignments. Generated output stays private; no parser body is reproduced.
 * Missing host hooks retain the shipped trimming behavior.
 * @param {string} original
 * @param {string} generated
 */
export function transformRuntimeLiteral(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw new Error('Runtime literal transform: unknown original main.js SHA-256');
  if (typeof generated !== 'string') throw new Error('Expected generated runtime source');
  if (generated.includes(capability) || generated.includes(hook))
    throw new Error('Runtime literal transform: duplicate literal capability');
  const source = locate(original),
    target = locate(generated);
  const edits = target.patterns.map((pattern, index) => {
    const line = sites[index].identifier;
    return {
      start: pattern.start,
      end: pattern.end,
      text: `(typeof globalThis.${hook}==="function"?globalThis.${hook}(${line},${line}.trim()):${line}.trim())`,
    };
  });
  edits.push({
    start: target.factory.body.end - 1,
    end: target.factory.body.end - 1,
    text: `;Object.defineProperty(globalThis,"${capability}",{value:Object.freeze({version:1,moduleSha256:"${moduleSha256}",sites:2})});`,
  });
  let code = generated;
  for (const edit of [...edits].reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'module19-literal-rule-line',
      version: 1,
      originalSha256,
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      moduleSha256,
      originalModuleRange: [source.module.start, source.module.end],
      moduleRange: [target.module.start, target.module.end],
      originalPatternRanges: source.patterns.map((node) => [node.start, node.end]),
      hook,
      capability,
      edits,
    },
  };
}
