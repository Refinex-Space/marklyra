import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { preparePreferencesRuntime } from './lib/prepare-preferences-runtime.mjs';
import { brandHtmlTitle, brandLocale } from './lib/runtime-branding.mjs';
import { transformRuntimeContextCursor } from './lib/runtime-context-cursor.mjs';
import { transformRuntimeFocus } from './lib/runtime-focus.mjs';
import { transformRuntimeHTMLLifecycle } from './lib/runtime-html-lifecycle.mjs';
import { transformRuntimeHTMLPreview } from './lib/runtime-html-preview.mjs';
import { transformRuntimeLiteral } from './lib/runtime-literal.mjs';
import { transformRuntimePairing } from './lib/runtime-pairing.mjs';
import { transformRuntimeRenderLifecycle } from './lib/runtime-render-lifecycle.mjs';
import { transformRuntimeSerialization } from './lib/runtime-serialization.mjs';
import { transformRuntimeTableColumns } from './lib/runtime-table-columns.mjs';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, 'private/vendor/TypeMark');
const output = resolve(root, 'private/runtime-assets');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(resolve(root, 'config/runtime-source.json'), 'utf8'));
const expected = new Map(
  manifest
    .filter((entry) => entry.path.startsWith('Contents/Resources/TypeMark/'))
    .map((entry) => [entry.path.replace('Contents/Resources/TypeMark/', ''), entry.sha256]),
);
const actual = [];
const transformations = [];
async function copy(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = resolve(directory, entry.name),
      path = relative(input, source).replaceAll('\\', '/');
    if (path === 'lib/bin' || path === 'Docs' || path === 'page-dist') continue;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected runtime symlink: ${path}`);
    if (entry.isDirectory()) {
      await copy(source);
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(source);
    if (expected.get(path) !== digest(bytes)) throw new Error(`Runtime input changed: ${path}`);
    const target = resolve(output, path);
    await mkdir(dirname(target), { recursive: true });
    if (path === 'index.html') {
      const boot = `<script>(function(){var errors=[];window.addEventListener('error',function(e){var t=e.target;errors.push(e.message||(t&&t.src?'Resource failed: '+t.src:'Runtime resource failed'));parent.postMessage({protocol:'marklyra/editor/v1',channel:new URL(location.href).searchParams.get('channel'),kind:'runtime-error',payload:errors.slice(0,5).join(' | ')},'*')},true)})();</script>`;
      const original = bytes.toString('utf8');
      const dispatch = /webkit\.messageHandlers\["_bridge"\]\.postMessage/g;
      if ([...original.matchAll(dispatch)].length !== 1)
        throw new Error('Unexpected runtime page bridge: expected one native dispatch');
      const html = original
        .replace(dispatch, 'window.__MARKLYRA_BRIDGE__.postMessage')
        .replace('<head>', `<head>\n${boot}<script src="./frame-host.js"></script>`);
      const preview = transformRuntimeHTMLPreview(original, html);
      await writeFile(target, brandHtmlTitle(preview.code));
      transformations.push({ path, htmlPreview: preview.metadata });
    } else if (path === 'appsrc/main.js') {
      const transformed = transformRuntimeSerialization(bytes.toString('utf8'));
      const paired = transformRuntimePairing(bytes.toString('utf8'), transformed.code);
      const focused = transformRuntimeFocus(bytes.toString('utf8'), paired.code);
      const contextCursor = transformRuntimeContextCursor(bytes.toString('utf8'), focused.code);
      const literal = transformRuntimeLiteral(bytes.toString('utf8'), contextCursor.code);
      const tableColumns = transformRuntimeTableColumns(bytes.toString('utf8'), literal.code);
      const htmlLifecycle = transformRuntimeHTMLLifecycle(
        bytes.toString('utf8'),
        tableColumns.code,
      );
      const renderLifecycle = transformRuntimeRenderLifecycle(
        bytes.toString('utf8'),
        htmlLifecycle.code,
      );
      await writeFile(target, renderLifecycle.code);
      transformations.push({
        path,
        ...transformed.metadata,
        pairing: paired.metadata,
        focus: focused.metadata,
        contextCursor: contextCursor.metadata,
        literal: literal.metadata,
        tableColumns: tableColumns.metadata,
        htmlLifecycle: htmlLifecycle.metadata,
        renderLifecycle: renderLifecycle.metadata,
      });
    } else if (path.startsWith('locales/') && path.endsWith('.json')) {
      const branded = brandLocale(bytes.toString('utf8'));
      await writeFile(target, branded.code);
      if (branded.changes) transformations.push({ path, displayBranding: branded.changes });
    } else await copyFile(source, target);
    actual.push({
      path,
      originalSha256: digest(bytes),
      runtimeSha256: digest(await readFile(target)),
    });
  }
}
await mkdir(output, { recursive: true });
await copy(input);
await copyFile(
  resolve(root, 'packages/editor-runtime/dist/frame-host.js'),
  resolve(output, 'frame-host.js'),
);
await writeFile(resolve(output, 'empty.css'), '/* No user CSS has been configured. */\n');
const preferences = await preparePreferencesRuntime({
  inputDirectory: input,
  outputDirectory: resolve(output, 'preferences'),
});
await writeFile(
  resolve(output, 'runtime-manifest.json'),
  JSON.stringify(
    {
      sourceVersion: 'Typora 1.11.7 (7472)',
      kind: 'private-editor-runtime',
      adapterSha256: digest(await readFile(resolve(output, 'frame-host.js'))),
      transformations,
      preferences,
      resources: actual,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Prepared ${actual.length} verified private resources for local MarkLyra builds; no source upload.`,
);
