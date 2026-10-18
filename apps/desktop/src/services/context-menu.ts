import type {
  ContextAction,
  ContextMenuRequest,
  MarkLyraHostAdapter,
} from '@marklyra/editor-runtime';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopAvailable } from './documents.js';
import { imageBytes } from './images.js';
import { importNativeInput, nativeInputAvailable } from './native-input.js';

function offered(request: ContextMenuRequest, actionId: ContextAction): boolean {
  const contains = (items: ContextMenuRequest['items']): boolean =>
    items.some((item) =>
      item.type === 'submenu'
        ? contains(item.items)
        : item.type === 'item' && item.enabled && item.actionId === actionId,
    );
  return contains(request.items);
}
/** Tauri authority remains in the shell; the runtime iframe receives no IPC key. */
export const desktopContextHost: Pick<
  MarkLyraHostAdapter,
  'contextMenu' | 'clipboard' | 'openExternal'
> = desktopAvailable
  ? {
      contextMenu: {
        async show(request, onSelect, signal) {
          signal.throwIfAborted();
          const window = getCurrentWindow();
          let consumed = false;
          const stop = await window.listen<{ requestId: string; actionId: ContextAction }>(
            'editor-context-menu-action',
            ({ payload }) => {
              if (
                consumed ||
                signal.aborted ||
                payload.requestId !== request.requestId ||
                !offered(request, payload.actionId)
              )
                return;
              consumed = true;
              onSelect(payload.actionId);
            },
          );
          const close = () => {
            stop();
            void invoke('close_editor_context_menu', { requestId: request.requestId }).catch(
              () => {},
            );
          };
          if (signal.aborted) {
            close();
            return;
          }
          signal.addEventListener('abort', close, { once: true });
          try {
            await invoke('show_editor_context_menu', { request });
          } catch (error) {
            signal.removeEventListener('abort', close);
            close();
            throw error;
          }
          // Tauri's popup return is not an action or reliable cancellation event.
          // A queued MenuEvent may arrive afterwards. The signal owns registration.
        },
      },
      clipboard: {
        readOnPaste: true,
        async read(signal) {
          signal.throwIfAborted();
          if (nativeInputAvailable()) {
            const result = await invoke<
              | { kind: 'empty' }
              | { kind: 'content'; content: { text: string; html?: string; markHtml?: string } }
              | { kind: 'images' | 'files'; ticket: string }
            >('native_input_clipboard');
            signal.throwIfAborted();
            if (result.kind === 'content') return result.content;
            if (result.kind === 'empty') return { text: '' };
            return {
              text: '',
              nativeImages: {
                id: result.ticket,
                import: importNativeInput(result.ticket, 'paste'),
              },
            };
          }
          const image = await invoke<{ name: string; type: string; base64: string } | null>(
            'clipboard_read_image',
          );
          signal.throwIfAborted();
          if (image)
            return {
              text: '',
              image: { name: image.name, type: image.type, bytes: imageBytes(image.base64) },
            };
          const result = await invoke<{ text: string; html?: string; markHtml?: string }>(
            'clipboard_read',
          );
          signal.throwIfAborted();
          return {
            text: result.text,
            ...(result.html === undefined ? {} : { html: result.html }),
            ...(result.markHtml === undefined ? {} : { markHtml: result.markHtml }),
          };
        },
        async write(data, signal) {
          signal.throwIfAborted();
          await invoke('clipboard_write', { data });
          signal.throwIfAborted();
        },
      },
      async openExternal(url, signal) {
        signal.throwIfAborted();
        await invoke('open_external_link', { url });
        signal.throwIfAborted();
      },
    }
  : {};
