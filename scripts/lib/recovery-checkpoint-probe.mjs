import { parse } from 'acorn';

/** Diagnostic-only bootstrap. Never imported by the product or SDK. A dedicated
 * build/profile may withhold exactly one recovery checkpoint dispatch/receipt. */
export function installRecoveryCheckpointProbe(target, phase) {
  if (!['before-dispatch', 'after-commit'].includes(phase)) throw Error('Unknown probe phase');
  const internals = target.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') throw Error('Native IPC unavailable');
  if (target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__) throw Error('Probe already installed');
  const key = `checkpoint-probe-v1:${phase}`;
  let claimed = false;
  let status = `Checkpoint: armed ${phase}`;
  const render = () => {
    let label = target.document.getElementById('checkpoint-probe');
    if (!label && target.document.body) {
      label = target.document.createElement('output');
      label.id = 'checkpoint-probe';
      label.setAttribute('role', 'status');
      label.style.cssText =
        'position:fixed;bottom:30px;left:12px;z-index:2147483647;background:#fff6cc;color:#222;padding:6px;pointer-events:none;font:12px system-ui';
      target.document.body.append(label);
    }
    if (label) label.textContent = status;
  };
  const held = (checkpoint) => {
    // No source text, native lease, document path or user clipboard is recorded.
    try {
      target.localStorage.setItem(key, phase);
    } catch {
      status = 'Checkpoint: marker failed; passthrough';
      render();
      return;
    }
    status = `Checkpoint: held ${phase} (${checkpoint.text.length} UTF-16)`;
    render();
    return new Promise(() => {});
  };
  const invoke = (checkpoint, send) => {
    if (typeof send !== 'function') throw Error('Checkpoint dispatch required');
    if (
      claimed ||
      typeof checkpoint?.text !== 'string' ||
      typeof checkpoint.savedText !== 'string' ||
      checkpoint.text === checkpoint.savedText
    )
      return send();
    try {
      if (target.localStorage.getItem(key)) return send();
      // Verify marker storage before withholding any protection. A full/broken
      // WebView store must not make this diagnostic drop the real checkpoint.
      target.localStorage.setItem(key, 'armed');
      target.localStorage.removeItem(key);
    } catch {
      status = 'Checkpoint: storage unavailable; passthrough';
      render();
      return send();
    }
    claimed = true;
    if (phase === 'before-dispatch') return held(checkpoint) ?? send();
    return send().then(
      (receipt) => held(checkpoint) ?? receipt,
      (error) => {
        claimed = false;
        throw error;
      },
    );
  };
  target.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__ = Object.freeze({ invoke });
  if (target.document.body) render();
  else target.document.addEventListener('DOMContentLoaded', render, { once: true });
}

export function instrumentRecoveryIndex(html, phase) {
  if (!['before-dispatch', 'after-commit'].includes(phase)) throw Error('Unknown probe phase');
  if (html.includes('checkpoint-probe') || (html.match(/<head>/gu) ?? []).length !== 1)
    throw Error('Expected an uninstrumented single head');
  return {
    html: html.replace('<head>', '<head><script src="/checkpoint-probe.js"></script>'),
    script: `(${installRecoveryCheckpointProbe.toString()})(window,${JSON.stringify(phase)});\n`,
  };
}

/** Exactly one authored compiled service call; never replace Tauri's protected
 * invoke property or add a general IPC/eval capability to the product. */
export function instrumentRecoveryModule(code) {
  if (code.includes('__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__'))
    throw Error('Module already instrumented');
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const calls = [],
    queue = [ast];
  while (queue.length) {
    const node = queue.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'CallExpression' && node.arguments[0]?.value === 'checkpoint_recovery')
      calls.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value);
      else if (value && typeof value === 'object') queue.push(value);
    }
  }
  if (calls.length !== 1) throw Error('Expected exactly one checkpoint call');
  const call = calls[0],
    object = call.arguments[1],
    property = object?.properties?.[0];
  if (
    call.callee.type !== 'Identifier' ||
    call.arguments.length !== 2 ||
    object?.type !== 'ObjectExpression' ||
    object.properties.length !== 1 ||
    property?.type !== 'Property' ||
    property.key?.name !== 'checkpoint' ||
    property.value?.type !== 'Identifier' ||
    property.computed ||
    property.method
  )
    throw Error('Unexpected checkpoint call shape');
  const replacement = `window.__MARKLYRA_RECOVERY_CHECKPOINT_PROBE__.invoke(${property.value.name},()=>${code.slice(call.start, call.end)})`;
  return code.slice(0, call.start) + replacement + code.slice(call.end);
}
