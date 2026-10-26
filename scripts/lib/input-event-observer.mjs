/** Opt-in observer for an isolated input-test artifact. No model, parser,
 * clipboard, storage, host bridge or editor methods are invoked. */
export function installInputEventObserver() {
  if (window.__MARKLYRA_INPUT_OBSERVER__) throw Error('Input observer already installed');
  const records = [],
    capacity = 256;
  let total = 0,
    panel,
    shell,
    next,
    frozen = false,
    chunks = [],
    part = 0,
    disposed = false;
  const started = performance.now();
  const cap = (value) => {
    if (typeof value !== 'string') return null;
    const text = value.slice(0, 120);
    return /[\uD800-\uDBFF]$/u.test(text) ? text.slice(0, -1) : text;
  };
  const point = (node, offset) => {
    if (!node) return null;
    const element = node.nodeType === 1 ? node : node.parentElement;
    return {
      node: node.nodeName,
      offset,
      cid: element?.closest('[cid]')?.getAttribute('cid') ?? null,
    };
  };
  const publish = () => {
    if (!panel) return;
    panel.value = frozen
      ? `MARKLYRA_CHUNK ${part + 1}/${chunks.length}\n${chunks[part]}\nMARKLYRA_CHUNK_END`
      : `Input recording: ${total} events; ${records.filter((row) => row.type.startsWith('composition')).length} composition observations. Freeze after the input finishes to export.`;
    if (next) next.disabled = !frozen || part >= chunks.length - 1;
  };
  const capture = (phase, event, target) => {
    if (disposed || frozen) return;
    const selection = document.getSelection(),
      active = document.activeElement;
    let targetRanges = null;
    if (event instanceof InputEvent && typeof event.getTargetRanges === 'function') {
      try {
        targetRanges = event
          .getTargetRanges()
          .slice(0, 4)
          .map((range) => ({
            anchor: point(range.startContainer, range.startOffset),
            head: point(range.endContainer, range.endOffset),
          }));
      } catch {
        targetRanges = null;
      }
    }
    const row = {
      sequence: ++total,
      ms: performance.now() - started,
      phase,
      type: event.type,
      trusted: event.isTrusted,
      inputType: event instanceof InputEvent ? event.inputType : null,
      dataUTF16Length:
        event instanceof InputEvent || event instanceof CompositionEvent
          ? (event.data?.length ?? 0)
          : null,
      data:
        event instanceof InputEvent || event instanceof CompositionEvent ? cap(event.data) : null,
      composing: 'isComposing' in event ? event.isComposing : null,
      nativeIME: Boolean(window.editor?.isIME),
      targetRanges,
      key: event instanceof KeyboardEvent ? event.key : null,
      code: event instanceof KeyboardEvent ? event.code : null,
      keyCode: event instanceof KeyboardEvent ? event.keyCode : null,
      modifiers:
        event instanceof KeyboardEvent
          ? { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey }
          : null,
      target: {
        tag: target?.tagName ?? null,
        id: target?.id ?? null,
        class: typeof target?.className === 'string' ? target.className : null,
        cid: target?.closest('[cid]')?.getAttribute('cid') ?? null,
        connected: target?.isConnected ?? null,
        editable: target instanceof HTMLElement ? target.isContentEditable : null,
        value:
          target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
            ? cap(target.value)
            : cap(target?.textContent),
      },
      active: {
        tag: active?.tagName ?? null,
        class: typeof active?.className === 'string' ? active.className : null,
      },
      selection: selection
        ? {
            anchor: point(selection.anchorNode, selection.anchorOffset),
            head: point(selection.focusNode, selection.focusOffset),
            collapsed: selection.isCollapsed,
            text: cap(selection.toString()),
          }
        : null,
      textarea:
        target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
          ? {
              anchor: target.selectionStart,
              head: target.selectionEnd,
              direction: target.selectionDirection,
            }
          : null,
    };
    records.push(row);
    if (records.length > capacity) records.shift();
    publish();
  };
  const listener = (event) => {
    const node = event.target instanceof Element ? event.target : document.activeElement;
    if (!node?.closest('#write,#marklyra-source') || node === panel) return;
    capture('capture', event, node);
    queueMicrotask(() => capture('after-dispatch', event, node));
    if (event.type === 'compositionend') {
      setTimeout(() => capture('next-task', event, node), 0);
      setTimeout(() => capture('settled-40ms', event, node), 40);
    }
  };
  const events = [
    'keydown',
    'keyup',
    'beforeinput',
    'input',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'focusin',
    'focusout',
  ];
  for (const type of events) document.addEventListener(type, listener, true);
  const mount = () => {
    if (disposed) return;
    shell = document.createElement('section');
    shell.setAttribute('aria-label', 'Read-only input diagnostics');
    shell.style.cssText =
      'position:fixed;right:4px;bottom:4px;width:300px;z-index:2147483647;font:9px monospace;background:#eee';
    panel = document.createElement('textarea');
    panel.readOnly = true;
    panel.tabIndex = -1;
    panel.spellcheck = false;
    panel.setAttribute('aria-label', 'Input event trace (read only)');
    panel.style.cssText = 'width:100%;height:24px;font:8px monospace';
    const button = (label, action) => {
      const control = document.createElement('button');
      control.type = 'button';
      control.tabIndex = -1;
      control.textContent = label;
      control.addEventListener('click', action);
      return control;
    };
    const freeze = button('Input freeze trace', () => {
      frozen = true;
      // ASCII transport avoids AX truncation and Unicode normalization between
      // chunks. This is JSON escaping, not a change to captured input text.
      const encoded = JSON.stringify({
        schema: 1,
        started,
        total,
        dropped: Math.max(0, total - records.length),
        records,
      }).replace(
        /[^\x20-\x7e]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      );
      chunks = encoded.match(/[\s\S]{1,320}/g) ?? [''];
      part = 0;
      publish();
    });
    next = button('Input next trace chunk', () => {
      if (frozen && part < chunks.length - 1) {
        part++;
        publish();
      }
    });
    const resume = button('Input resume and clear', () => {
      records.length = 0;
      total = 0;
      frozen = false;
      chunks = [];
      part = 0;
      publish();
    });
    shell.append(panel, freeze, next, resume);
    document.body.append(shell);
    publish();
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.__MARKLYRA_INPUT_OBSERVER__ = {
    read: () => ({
      schema: 1,
      started,
      total,
      dropped: Math.max(0, total - records.length),
      records: structuredClone(records),
    }),
    clear: () => {
      records.length = 0;
      total = 0;
      frozen = false;
      chunks = [];
      part = 0;
      publish();
    },
    destroy: () => {
      disposed = true;
      for (const type of events) document.removeEventListener(type, listener, true);
      document.removeEventListener('DOMContentLoaded', mount);
      shell?.remove();
      delete window.__MARKLYRA_INPUT_OBSERVER__;
    },
  };
}
