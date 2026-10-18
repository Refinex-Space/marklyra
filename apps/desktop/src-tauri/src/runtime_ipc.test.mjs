// VM tests validate the transport's JS capability boundary, not native key
// enforcement or WebView2 injection behavior. No actual app key is used here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const source = readFileSync(new URL('./runtime_ipc.js', import.meta.url), 'utf8');
const fixtureKey = 'synthetic-unit-test-key';

function context({ protocol = 'tauri:', host = 'localhost', child = false, debug = false } = {}) {
  const sent = [];
  const sandbox = createContext({ sent });
  runInContext(`
    window = globalThis;
    window.top = ${child ? '{}' : 'window'};
    window.location = ${JSON.stringify({ protocol, host })};
    window.__TAURI_INTERNALS__ = {};
    window.ipc = {postMessage(message){ sent.push(message); }};
  `, sandbox);
  runInContext(source.replaceAll('__MARKLYRA_DEV__', String(debug)).replaceAll('__INVOKE_KEY__', JSON.stringify(fixtureKey)), sandbox);
  return { sandbox, sent };
}

for (const options of [{}, { protocol: 'http:', host: 'tauri.localhost' }, { protocol: 'http:', host: '127.0.0.1:1420', debug: true }]) {
  const { sandbox, sent } = context(options);
  for (const [cmd, payload] of [
    ['open_document', {}], ['save_document', { id: 'doc', text: '中文\r\n🙂' }],
    ['plugin:event|listen', { event: 'menu-action', target: { kind: 'Any' }, handler: 3 }],
    ['plugin:window|set_title', { label: 'main', title: '笔记' }],
    ['plugin:clipboard-manager|write_text', { text: 'clipboard fixture' }],
  ]) {
    runInContext(`window.__TAURI_INTERNALS__.postMessage(${JSON.stringify({ cmd, payload, callback: 1, error: 2 })})`, sandbox);
    const message = JSON.parse(sent.at(-1));
    assert.equal(message.__TAURI_INVOKE_KEY__, fixtureKey);
    assert.deepEqual(message.payload, payload);
    assert.equal(message.cmd, cmd);
    assert.equal(message.options.customProtocolIpcBlocked, true);
  }
  const callableSource = runInContext('window.__TAURI_INTERNALS__.postMessage.toString()', sandbox);
  assert.equal(callableSource.includes(fixtureKey), false);
  assert.equal(runInContext('Object.values(window).includes("synthetic-unit-test-key")', sandbox), false);
  for (const payload of ['new Uint8Array([1])', 'new ArrayBuffer(1)', 'new Date()', 'new Map()', '1n', 'NaN']) {
    const before = sent.length;
    assert.throws(() => runInContext(`window.__TAURI_INTERNALS__.postMessage({cmd:'bad', callback:1, error:2, payload:${payload}})`, sandbox));
    assert.equal(sent.length, before);
  }
  assert.throws(() => runInContext('const cyclic={};cyclic.self=cyclic;window.__TAURI_INTERNALS__.postMessage({cmd:"bad",callback:1,error:2,payload:cyclic})', sandbox));
}

for (const options of [
  { child: true }, { child: true, protocol: 'http:', host: 'tauri.localhost' },
  { protocol: 'marklyra:', host: 'localhost' }, { protocol: 'http:', host: 'marklyra.localhost' },
  { protocol: 'http:', host: '127.0.0.1:1420' }, { protocol: 'http:', host: '127.0.0.1:4174', debug: true },
  { protocol: 'https:', host: 'tauri.localhost' }, { protocol: 'http:', host: 'tauri.localhost.evil' },
]) {
  const { sandbox, sent } = context(options);
  assert.throws(() => runInContext('window.__TAURI_INTERNALS__.postMessage({cmd:"open_document",callback:1,error:2,payload:{},isTop:true,origin:"tauri://localhost"})', sandbox));
  assert.equal(sent.length, 0);
  assert.equal(runInContext('window.__TAURI_INTERNALS__.postMessage.toString()', sandbox).includes(fixtureKey), false);
  assert.equal(runInContext('typeof invokeKey', sandbox), 'undefined');
  assert.throws(() => runInContext('Object.defineProperty(window.__TAURI_INTERNALS__, "postMessage", {value(){}})', sandbox));
  // Raw messages remain possible at the WebView native bridge, but our transport
  // has not handed the frame a key. Native rejection requires an actual host test.
  runInContext('window.ipc.postMessage(JSON.stringify({cmd:"open_document",callback:1,error:2,payload:{}}))', sandbox);
  assert.equal(JSON.parse(sent[0]).__TAURI_INVOKE_KEY__, undefined);
}
console.log('JSON transport: trusted origins, child denial, key concealment, events/window/text clipboard envelope, binary/cycle rejection passed.');
