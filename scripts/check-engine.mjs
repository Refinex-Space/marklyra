import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { buildEngine } from '../packages/editor-runtime/scripts/build-engine.mjs';
import { verifyFactoryDependencies } from './lib/engine-source-contracts.mjs';
import { inspectRuntimeEngineSources, runtimeEngineEntries } from './lib/runtime-resources.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = 'packages/editor-runtime/src/engine';
const graphs = await inspectRuntimeEngineSources(root);
if (graphs.length !== runtimeEngineEntries.length) throw new Error('Missing engine source entry');
const maintained = new Set(graphs.flatMap((graph) => graph.inputs));
const standalone = new Set([`${directory}/finder-worker.js`]);
let factories = 0;
let scripts = 0;

for (const graph of graphs) {
  await buildEngine({ root, entry: graph.entry });
  for (const descriptor of graph.factories) {
    const path = descriptor.path;
    verifyFactoryDependencies(
      resolve(root, path),
      await readFile(resolve(root, path), 'utf8'),
      descriptor,
    );
    factories++;
  }
}

async function visit(path) {
  for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      await visit(child);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    if (!maintained.has(child) && !standalone.has(child))
      throw new Error(`Unaccounted engine source: ${child}`);
    const text = await readFile(resolve(root, child), 'utf8');
    const ast = parse(text, {
      ecmaVersion: 'latest',
      sourceType: maintained.has(child) ? 'module' : 'script',
    });
    const walk = (node) => {
      if (node.type === 'Identifier' && node.name === '$__System')
        throw new Error(`Compiled module wrapper remains: ${child}`);
      if (
        node.type === 'Identifier' &&
        /^__MARKLYRA_(?:ENGINE_MODULES|EMOJI_SEARCH_MAP)__$/.test(node.name)
      )
        throw new Error(`Source assembly placeholder remains: ${child}`);
      for (const value of Object.values(node))
        for (const nested of Array.isArray(value) ? value : [value])
          if (nested && typeof nested.type === 'string') walk(nested);
    };
    walk(ast);
    scripts++;
  }
}
await visit(directory);
console.log(
  `Engine source contracts passed: ${factories} named factories; ${scripts} JavaScript sources; dependency closure and assembly verified.`,
);
