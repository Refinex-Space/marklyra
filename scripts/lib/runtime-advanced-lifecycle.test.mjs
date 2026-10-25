import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import {
  engineAST,
  engineModule,
  expressionOf,
  hasHook,
  member,
  nodes,
  sourceOf,
  unique,
} from './runtime-test-source.mjs';

const enter = unique(
  nodes(
    engineAST,
    (node) =>
      node.type === 'ConditionalExpression' && hasHook(node.test, '__MARKLYRA_HTML_CALLBACK__'),
  ),
  'HTML Enter callback',
);
const message = unique(
  nodes(
    engineAST,
    (node) => node.type === 'IfStatement' && hasHook(node.test, '__MARKLYRA_HTML_MESSAGE__'),
  ),
  'HTML message ownership guard',
);

test('the real HTML Enter callback retains its fallback and allows the host to suppress it', () => {
  const calls = [];
  const editorBinding = unique(
    nodes(enter.alternate, (node) => member(node, 'UserOp')),
    'HTML callback editor',
  ).object.name;
  const context = {
    [editorBinding]: { UserOp: { insertParagraph: (...args) => calls.push(args) } },
  };
  runInNewContext(expressionOf(enter), context)();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], []);
  calls.length = 0;
  runInNewContext(expressionOf(enter), {
    ...context,
    __MARKLYRA_HTML_CALLBACK__: () => () => undefined,
  })();
  assert.equal(calls.length, 0);
});

test('the real HTML message guard rejects an unowned event before continuing', () => {
  const expression = `(function(){${sourceOf(message)}return 'accepted';})`;
  const eventArgument = unique(
    nodes(
      message.test,
      (node) => node.type === 'CallExpression' && member(node.callee, '__MARKLYRA_HTML_MESSAGE__'),
    ),
    'HTML message ownership callback',
  ).arguments[0];
  assert.equal(eventArgument.type, 'Identifier');
  const event = { marker: 'same event' };
  assert.equal(runInNewContext(expression, { [eventArgument.name]: event })(), 'accepted');
  for (const accepted of [true, false]) {
    let calls = 0;
    const callback = runInNewContext(expression, {
      [eventArgument.name]: event,
      __MARKLYRA_HTML_MESSAGE__: (value) => {
        assert.equal(value, event);
        calls++;
        return accepted;
      },
    });
    assert.equal(callback(), accepted ? 'accepted' : undefined);
    assert.equal(calls, 1);
  }
});

for (const [id, methodName] of [
  ['1c', 'updateDiagram'],
  ['1c', 'startEditing'],
  ['15', 'updateDiagram'],
]) {
  const method = unique(
    nodes(
      engineModule(id),
      (node) => node.type === 'MethodDefinition' && node.key.name === methodName,
    ),
    `${id}.${methodName}`,
  );
  const ticket = unique(
    nodes(
      method,
      (node) => node.type === 'VariableDeclarator' && node.id.name === '__marklyraRenderTicket',
    ),
    `${id}.${methodName} ticket`,
  );
  const guards = nodes(
    method,
    (node) =>
      node.type === 'IfStatement' &&
      node.test.type === 'LogicalExpression' &&
      node.test.left.name === '__marklyraRenderTicket' &&
      node.test.right.type === 'UnaryExpression' &&
      member(node.test.right.argument?.callee, 'current'),
  );
  const identifiers = ticket.init.consequent.arguments.map((argument) => {
    assert.equal(argument.type, 'Identifier');
    return argument.name;
  });
  test(`${id}.${methodName} captures one exact render owner and checks success and failure continuations`, () => {
    assert.equal(guards.length, 2);
    assert.ok(guards.every((guard) => guard.start > ticket.end));
    const preview = {},
      cm = {},
      owner = { current: () => true };
    const context = { [identifiers[0]]: preview, [identifiers[1]]: cm };
    assert.equal(runInNewContext(expressionOf(ticket.init), context), null);
    let calls = 0;
    assert.equal(
      runInNewContext(expressionOf(ticket.init), {
        ...context,
        __MARKLYRA_RENDER_TICKET__: (...args) => {
          assert.equal(args.length, 2);
          assert.equal(args[0], preview);
          assert.equal(args[1], cm);
          calls++;
          return owner;
        },
      }),
      owner,
    );
    assert.equal(calls, 1);
    for (const guard of guards) {
      const expression = `(function(){${sourceOf(guard)}return 'continued';})`;
      assert.equal(runInNewContext(expression, { __marklyraRenderTicket: null })(), 'continued');
      assert.equal(runInNewContext(expression, { __marklyraRenderTicket: owner })(), 'continued');
      assert.equal(
        runInNewContext(expression, { __marklyraRenderTicket: { current: () => false } })(),
        undefined,
      );
    }
  });
}

const page = await readFile(
  new URL('../../packages/editor-runtime/src/page/index.html', import.meta.url),
  'utf8',
);
const preview = unique(
  [
    ...page.matchAll(
      /<script\b[^>]*\bid=["']md-html-iframe-preload-temp["'][^>]*>([\s\S]*?)<\/script>/gu,
    ),
  ],
  'HTML preview template',
)[1];

test('the embedded HTML preview sends all four message kinds to its immediate editor parent', () => {
  const calls = nodes(
    parse(preview, { ecmaVersion: 'latest' }),
    (node) => node.type === 'CallExpression' && member(node.callee, 'postMessage'),
  );
  assert.equal(calls.length, 4);
  assert.ok(calls.every((node) => node.callee.object.name === 'parent'));
  const sent = [],
    handlers = {};
  const document = {
    body: { parentElement: { offsetHeight: 42 } },
    readyState: 'interactive',
    addEventListener: (name, callback) => {
      handlers[name] = callback;
    },
  };
  runInNewContext(`${preview};iframePreloadScript('owned-preview');`, {
    document,
    window: { addEventListener() {} },
    parent: {
      postMessage: (message, target) => {
        assert.equal(target, '*');
        sent.push(message);
      },
    },
    top: {
      postMessage: () => {
        throw Error('Preview escaped to the application host');
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout() {},
    clearTimeout() {},
    requestAnimationFrame() {},
  });
  document.onreadystatechange();
  handlers.mousedown({ target: { tagName: 'P' }, ctrlKey: true, preventDefault() {} });
  handlers.contextmenu({ clientX: 3, clientY: 4 });
  assert.deepEqual(
    sent.map((message) => message.msg),
    ['changeHeight', 'mousedown', 'startEditing', 'contextmenu'],
  );
  assert.ok(sent.every((message) => message.cid === 'owned-preview'));
  assert.equal(sent[0].height, 42);
  assert.equal(sent[3].event.clientX, 3);
  assert.equal(sent[3].event.clientY, 4);
});
