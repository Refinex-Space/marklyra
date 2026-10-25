import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse as parseJavaScript } from 'acorn';

// Native engine/vendor inputs keep their established representation. Validate their
// executable/data syntax separately from the authored TypeScript/React lint surface.
const require = createRequire(import.meta.resolve('vite'));
const { parse: parseCSS } = require('postcss');
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'config/runtime-source.json'), 'utf8'));
const counts = { javascript: 0, css: 0, json: 0, htmlScripts: 0 };
for (const { path } of manifest.resources) {
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
