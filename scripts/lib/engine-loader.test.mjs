import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { buildEngine } from '../../packages/editor-runtime/scripts/build-engine.mjs';

const baseline = await readFile(
  new URL('../test-fixtures/engine-loader-baseline.txt', import.meta.url),
  'utf8',
);
const current = (await buildEngine({ entry: 'module-loader.js' })).code;

function run(source, definitions, options = {}) {
  const trace = [];
  let result;
  const context = {
    trace,
    ...options,
    define(_dependencies, initialize) {
      result = initialize();
    },
  };
  context.define.amd = true;
  const old = source === baseline;
  const body = old
    ? definitions
        .replaceAll('engineModules.define', '$__System.registerDynamic')
        .replaceAll('engineModules.declare', '$__System.register')
        .replaceAll('engineModules.namespace', '$__System.newModule')
        .replaceAll('engineModules.registry', '$__System.registry')
    : definitions;
  const script = old
    ? source.replace("['a']", "['entry']").replace('__MARKLYRA_ENGINE_MODULES__', body)
    : `${source}\nMarkLyraEngine.createEngineLoader(globalThis)(['entry'], [], true,
      function(engineModules) { ${body} }
    )(function(initialize) { define([], initialize); });`;
  runInNewContext(script, context);
  return { trace: JSON.parse(JSON.stringify(trace)), result, context };
}

function compare(definitions, inspect = ({ trace }) => trace, options) {
  const before = inspect(run(baseline, definitions, options));
  const after = inspect(run(current, definitions, options));
  assert.deepEqual(after, before);
  return after;
}

test('lazy factories preserve execution order, host this, partial cyclic exports and single initialization', () => {
  const definitions = `
    engineModules.define('entry', ['first', 'second'], true, function (require, exports, module) {
      trace.push(['entry', this === globalThis, module.id]);
      exports.phase = 'starting';
      exports.first = require('first');
      exports.second = require('second');
      exports.phase = 'ready';
      trace.push(['cached', require('first') === exports.first, require('unknown')]);
    });
    engineModules.define('first', ['entry', 'second'], true, function (require, exports) {
      trace.push(['first', require('entry').phase]);
      exports.second = require('second');
    });
    engineModules.define('second', [], true, function (require, exports) {
      trace.push(['second']); exports.value = 12;
    });
  `;
  const trace = compare(definitions);
  assert.deepEqual(trace, [
    ['entry', true, 'entry'],
    ['first', 'starting'],
    ['second'],
    ['cached', true, null],
  ]);
});

test('eager dependencies and returned exports retain precedence over module.exports', () => {
  const definitions = `
    engineModules.define('entry', ['eager', 'returned'], false, function (require, exports, module) {
      trace.push(['entry', require('eager'), require('returned')]);
      module.exports = { replaced: true };
    });
    engineModules.define('eager', [], true, function (require, exports, module) {
      trace.push(['eager']); module.exports = 0;
    });
    engineModules.define('returned', [], true, function (require, exports, module) {
      trace.push(['returned']); module.exports = 'replaced'; return 'returned';
    });
  `;
  compare(definitions, ({ trace, result }) => ({ trace, result: JSON.stringify(result) }));
});

test('namespace interop keeps live property getters, enumeration and frozen declaration receiver', () => {
  const definitions = `
    engineModules.declare('declared', [], function (publish) {
      var version = 1;
      return {
        setters: [],
        execute: function () {
          trace.push(['receiver', Object.isFrozen(this)]);
          publish({ version: version, update: function () { publish('version', ++version); } });
        }
      };
    });
    engineModules.define('entry', ['declared'], true, function (require, exports) {
      var namespace = require('declared');
      trace.push([Object.prototype.toString.call(namespace), Object.keys(namespace), namespace.version]);
      namespace.update();
      trace.push([namespace.version, Object.getOwnPropertyDescriptor(namespace, 'version').enumerable]);
      return namespace;
    });
  `;
  compare(definitions);
  compare(definitions, ({ trace }) => trace, { Symbol: undefined });
});

test('preinstalled namespace identity and named CommonJS exports survive adaptation', () => {
  compare(`
    engineModules.registry.set('external', engineModules.namespace({ answer: 42 }));
    engineModules.define('entry', ['external', 'interop'], true, function (require) {
      var external = require('external');
      var interop = require('interop');
      trace.push([external.answer, interop.value, interop.__esModule]);
    });
    engineModules.define('interop', [], true, function (require, exports) {
      exports.__esModule = true; exports.value = 7;
    });
  `);
});

test('fourteen-module dependency cycles retain the same observable initialization trace', () => {
  for (let length = 2; length <= 14; length++) {
    let definitions = `engineModules.define('entry', ['node0'], true, function (require) { require('node0'); });`;
    for (let index = 0; index < length; index++) {
      const name = `node${index}`;
      const next = `node${(index + 1) % length}`;
      definitions += `engineModules.define('${name}', ['${next}'], true, function (require, exports) {
        trace.push(['begin', '${name}']); exports.phase = 'partial';
        trace.push(['dependency', '${name}', require('${next}').phase]);
        exports.phase = 'complete'; trace.push(['end', '${name}']);
      });`;
    }
    compare(definitions);
  }
});

const globalBaseline = await readFile(
  new URL('../test-fixtures/engine-global-helpers-baseline.txt', import.meta.url),
  'utf8',
);
const globalCurrent =
  (await buildEngine({ entry: 'modules/shared/global-helpers.js' })).code +
  '\nMarkLyraEngine.call(globalThis, engineModules, {});';

function runGlobalCapture(source) {
  let helper;
  const originalDefine = function define() {};
  const originalInjected = { original: true };
  const context = { define: originalDefine, injected: originalInjected };
  const modules = {
    registry: {
      set(_name, namespace) {
        helper = namespace;
      },
    },
    namespace: (values) => values,
    newModule: (values) => values,
  };
  context.$__System = modules;
  context.engineModules = modules;
  context.self = context;
  Object.defineProperty(context, 'unreadable', {
    enumerable: true,
    get() {
      throw new Error('host property is not readable');
    },
  });
  runInNewContext(source, context);
  const collect = helper.prepareGlobal('vendor/example', null, { injected: 7 });
  const during = [context.define === undefined, context.injected];
  const exported = { newExport: true };
  context.libraryExport = exported;
  const result = collect();
  const restored = [
    context.define === originalDefine,
    context.injected === originalInjected,
    result === exported,
  ];
  context.library = { first: { value: 1 }, second: { value: 2 } };
  const select = helper.prepareGlobal('vendor/example', 'library.first', null);
  const selected = select();
  return { during, restored, selected: JSON.stringify(selected) };
}

test('vendor global capture preserves export identity, AMD restoration and unreadable-global handling', () => {
  assert.deepEqual(runGlobalCapture(globalCurrent), runGlobalCapture(globalBaseline));
});
