export function installInputCostRecorder(options = {}) {
  const state = {
    enabled: false,
    phase: 'startup',
    stats: {},
    nodes: {},
    spans: [],
    stack: [],
  };
  window.__cost = state;
  state.measure = (label, fn, receiver, args, detail) => {
    if (!state.enabled) return Reflect.apply(fn, receiver, args);
    const start = performance.now();
    const parent = state.stack.at(-1);
    state.stack.push(label);
    try {
      return Reflect.apply(fn, receiver, args);
    } finally {
      state.stack.pop();
      const duration = performance.now() - start;
      const key = `${state.phase} | ${label}`;
      state.stats[key] ??= {
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        parents: {},
        examples: [],
      };
      const item = state.stats[key];
      item.calls++;
      item.totalMs += duration;
      item.maxMs = Math.max(item.maxMs, duration);
      if (parent) item.parents[parent] = (item.parents[parent] ?? 0) + 1;
      if (item.examples.length < 2 || (duration > 30 && item.examples.length < 6))
        item.examples.push({
          start,
          duration,
          detail,
          stack: new Error().stack?.split('\n').slice(2, 8).join('\n'),
        });
      if (duration > 10 && state.spans.length < 500)
        state.spans.push({ phase: state.phase, label, start, duration, parent });
    }
  };
  state.wrap = (object, name, label = name, detail) => {
    if (!object || typeof object[name] !== 'function') return;
    const original = object[name];
    object[name] = function (...args) {
      return state.measure(label, original, this, args, detail);
    };
  };
  state.installNodeCounter = (prototype) => {
    const capability = Reflect.get(window, '__MARKLYRA_NATIVE_SERIALIZATION__');
    const status = () => ({
      present: Boolean(capability),
      frozen: Boolean(capability && Object.isFrozen(capability)),
      nodeMethodMatches: Boolean(
        capability && capability.nodePrototype?.toMark === capability.nodeToMark,
      ),
      mapMethodMatches: Boolean(
        capability && capability.mapPrototype?.toMark === capability.mapToMark,
      ),
      arrayMatches: Boolean(capability && capability.array === Array),
    });
    const before = status();
    if (capability && options.nodeCounterPolicy !== 'legacy-invalidating-control') {
      state.serializerBinding = {
        before,
        after: status(),
        nodeCounter: 'not-observed-preserve-native-binding',
      };
      return;
    }
    const original = prototype.toMark;
    prototype.toMark = function (...args) {
      if (state.enabled) state.nodes[state.phase] = (state.nodes[state.phase] ?? 0) + 1;
      return Reflect.apply(original, this, args);
    };
    state.serializerBinding = {
      before,
      after: status(),
      nodeCounter: capability
        ? 'legacy-control-invalidates-native-binding'
        : 'legacy-runtime-without-native-capability',
    };
  };
  const add = EventTarget.prototype.addEventListener,
    remove = EventTarget.prototype.removeEventListener;
  const listeners = new WeakMap();
  let serial = 0;
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (
      !['beforeinput', 'input', 'paste', 'keydown'].includes(type) ||
      typeof callback !== 'function'
    )
      return add.call(this, type, callback, options);
    const key = type + ':' + Boolean(typeof options === 'boolean' ? options : options?.capture);
    let target = listeners.get(this);
    if (!target) {
      target = new Map();
      listeners.set(this, target);
    }
    let callbacks = target.get(key);
    if (!callbacks) {
      callbacks = new WeakMap();
      target.set(key, callbacks);
    }
    let wrapped = callbacks.get(callback);
    if (!wrapped) {
      const label = `listener:${key}:${++serial}:${this === window ? 'window' : this === document ? 'document' : this.nodeName}`;
      const detail = new Error().stack?.split('\n').slice(2, 7).join('\n');
      wrapped = function (...args) {
        return state.measure(label, callback, this, args, detail);
      };
      callbacks.set(callback, wrapped);
    }
    return add.call(this, type, wrapped, options);
  };
  EventTarget.prototype.removeEventListener = function (type, callback, options) {
    const key = type + ':' + Boolean(typeof options === 'boolean' ? options : options?.capture);
    return remove.call(
      this,
      type,
      listeners.get(this)?.get(key)?.get(callback) ?? callback,
      options,
    );
  };
  const timeout = window.setTimeout;
  window.setTimeout = function (callback, delay, ...args) {
    if (!state.enabled || typeof callback !== 'function')
      return timeout.call(this, callback, delay, ...args);
    const detail = new Error().stack?.split('\n').slice(2, 7).join('\n');
    return timeout.call(
      this,
      function (...values) {
        return state.measure(`timer:${delay}`, callback, this, values, detail);
      },
      delay,
      ...args,
    );
  };
}
