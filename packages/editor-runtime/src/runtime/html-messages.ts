import type { LegacyGlobals } from './legacy-types.js';

/** Only the currently rendered, same-origin generated srcdoc may control its
 * own HTML block. User iframes and outer SDK protocol messages are unrelated. */
export function validHTMLMessage(
  runtime: LegacyGlobals,
  value: unknown,
  canEdit: () => boolean,
): boolean {
  if (
    !(value instanceof MessageEvent) ||
    !value.isTrusted ||
    !value.data ||
    typeof value.data !== 'object' ||
    Array.isArray(value.data)
  )
    return false;
  const data = value.data as Record<string, unknown>,
    editor = runtime.editor,
    msg = data.msg,
    cid = data.cid;
  if (
    !editor ||
    typeof cid !== 'string' ||
    typeof msg !== 'string' ||
    !['changeHeight', 'startEditing', 'contextmenu', 'mousedown'].includes(msg)
  )
    return false;
  const node = editor.getNode(cid);
  if (!node || node.get('type') !== 'html_block') return false;
  const blocks = [
      ...editor.writingArea.querySelectorAll<HTMLElement>(
        '.md-htmlblock[mdtype="html_block"][cid]',
      ),
    ].filter((block) => block.getAttribute('cid') === cid),
    block = blocks[0];
  if (blocks.length !== 1 || !block || !block.isConnected) return false;
  const frames = [...block.querySelectorAll<HTMLIFrameElement>('iframe.md-html-iframe')].filter(
    (frame) => {
      if (
        !frame.isConnected ||
        frame.closest('[cid]') !== block ||
        frame.contentWindow !== value.source ||
        !frame.hasAttribute('srcdoc') ||
        !frame.sandbox.contains('allow-same-origin') ||
        !frame.sandbox.contains('allow-scripts')
      )
        return false;
      // Reading this live document also rejects a window that navigated off-origin.
      // about:srcdoc Location.origin is "null" even when MessageEvent.origin is inherited.
      try {
        return frame.contentDocument?.URL === 'about:srcdoc';
      } catch {
        return false;
      }
    },
  );
  if (frames.length !== 1) return false;
  if (msg === 'changeHeight')
    return typeof data.height === 'number' && Number.isFinite(data.height) && data.height >= 0;
  if (!canEdit() || runtime.File?.isLocked || editor.isIME || editor.sourceView.inSourceMode)
    return false;
  if (msg === 'contextmenu') {
    const event = data.event;
    return Boolean(
      event &&
        typeof event === 'object' &&
        typeof Reflect.get(event, 'clientX') === 'number' &&
        Number.isFinite(Reflect.get(event, 'clientX')) &&
        typeof Reflect.get(event, 'clientY') === 'number' &&
        Number.isFinite(Reflect.get(event, 'clientY')),
    );
  }
  return true;
}
