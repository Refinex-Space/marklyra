import {
  type ClipboardAdapter,
  type ContextMenuAdapter,
  type ContextMenuItem,
  clipboardContent,
  contextMenuRequest,
  MAX_CLIPBOARD_CHARS,
} from './contracts.js';

/** Standard DOM adapter. It owns no editor state or filesystem authority. */
export function browserContextMenu(owner: Document): ContextMenuAdapter {
  return {
    show(raw, onSelect, signal) {
      if (signal.aborted) return;
      const request = contextMenuRequest(raw);
      const view = owner.defaultView;
      if (!view) throw new Error('Menu document has no window');
      const previous = owner.activeElement;
      const layer = owner.createElement('div');
      layer.className = 'marklyra-context-menu-layer';
      layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      const lifecycle = new AbortController();
      const panels: HTMLElement[] = [];
      let finished = false;
      const remove = () => {
        finished = true;
        lifecycle.abort();
        layer.remove();
        signal.removeEventListener('abort', remove);
      };
      const finish = (action: Parameters<typeof onSelect>[0], restore = false) => {
        if (finished) return;
        finished = true;
        remove();
        if (restore && previous instanceof view.HTMLElement && previous.isConnected)
          previous.focus();
        onSelect(action);
      };
      const buttons = (panel: HTMLElement) => [
        ...panel.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)'),
      ];
      const closeAfter = (depth: number) => {
        while (panels.length > depth + 1) panels.pop()?.remove();
        for (const button of panels[depth]?.querySelectorAll('[aria-expanded]') ?? [])
          button.setAttribute('aria-expanded', 'false');
      };
      const panel = (
        items: ContextMenuItem[],
        x: number,
        y: number,
        depth: number,
        parent?: HTMLButtonElement,
      ) => {
        const menu = owner.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', parent?.textContent ?? '编辑菜单');
        menu.style.cssText =
          'position:absolute;pointer-events:auto;min-width:190px;max-width:340px;max-height:calc(100vh - 16px);overflow:auto;padding:5px;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:7px;box-shadow:0 5px 24px #0003;font:13px system-ui;';
        panels.push(menu);
        for (const item of items) {
          if (item.type === 'separator') {
            const separator = owner.createElement('div');
            separator.setAttribute('role', 'separator');
            separator.style.cssText = 'height:1px;background:GrayText;opacity:.25;margin:4px 5px;';
            menu.append(separator);
            continue;
          }
          const button = owner.createElement('button');
          button.type = 'button';
          button.setAttribute('role', 'menuitem');
          button.textContent = item.label;
          button.style.cssText =
            'display:block;width:100%;border:0;border-radius:3px;padding:5px 12px;text-align:left;font:inherit;white-space:nowrap;background:transparent;color:inherit;';
          button.disabled = item.type === 'item' && !item.enabled;
          if (button.disabled) button.style.opacity = '.45';
          const open = () => {
            closeAfter(depth);
            if (item.type !== 'submenu') return;
            button.setAttribute('aria-expanded', 'true');
            const rect = button.getBoundingClientRect();
            panel(item.items, rect.right + 4, rect.top - 5, depth + 1, button);
          };
          if (item.type === 'submenu') {
            button.textContent += '  ›';
            button.setAttribute('aria-haspopup', 'menu');
            button.setAttribute('aria-expanded', 'false');
          }
          button.addEventListener('focus', () => {
            button.style.background = 'Highlight';
            button.style.color = 'HighlightText';
          });
          button.addEventListener('blur', () => {
            button.style.background = 'transparent';
            button.style.color = 'inherit';
          });
          button.addEventListener('pointerenter', () => {
            if (button.disabled) return;
            button.focus();
            open();
          });
          button.addEventListener('click', () => {
            if (item.type === 'item') finish(item.actionId);
            else {
              open();
              buttons(panels[depth + 1] as HTMLElement)[0]?.focus();
            }
          });
          button.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowRight' && item.type === 'submenu') {
              event.preventDefault();
              open();
              buttons(panels[depth + 1] as HTMLElement)[0]?.focus();
            }
          });
          menu.append(button);
        }
        menu.addEventListener('keydown', (event) => {
          const list = buttons(menu),
            index = list.indexOf(owner.activeElement as HTMLButtonElement);
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            closeAfter(depth);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? list.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
            list[next]?.focus();
          } else if (event.key === 'ArrowLeft' && parent) {
            event.preventDefault();
            closeAfter(depth - 1);
            parent.focus();
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            finish(null, true);
          }
        });
        layer.append(menu);
        const width = menu.offsetWidth,
          height = menu.offsetHeight;
        const left =
          depth > 0 && x + width > view.innerWidth - 8 && parent
            ? parent.getBoundingClientRect().left - width - 8
            : x;
        menu.style.left = `${Math.max(8, Math.min(left, view.innerWidth - width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, view.innerHeight - height - 8))}px`;
        return menu;
      };
      signal.addEventListener('abort', remove, { once: true });
      owner.body.append(layer);
      const main = panel(request.items, request.point.x, request.point.y, 0);
      buttons(main)[0]?.focus();
      owner.addEventListener(
        'pointerdown',
        (event) => {
          if (!(event.target instanceof view.Node) || !layer.contains(event.target)) finish(null);
        },
        { capture: true, signal: lifecycle.signal },
      );
      view.addEventListener('blur', () => finish(null), { signal: lifecycle.signal });
    },
  };
}

/** Permissions and user activation are owned by the browser; failures propagate. */
export function browserClipboard(owner: Document): ClipboardAdapter {
  const view = owner.defaultView;
  const clipboard = view?.navigator.clipboard;
  const available = () => {
    if (!clipboard) throw new Error('此浏览器未提供系统剪贴板权限');
    return clipboard;
  };
  return {
    async read(signal) {
      signal.throwIfAborted();
      const api = available();
      if (!api.read) return clipboardContent({ text: await api.readText() });
      const values = await api.read();
      signal.throwIfAborted();
      const first = values.find(
        (item) => item.types.includes('text/plain') || item.types.includes('text/html'),
      );
      const read = async (type: string) => {
        if (!first?.types.includes(type)) return undefined;
        const blob = await first.getType(type);
        if (blob.size > MAX_CLIPBOARD_CHARS) throw new Error('Clipboard content is too large');
        return blob.text();
      };
      const [text, html] = await Promise.all([read('text/plain'), read('text/html')]);
      signal.throwIfAborted();
      return clipboardContent({ text: text ?? '', ...(html === undefined ? {} : { html }) });
    },
    async write(raw, signal) {
      signal.throwIfAborted();
      const data = clipboardContent(raw),
        api = available();
      if (data.html !== undefined) {
        if (!view?.ClipboardItem || !api.write) throw new Error('此浏览器不支持 HTML 剪贴板写入');
        await api.write([
          new view.ClipboardItem({
            'text/plain': new Blob([data.text], { type: 'text/plain' }),
            'text/html': new Blob([data.html], { type: 'text/html' }),
          }),
        ]);
      } else await api.writeText(data.text);
      signal.throwIfAborted();
    },
  };
}
