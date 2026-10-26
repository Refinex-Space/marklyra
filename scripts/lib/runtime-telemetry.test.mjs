import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { engineModuleRegistrations, expressionOf } from './runtime-test-source.mjs';

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end'].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) visit(child, callback);
    else if (value && typeof value === 'object') visit(value, callback);
  }
}
const modules = [];
for (const node of engineModuleRegistrations()) {
  const factory = node.arguments[3];
  assert.equal(factory?.type, 'FunctionExpression', 'Expected an executable source factory');
  const exportsName = factory.params[1]?.name;
  const names = new Set();
  visit(factory.body, (child) => {
    if (
      child.type === 'AssignmentExpression' &&
      child.left.type === 'MemberExpression' &&
      child.left.object.name === exportsName
    )
      names.add(child.left.property.name);
  });
  if (names.has('Reporter') && names.has('Analytics')) modules.push(node);
}
assert.equal(modules.length, 1, 'Expected one local diagnostics compatibility module');
const module = modules[0];

function instantiate() {
  const actions = [];
  const logs = [];
  let sdk;
  sdk = new Proxy(
    {},
    {
      get: (_target, name) => () => {
        actions.push(`sdk:${String(name)}`);
        return sdk;
      },
    },
  );
  const previousError = () => 'host error handler';
  const context = {
    debugMode: false,
    _options: { buildTime: Date.now() },
    onerror: previousError,
    File: {
      option: { uuid: 'fixture', instance: 'fixture', sendAnonymousUsage: true, devVersion: false },
      showDataLostError: () => logs.push('data-loss-notice'),
    },
    console: {
      debug: () => logs.push('debug'),
      log: () => logs.push('log'),
      warn: () => logs.push('warn'),
      error: () => logs.push('error'),
      sendError: () => logs.push('sendError'),
    },
    $: { getScript: () => actions.push('load-script') },
    fetch: () => {
      actions.push('fetch');
      return Promise.resolve({ status: 200, text: async () => '' });
    },
    navigator: {
      sendBeacon: () => {
        actions.push('beacon');
        return false;
      },
    },
    setTimeout: () => {
      actions.push('timer');
      return 0;
    },
    bridge: { registerHandler: () => actions.push('bridge-handler') },
  };
  context.window = context;
  context.self = context;
  const factory = runInNewContext(expressionOf(module.arguments[3]), context);
  const exports = {};
  factory.call(
    context,
    () => {
      actions.push('load-sdk');
      return sdk;
    },
    exports,
    { exports },
  );
  return { context, exports, actions, logs, previousError };
}

test('diagnostics construction and compatibility calls do not install telemetry or load SDKs', async () => {
  const { context, exports, actions, logs, previousError } = instantiate();
  assert.equal(actions.length, 0, 'Constructors must not load external telemetry integrations');
  exports.Reporter.install();
  exports.Reporter.record('local diagnostic');
  exports.Reporter.error(new Error('synthetic error'));
  exports.Analytics.install();
  exports.Analytics.record('synthetic event', {});
  exports.Analytics.updateContext({});
  exports.Analytics.updateLocation();
  exports.Analytics.flush();
  await exports.Analytics.start();
  await exports.Analytics.loadLib;
  assert.equal(actions.length, 0, 'Compatibility calls must not invoke remote integrations');
  assert.ok(context.onerror === previousError, 'The host error handler must remain installed');
  assert.equal(exports.Reporter.initialized, false);
  assert.equal(logs.filter((value) => value === 'debug').length, 1);
});

test('the integration module contains no remote endpoint configuration or SDK dependency', () => {
  let endpoints = 0;
  visit(module.arguments[3].body, (node) => {
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      /^https?:\/\//i.test(node.value)
    )
      endpoints++;
  });
  assert.equal(
    endpoints,
    0,
    'Remote endpoint configuration must be absent from the integration module',
  );
  assert.equal(
    module.arguments[1].elements.length,
    0,
    'The compatibility module must not load a telemetry SDK',
  );
});

test('local validation and data-loss reporting still use the existing host paths', async () => {
  const { context, exports, logs } = instantiate();
  context.debugMode = true;
  assert.throws(() => exports.Reporter.assert(false), /assert fail/);
  exports.Reporter.buildExtraDebugInfo = async () => ({});
  exports.Reporter.reportLogicError('synthetic validation failure', {});
  await Promise.resolve();
  assert.ok(logs.includes('sendError'));
  assert.ok(logs.includes('data-loss-notice'));
});
