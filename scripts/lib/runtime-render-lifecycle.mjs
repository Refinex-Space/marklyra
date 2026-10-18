import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '7248dc702a190d2f0ed90c1e3b5f895686a278e124a2bf9becc7c15114270b79',
  hook = '__MARKLYRA_RENDER_TICKET__',
  local = '__marklyraRenderTicket';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const modules = {
  '1c': {
    start: 1103034,
    sha256: '20a18f4c08b36db60f176d375910b052e62885736184954a470e9631ea8145a2',
  },
  15: {
    start: 1120971,
    sha256: '826ca1ed83b1ce9e598277be12031815f24b3c681c694774ac510b00f3c87ed8',
  },
};
const sites = [
  {
    module: '1c',
    method: 'updateDiagram',
    methodSha256: 'e3f7bc9fc53f9984db6a34a2e946b9c16b25ec6246c52e1ed1e13bb648ca107b',
    declaration: 1114521,
    declarationSha256: 'c961016bdf67d1545d2cf8fc7548c7395fd2c59714dfd3bf7f38cb31094ce5f6',
    names: ['s', 'l'],
    preview: 'a',
    cm: 'o',
    commit: 1114652,
    commitSha256: '82f45a915943838d26151fd8d1e9d0e872352ec22e4fec0a2c912a06009c06f7',
  },
  {
    module: '1c',
    method: 'startEditing',
    methodSha256: 'a7bcf4bf5156191760dd17ecabb4d63f9ae376a71e8b7cb8841eaaa907064862',
    declaration: 1119001,
    declarationSha256: 'edf2e2c98e94c71e9d475fafa7894a9629fd18442728899c21c132f2a98d0384',
    names: ['r', 'o'],
    preview: 'i',
    cm: 'n',
    commit: 1119132,
    commitSha256: 'c6a3be2ca0beff85d82b10e322b024239b8ab7434345bebd70558532e0dfbadf',
  },
  {
    module: '15',
    method: 'updateDiagram',
    methodSha256: 'fb10f4bb8f8997a97a242fe685ac7f4c8d2f8845de40e6bc146e5c263cf8ddd3',
    declaration: 1127851,
    declarationSha256: 'f1346844eec56c69b17ed62680d04727931483278571f30276700b34adab36e6',
    names: ['e', 't', 'n', 'r', 'o'],
    preview: 'n',
    cm: 'm',
    commit: 1128022,
    commitSha256: 'e2bfa5ed4ad749efb0cb8cbe0228c43822879495e39df7bb9848f1d4e909d508',
    error: 1128393,
    errorSha256: 'ac891436eb46806d8ffe8e37724381357c2ce3c4d5ceb3d00acadcbaa9530122',
  },
];
function walk(node, visit, parents = []) {
  visit(node, parents);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child === 'object' && typeof child.type === 'string')
        walk(child, visit, [...parents, node]);
}
function locate(code) {
  const found = new Map();
  walk(parse(code, { ecmaVersion: 'latest' }), (node) => {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object.name === '$__System' &&
      node.callee.property.name === 'registerDynamic' &&
      Object.hasOwn(modules, node.arguments[0]?.value)
    ) {
      const id = node.arguments[0].value;
      if (found.has(id)) throw Error('Runtime render lifecycle: ambiguous module');
      if (digest(code.slice(node.start, node.end)) !== modules[id].sha256)
        throw Error('Runtime render lifecycle: unknown module SHA-256');
      found.set(id, node);
    }
  });
  if (found.size !== 2) throw Error('Runtime render lifecycle: missing modules');
  return sites.map((site) => {
    const module = found.get(site.module),
      methods = [];
    walk(module, (node) => {
      if (node.type === 'MethodDefinition' && !node.computed && node.key.name === site.method)
        methods.push(node);
    });
    const method = methods[0];
    if (methods.length !== 1 || digest(code.slice(method.start, method.end)) !== site.methodSha256)
      throw Error('Runtime render lifecycle: unknown method identity');
    const point = (position, sha256, type) => {
      const matches = [];
      walk(method, (node, parents) => {
        if (node.start - module.start === position - modules[site.module].start)
          matches.push({ node, parents });
      });
      const result = matches.find(
        ({ node }) => node.type === type && digest(code.slice(node.start, node.end)) === sha256,
      );
      if (!result) throw Error('Runtime render lifecycle: unknown commit/declaration identity');
      return result;
    };
    const declaration = point(site.declaration, site.declarationSha256, 'VariableDeclaration').node,
      commit = point(
        site.commit,
        site.commitSha256,
        site.module === '15' ? 'FunctionExpression' : 'ExpressionStatement',
      );
    if (
      JSON.stringify(declaration.declarations.map((d) => d.id.name)) !== JSON.stringify(site.names)
    )
      throw Error('Runtime render lifecycle: unknown render variables');
    const error = site.error
      ? point(site.error, site.errorSha256, 'CatchClause').node
      : [...commit.parents].reverse().find((node) => node.type === 'TryStatement')?.handler;
    if (!error || error.type !== 'CatchClause' || error.body.type !== 'BlockStatement')
      throw Error('Runtime render lifecycle: missing error boundary');
    return { site, module, declaration, commit: commit.node, error };
  });
}
export function transformRuntimeRenderLifecycle(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw Error('Runtime render lifecycle: unknown original SHA-256');
  if (typeof generated !== 'string') throw Error('Expected generated runtime source');
  if (generated.includes(hook) || generated.includes(local))
    throw Error('Runtime render lifecycle: duplicate hook');
  locate(original);
  const targets = locate(generated),
    edits = [],
    guard = `if(${local}&&!${local}.current())return;`;
  for (const { site, declaration, commit, error } of targets) {
    edits.push({
      start: declaration.end,
      end: declaration.end,
      text: `var ${local}=typeof globalThis.${hook}==="function"?globalThis.${hook}(${site.preview},${site.cm}):null;`,
    });
    edits.push({
      start: site.module === '15' ? commit.body.start + 1 : commit.start,
      end: site.module === '15' ? commit.body.start + 1 : commit.start,
      text: guard,
    });
    edits.push({ start: error.body.start + 1, end: error.body.start + 1, text: guard });
  }
  edits.sort((a, b) => a.start - b.start);
  if (new Set(edits.map((edit) => edit.start)).size !== edits.length)
    throw Error('Runtime render lifecycle: overlapping edits');
  let code = generated;
  for (const edit of [...edits].reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  const shifted = (point) =>
      point +
      edits.filter((edit) => edit.start < point).reduce((sum, edit) => sum + edit.text.length, 0),
    changedModules = [...new Map(targets.map((t) => [t.site.module, t.module])).entries()].map(
      ([id, node]) => ({
        id,
        originalSha256: modules[id].sha256,
        correctedSha256: digest(code.slice(shifted(node.start), shifted(node.end))),
      }),
    );
  return {
    code,
    metadata: {
      transform: 'module1c-15-render-commit-lifecycle',
      version: 1,
      originalSha256,
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      hook,
      edits,
      modules: changedModules,
    },
  };
}
