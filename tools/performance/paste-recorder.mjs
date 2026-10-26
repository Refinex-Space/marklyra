/** Diagnostic scheduling ledger. All native delays, arguments and receivers are preserved. */
export function installPasteRecorder({ origin }) {
  if (location.origin !== origin) return;
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClear = window.clearTimeout.bind(window);
  let brushOwner, brushMethod, brushUnavailable;
  let brushCallId = 0;
  const state = {
    phase: 'startup',
    phaseAt: performance.now(),
    active: undefined,
    timers: [],
    pending: new Map(),
    calls: [],
    events: [],
    dropped: 0,
    lastActivity: new Map(),
    lastInputAt: undefined,
    schedulingBackground: undefined,
    brushCalls: [],
    brushInFlight: new Map(),
    brushErrors: [],
    lastBrushWorkAt: undefined,
  };
  window.__pasteBench = state;
  const push = (list, value) => {
    if (list.length < 32768) list.push(value);
    else state.dropped++;
  };
  state.phaseTo = (phase) => {
    state.phase = phase;
    state.phaseAt = performance.now();
  };
  window.setTimeout = (callback, delay, ...args) => {
    if (typeof callback !== 'function') return nativeTimeout(callback, delay, ...args);
    const cause = state.active?.cause ?? state.phase;
    const record = {
      cause,
      scheduledPhase: state.phase,
      delay: Number(delay) || 0,
      name: callback.name,
      scheduledAt: performance.now(),
      status: 'pending',
      background: state.schedulingBackground,
    };
    const id = nativeTimeout(
      function (...values) {
        state.pending.delete(id);
        const prior = state.active;
        state.active = record;
        record.runPhase = state.phase;
        record.startedAt = performance.now();
        let threw = true;
        try {
          const result = Reflect.apply(callback, this, values);
          threw = false;
          return result;
        } finally {
          record.dispatchEndedAt = performance.now();
          record.endedAt = record.dispatchEndedAt;
          // A native timer does not await the callback's returned Promise.
          // Promise completion is recorded separately for the owned brush work.
          record.status = threw ? 'dispatch-threw' : 'dispatch-completed';
          if (!record.background) state.lastActivity.set(cause, record.endedAt);
          state.active = prior;
        }
      },
      delay,
      ...args,
    );
    record.id = id;
    state.pending.set(id, record);
    push(state.timers, record);
    return id;
  };
  window.clearTimeout = (id) => {
    const record = state.pending.get(id);
    if (record) {
      record.status = 'cancelled';
      record.endedAt = performance.now();
      state.pending.delete(id);
    }
    return nativeClear(id);
  };
  for (const type of ['keydown', 'beforeinput', 'input', 'paste', 'scroll'])
    document.addEventListener(
      type,
      (event) => {
        const at = performance.now();
        if (type === 'input') state.lastInputAt = at;
        push(state.events, {
          type,
          at,
          phase: state.phase,
          trusted: event.isTrusted,
          inputType: event.inputType,
          composing: event.isComposing,
        });
      },
      true,
    );
  state.wrap = (object, method, label) => {
    if (typeof object?.[method] !== 'function') return;
    const original = object[method];
    object[method] = function (...args) {
      const call = {
        label,
        phase: state.phase,
        cause: state.active?.cause ?? state.phase,
        timerId: state.active?.id,
        timerDelay: state.active?.delay,
        startedAt: performance.now(),
      };
      try {
        return Reflect.apply(original, this, args);
      } finally {
        call.endedAt = performance.now();
        call.durationMs = call.endedAt - call.startedAt;
        push(state.calls, call);
      }
    };
  };
  state.installMethods = () => {
    const brush = window.editor.brush;
    // This is an identified perpetual native queue, not an input-scroll timer.
    // Exclude only the timer owned by Brush.scheduleNext from drain termination;
    // retain every execution and duration in the ledger and measured window.
    if (
      brush &&
      Array.isArray(brush.queue) &&
      typeof brush.brushQueue === 'function' &&
      typeof brush.scheduleNext === 'function'
    ) {
      brushOwner = brush;
      const originalBrush = brush.brushQueue;
      brushMethod = brush.brushQueue = function (...args) {
        const call = {
          id: ++brushCallId,
          phase: state.phase,
          cause: state.active?.cause ?? state.phase,
          timerId: state.active?.id,
          queueAtStart: Array.isArray(this.queue) ? this.queue.length : null,
          startedAt: performance.now(),
          status: 'dispatching',
        };
        push(state.brushCalls, call);
        const settled = (status, error) => {
          call.asyncSettledAt = performance.now();
          call.status = status;
          state.brushInFlight.delete(call.id);
          if (call.queueAtStart > 0) state.lastBrushWorkAt = call.asyncSettledAt;
          if (status === 'rejected') {
            call.error = String(error);
            push(state.brushErrors, { id: call.id, message: call.error });
          }
        };
        try {
          const result = Reflect.apply(originalBrush, this, args);
          call.dispatchEndedAt = performance.now();
          if (result instanceof Promise) {
            call.status = 'async-pending';
            state.brushInFlight.set(call.id, call);
            // Return the exact Promise. Native callers still await it
            // and propagate its rejection. The observer also makes any rejection
            // fail drain, including callers that otherwise ignore the Promise.
            Promise.prototype.then.call(
              result,
              () => settled('completed'),
              (error) => settled('rejected', error),
            );
          } else {
            call.status = 'dispatch-completed';
            if (call.queueAtStart > 0) state.lastBrushWorkAt = call.dispatchEndedAt;
          }
          return result;
        } catch (error) {
          call.dispatchEndedAt = performance.now();
          call.status = 'dispatch-threw';
          call.error = String(error);
          push(state.brushErrors, { id: call.id, message: call.error });
          throw error;
        }
      };
      const existing = state.pending.get(brush.timerID);
      if (existing) existing.background = 'native-brush-scheduleNext';
      const schedule = brush.scheduleNext;
      brush.scheduleNext = function (...args) {
        const prior = state.schedulingBackground;
        state.schedulingBackground = 'native-brush-scheduleNext';
        try {
          return Reflect.apply(schedule, this, args);
        } finally {
          state.schedulingBackground = prior;
        }
      };
    } else brushUnavailable = 'Missing brushQueue/scheduleNext or unknown queue type';
    for (const [object, method, label] of [
      [window.editor.selection, 'scrollAdjust', 'selection.scrollAdjust'],
      [window.editor, 'getMarkdown', 'editor.getMarkdown'],
      [window.File, 'sync', 'File.sync'],
    ])
      state.wrap(object, method, label);
    state.checkBindings = () => {
      const capability = window.__MARKLYRA_NATIVE_SERIALIZATION__;
      return capability
        ? {
            node: capability.nodePrototype.toMark === capability.nodeToMark,
            map: capability.mapPrototype.toMark === capability.mapToMark,
          }
        : null;
    };
  };
  const brushState = () => {
    const available =
      !brushUnavailable &&
      brushOwner &&
      window.editor?.brush === brushOwner &&
      brushOwner.brushQueue === brushMethod &&
      Array.isArray(brushOwner.queue);
    return {
      available: Boolean(available),
      unavailable: available
        ? undefined
        : (brushUnavailable ?? 'Brush owner, method or queue changed'),
      queueLength: available ? brushOwner.queue.length : null,
      inFlight: [...state.brushInFlight.values()],
      calls: state.brushCalls,
      errors: state.brushErrors,
      lastWorkAt: state.lastBrushWorkAt,
    };
  };
  state.drain = ({ causes = [], allCauses = false, anchor, minimumMs, quietMs, maximumMs }) =>
    new Promise((resolve, reject) => {
      const begin = performance.now();
      const check = () => {
        const now = performance.now();
        const brush = brushState();
        if (!brush.available)
          return reject(new Error(`Native brush unavailable: ${brush.unavailable}`));
        if (brush.errors.length)
          return reject(new Error(`Native brush failed: ${JSON.stringify(brush.errors)}`));
        const pending = [...state.pending.values()].filter(
          (entry) => (allCauses || causes.includes(entry.cause)) && !entry.background,
        );
        const last = Math.max(
          anchor,
          brush.lastWorkAt ?? anchor,
          ...(allCauses
            ? state.lastActivity.values()
            : causes.map((cause) => state.lastActivity.get(cause) ?? anchor)),
        );
        if (
          now - anchor >= minimumMs &&
          !pending.length &&
          !brush.queueLength &&
          !brush.inFlight.length &&
          now - last >= quietMs
        )
          return resolve({
            from: begin,
            to: now,
            anchor,
            allCauses,
            elapsedMs: now - begin,
            pending: [],
            brush: { queueLength: brush.queueLength, inFlight: [], lastWorkAt: brush.lastWorkAt },
            excludedBackground: [...state.pending.values()]
              .filter((entry) => entry.background)
              .map(({ id, cause, delay, name, background }) => ({
                id,
                cause,
                delay,
                name,
                background,
              })),
          });
        if (now - begin > maximumMs)
          return reject(
            new Error(
              `Delayed work did not drain: ${JSON.stringify({ timers: pending.map(({ cause, delay, name }) => ({ cause, delay, name })), brush: { queueLength: brush.queueLength, inFlight: brush.inFlight.map(({ id }) => id) } })}`,
            ),
          );
        nativeTimeout(check, 25);
      };
      check();
    });
  state.snapshot = () => ({
    phase: state.phase,
    binding: state.checkBindings?.(),
    dropped: state.dropped,
    timers: state.timers,
    pending: [...state.pending.values()],
    calls: state.calls,
    events: state.events,
    paste: state.paste,
    brush: brushState(),
  });
}
