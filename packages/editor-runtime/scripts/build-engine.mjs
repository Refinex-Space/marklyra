import { lstat, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { parse } from 'acorn';
import { build } from 'vite';
import { compileReflectiveNames } from '../../../scripts/lib/engine-reflective-names.mjs';

const repository = resolve(import.meta.dirname, '../../..');
const sourceDirectory = 'packages/editor-runtime/src/engine';

function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child.type === 'string') walk(child, visit);
}

function moduleDefinition(call, path) {
  const [name, dependencies, lazy] = call.arguments;
  if (
    name?.type !== 'Literal' ||
    typeof name.value !== 'string' ||
    dependencies?.type !== 'ArrayExpression' ||
    dependencies.elements.some(
      (value) => value?.type !== 'Literal' || typeof value.value !== 'string',
    ) ||
    lazy?.type !== 'Literal' ||
    typeof lazy.value !== 'boolean'
  )
    throw new Error(`Invalid engine module declaration: ${path}`);
  return {
    path,
    name: name.value,
    dependencies: dependencies.elements.map((value) => value.value),
    lazy: lazy.value,
  };
}

function isDefinition(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.name === 'engineModules' &&
    node.callee.property.name === 'define'
  );
}

async function collectSources(root, entry) {
  const directory = resolve(root, sourceDirectory);
  const sources = new Map();
  const asts = new Map();
  function sourcePath(file) {
    const path = relative(directory, file);
    if (
      !path ||
      path === '..' ||
      path.startsWith(`..${sep}`) ||
      path.startsWith(sep) ||
      !/\.(?:js|json)$/.test(path)
    )
      throw new Error(`Engine import must stay in its source directory: ${file}`);
    return relative(root, file).split(sep).join('/');
  }
  async function readRegular(file) {
    const path = sourcePath(file);
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const info = await lstat(resolve(root, ...parts.slice(0, index)));
      if (info.isSymbolicLink() || (index === parts.length ? !info.isFile() : !info.isDirectory()))
        throw new Error(`Engine input must be a regular workspace file: ${path}`);
    }
    return readFile(file, 'utf8');
  }
  function resolveImport(specifier, importer) {
    if (typeof specifier !== 'string' || !specifier.startsWith('.') || specifier.includes('\\'))
      throw new Error(`Engine imports must be explicit relative source paths: ${specifier}`);
    const file = resolve(dirname(importer), specifier);
    sourcePath(file);
    return file;
  }
  async function visit(file) {
    if (sources.has(file)) return;
    const text = await readRegular(file);
    sources.set(file, text);
    if (file.endsWith('.json')) {
      JSON.parse(text);
      return;
    }
    const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    asts.set(file, ast);
    const imports = [];
    walk(ast, (node) => {
      if (
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) &&
        node.source
      )
        imports.push(node.source.value);
      if (node.type === 'ImportExpression') {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string')
          throw new Error(
            `Engine dynamic imports must use a fixed local source path: ${sourcePath(file)}`,
          );
        imports.push(node.source.value);
      }
    });
    for (const specifier of imports) await visit(resolveImport(specifier, file));
  }
  const entryFile = resolve(directory, entry);
  sourcePath(entryFile);
  await visit(entryFile);
  const factories = [];
  const registrations = [];
  if (entry === 'main.js') {
    const entryAst = asts.get(entryFile);
    const imports = new Map();
    for (const declaration of entryAst.body) {
      if (declaration.type !== 'ImportDeclaration') continue;
      const defaultImport = declaration.specifiers.find(
        (item) => item.type === 'ImportDefaultSpecifier',
      );
      if (defaultImport)
        imports.set(defaultImport.local.name, resolveImport(declaration.source.value, entryFile));
    }
    const installers = [];
    walk(entryAst, (node) => {
      if (node.type === 'FunctionExpression' && node.id?.name === 'installEngineModules')
        installers.push(node);
    });
    if (installers.length !== 1)
      throw new Error('Expected one executable engine installation function');
    for (const statement of installers[0].body.body) {
      const call = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
      if (!call || call.type !== 'CallExpression') continue;
      if (isDefinition(call)) {
        const initializer = call.arguments[3];
        const local =
          initializer?.type === 'CallExpression' && initializer.callee.name === 'anonymousFactory'
            ? initializer.arguments[0]
            : undefined;
        const file = local?.type === 'Identifier' ? imports.get(local.name) : undefined;
        if (!file)
          throw new Error('Engine factories must reference an imported source initializer');
        const declarations = asts
          .get(file)
          .body.filter((node) => node.type === 'ExportDefaultDeclaration');
        const factory = declarations[0]?.declaration;
        if (
          declarations.length !== 1 ||
          factory?.type !== 'FunctionDeclaration' ||
          factory.async ||
          factory.generator ||
          factory.params.length !== 3
        )
          throw new Error(`Invalid engine source factory: ${sourcePath(file)}`);
        const metadata = moduleDefinition(call, sourcePath(file));
        factories.push(metadata);
        registrations.push(metadata);
      } else if (
        call.callee.type === 'MemberExpression' &&
        call.callee.property.name === 'call' &&
        imports.has(call.callee.object.name)
      ) {
        const file = imports.get(call.callee.object.name);
        walk(asts.get(file), (node) => {
          if (isDefinition(node)) registrations.push(moduleDefinition(node, sourcePath(file)));
        });
      }
    }
    const names = new Set();
    for (const definition of registrations) {
      if (names.has(definition.name))
        throw new Error(`Duplicate engine module: ${definition.name}`);
      names.add(definition.name);
    }
    for (const definition of registrations)
      for (const dependency of definition.dependencies)
        if (!names.has(dependency))
          throw new Error(`Unknown engine dependency ${dependency} in ${definition.name}`);
  }
  return {
    entryFile,
    sources,
    resolveImport,
    metadata: {
      entry: sourcePath(entryFile),
      inputs: [...sources.keys()].map(sourcePath).sort(),
      factories,
      registrations,
    },
  };
}

/** Discover the normal source import graph without executing it or writing files. */
export async function inspectEngineSources({ root = repository, entry = 'main.js' } = {}) {
  return (await collectSources(resolve(root), entry)).metadata;
}

/** Build the source entry through Vite/Rollup. No source slots, manifests or
 * runtime eval are involved; library installers are ordinary imported functions.
 */
export async function buildEngine({ root = repository, entry = 'main.js' } = {}) {
  root = resolve(root);
  const collected = await collectSources(root, entry);
  const reflectedNames = [];
  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'error',
    esbuild: false,
    plugins: [
      {
        name: 'marklyra-engine-sources',
        enforce: 'pre',
        resolveId(specifier, importer) {
          const file = importer ? collected.resolveImport(specifier, importer) : resolve(specifier);
          if (!collected.sources.has(file))
            throw new Error(`Unexpected engine source import: ${specifier}`);
          return file;
        },
        load(id) {
          if (!collected.sources.has(id)) throw new Error(`Unexpected engine source load: ${id}`);
          return collected.sources.get(id);
        },
        transform(code, id) {
          if (!id.endsWith('.js')) return null;
          const compiled = compileReflectiveNames(code, id);
          reflectedNames.push({
            path: relative(root, id).split(sep).join('/'),
            eliminated: compiled.eliminated,
            retained: compiled.retained,
          });
          return { code: compiled.code, map: null };
        },
      },
    ],
    build: {
      write: false,
      target: 'esnext',
      minify: false,
      sourcemap: false,
      copyPublicDir: false,
      lib: { entry: collected.entryFile, formats: ['iife'], name: 'MarkLyraEngine' },
      rollupOptions: {
        treeshake: false,
        output: { strict: false, inlineDynamicImports: true, generatedCode: { symbols: false } },
      },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  if (chunks.length !== 1 || chunks[0].type !== 'chunk')
    throw new Error('Expected one standalone engine script');
  return { ...collected.metadata, code: chunks[0].code, reflectedNames };
}
