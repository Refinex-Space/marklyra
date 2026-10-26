// JSON-only transport for the Tauri public invoke_system hook.
// Tauri substitutes the invoke-key placeholder; native key/ACL checks stay intact.
(() => {
  const location = window.location;
  const allowedOrigin =
    (location.protocol === 'tauri:' && location.host === 'localhost') ||
    (location.protocol === 'http:' && location.host === 'tauri.localhost') ||
    (__MARKLYRA_DEV__ && location.protocol === 'http:' && location.host === '127.0.0.1:1420');

  if (window.top !== window || !allowedOrigin) {
    Object.defineProperty(window.__TAURI_INTERNALS__, 'postMessage', {
      value() {
        throw new Error('Native IPC is available only to the main application frame');
      },
    });
    return;
  }

  // The key is initialized only for the trusted top-level shell. It is neither
  // a global property nor a literal inside an exported function's source.
  const invokeKey = __INVOKE_KEY__;
  const stringify = JSON.stringify.bind(JSON);
  const nativePostMessage = window.ipc.postMessage.bind(window.ipc);

  function assertJson(value, ancestors = new Set()) {
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object') throw new TypeError('Native IPC supports JSON values only');
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      throw new TypeError('Binary IPC is not supported by the runtime-runtime host transport');
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Native IPC supports plain JSON objects only; channels and binary values need an adapter');
    }
    if (ancestors.has(value)) throw new TypeError('Cyclic IPC payload');
    ancestors.add(value);
    for (const entry of Object.values(value)) assertJson(entry, ancestors);
    ancestors.delete(value);
  }

  Object.defineProperty(window.__TAURI_INTERNALS__, 'postMessage', {
    value(message) {
      if (!message || typeof message.cmd !== 'string' || !Number.isSafeInteger(message.callback) || !Number.isSafeInteger(message.error)) {
        throw new TypeError('Invalid native IPC envelope');
      }
      assertJson(message.payload);
      assertJson(message.options);
      nativePostMessage(stringify({
        cmd: message.cmd,
        callback: message.callback,
        error: message.error,
        payload: message.payload === undefined ? {} : message.payload,
        // Native postMessage responses must use callback evaluation, not the
        // optional fetch-based channel shortcut (especially on Windows).
        options: { ...message.options, customProtocolIpcBlocked: true },
        __TAURI_INVOKE_KEY__: invokeKey,
      }));
    },
  });
})();
