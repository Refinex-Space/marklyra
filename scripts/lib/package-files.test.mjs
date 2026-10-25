import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBytes, inspectPath } from './package-files.mjs';

test('authored package files and their embedded source maps need no source registration', () => {
  for (const path of [
    'dist/engine.js',
    'src/new-module.ts',
    'assets/new.css',
    'runtime-assets/current.js',
    'recovered/owned.js',
  ])
    inspectPath(path);
  const map = {
    version: 3,
    sources: ['engine.ts'],
    sourcesContent: ['arbitrary current repository source'],
  };
  inspectBytes('engine.js', Buffer.from('export const changed = true;'));
  inspectBytes('engine.js.map', Buffer.from(JSON.stringify(map)));
  inspectBytes(
    'engine.js.map',
    Buffer.from(JSON.stringify({ sections: [{ offset: { line: 0, column: 0 }, map }] })),
  );
  inspectBytes(
    'engine.js',
    Buffer.from(
      '//# source' +
        'MappingURL=data:application/json;base64,' +
        Buffer.from(JSON.stringify(map)).toString('base64'),
    ),
  );
});

test('archive paths still reject traversal, credentials and private/generated directories', () => {
  for (const path of [
    '../file',
    '/absolute',
    'C:\\private\\file',
    'a//file',
    'x/.env.local',
    'private/file',
    'artifacts/trace',
    'node_modules/package',
    'target/build',
    'App.app/main',
    'dist/app.exe',
  ])
    assert.throws(() => inspectPath(path), /Forbidden package path/);
});

test('flat, indexed and inline source maps do not expose private filesystem paths', () => {
  for (const source of [
    '../../PRIVATE/main.js',
    'C:\\Users\\own\\engine.ts',
    'file:///Users/own/engine.ts',
  ]) {
    const map = { version: 3, sources: [source] };
    for (const object of [map, { sections: [{ offset: { line: 0, column: 0 }, map }] }])
      assert.throws(
        () => inspectBytes('engine.js.map', Buffer.from(JSON.stringify(object))),
        /Forbidden source map/,
      );
    assert.throws(
      () =>
        inspectBytes(
          'engine.js',
          Buffer.from(
            '//# source' +
              'MappingURL=data:application/json;base64,' +
              Buffer.from(JSON.stringify(map)).toString('base64'),
          ),
        ),
      /Forbidden source map/,
    );
  }
  assert.throws(
    () =>
      inspectBytes(
        'engine.js.map',
        Buffer.from(JSON.stringify({ sections: [{ url: 'https://example.invalid/map' }] })),
      ),
    /External indexed source map/,
  );
});

test('malformed source map diagnostics do not print embedded source content', () => {
  assert.throws(
    () => inspectBytes('broken.js.map', Buffer.from('{synthetic private content')),
    (error) => error.message === 'Invalid source map JSON: broken.js.map',
  );
});
