import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse as parseJavaScript } from 'acorn';
import { collectRuntimeInputs } from './lib/runtime-resources.mjs';

// Discover current assets and validate their executable/data syntax.
const require = createRequire(import.meta.resolve('vite'));
const { parse: parseCSS } = require('postcss');
const root = resolve(import.meta.dirname, '..');
const inputs = await collectRuntimeInputs(root);
const counts = { javascript: 0, css: 0, json: 0, htmlScripts: 0 };
for (const { path } of inputs) {
  if (!/\.(js|css|json|html)$/.test(path)) continue;
  const source = await readFile(resolve(root, path), 'utf8');
  if (path.endsWith('.js')) {
    parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'script' });
    counts.javascript++;
  } else if (path.endsWith('.css')) {
    parseCSS(source, { from: path });
    counts.css++;
  } else if (path.endsWith('.json')) {
    JSON.parse(source);
    counts.json++;
  } else {
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const type = /\btype=["']([^"']+)["']/i.exec(match[1])?.[1];
      if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
      parseJavaScript(match[2], {
        ecmaVersion: 'latest',
        sourceType: type === 'module' ? 'module' : 'script',
      });
      counts.htmlScripts++;
    }
  }
}
console.log(`Native input syntax passed: ${JSON.stringify(counts)}.`);
