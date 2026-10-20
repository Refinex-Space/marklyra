import { LogicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { Menu } from '@tauri-apps/api/menu';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { EntryOperation } from '../../services/entry-actions.js';
import type { WorkspaceFileUndo } from '../../services/workspaces.js';
import type { CreationKind } from './creation-types.js';
import { type FileSidebarPlatform, revealLabel } from './file-preferences.js';

export interface EntryMenuTarget {
  relativePath: string;
  kind: 'file' | 'directory';
}
interface Action {
  id: string;
  label: string;
  run?: (() => void) | undefined;
  checked?: boolean;
}
type Item = Action | 'separator';
interface Request {
  x: number;
  y: number;
  items: Item[];
  version: number;
}
interface Options {
  scope: string | undefined;
  native: boolean;
  platform?: FileSidebarPlatform | undefined;
  disabled: boolean;
  busy: boolean;
  view: 'tree' | 'articles';
  create(parent: string, kind: CreationKind): void;
  open(path: string): void;
  search(): void;
  changeView(view: 'tree' | 'articles'): void;
  revealRoot(): void;
  entryAction(target: EntryMenuTarget, action: EntryOperation): void;
  nativeInfo: boolean;
  rename(target: EntryMenuTarget): void;
  trash(target: EntryMenuTarget): void;
  fileUndo(): Promise<WorkspaceFileUndo | null>;
  undo(catalog: WorkspaceFileUndo): void;
  report(reason: unknown): void;
}
/** Drops leading, trailing and doubled separators left by conditionally omitted groups. */
function tidy(items: Item[]): Item[] {
  const result: Item[] = [];
  for (const item of items) {
    if (item === 'separator' && (result.length === 0 || result.at(-1) === 'separator')) continue;
    result.push(item);
  }
  if (result.at(-1) === 'separator') result.pop();
  return result;
}
function itemsFor(
  target: EntryMenuTarget,
  options: Options,
  undo: WorkspaceFileUndo | null,
): Item[] {
  const windows = options.platform === 'windows';
  const root = target.kind === 'directory' && target.relativePath === '';
  const folder = target.kind === 'directory';
  const article = options.view === 'articles';
  const parent = folder
    ? target.relativePath
    : target.relativePath.slice(0, Math.max(0, target.relativePath.lastIndexOf('/')));
  const items: Item[] = [];
  if (!folder)
    items.push({ id: 'open', label: '打开', run: () => options.open(target.relativePath) });
  if (!root) {
    items.push(
      {
        id: 'open-new',
        label: '在新窗口中打开',
        run: () => options.entryAction(target, 'open-new'),
      },
      'separator',
    );
    if (undo)
      items.push(
        { id: 'file-undo', label: `撤销 ${undo.description}`, run: () => options.undo(undo) },
        'separator',
      );
  }
  items.push({
    id: 'create-file',
    label: '新建文件',
    run: () => options.create(article ? '' : parent, 'file'),
  });
  // A folder can be created inside a folder (or the root); a document is not a place for one.
  if (!article && folder)
    items.push({
      id: 'create-directory',
      label: '新建文件夹',
      run: () => options.create(parent, 'directory'),
    });
  if (root && undo)
    items.push('separator', {
      id: 'file-undo',
      label: `撤销 ${undo.description}`,
      run: () => options.undo(undo),
    });
  items.push(
    'separator',
    { id: 'search', label: '搜索', run: options.search },
    'separator',
    {
      id: 'articles',
      label: '文档列表',
      checked: article,
      run: () => options.changeView('articles'),
    },
    { id: 'tree', label: '文件树', checked: !article, run: () => options.changeView('tree') },
  );
  if (!root) {
    items.push('separator');
    if (article)
      items.push(
        {
          id: 'info',
          label: windows ? '属性…' : '显示简介…',
          run: options.nativeInfo ? () => options.entryAction(target, 'info') : undefined,
        },
        { id: 'rename', label: '重命名…', run: () => options.rename(target) },
        {
          id: 'duplicate',
          label: windows ? '创建副本' : '制作副本',
          run: () => options.entryAction(target, 'duplicate'),
        },
      );
    else {
      if (!folder)
        items.push({
          id: 'duplicate',
          label: windows ? '创建副本' : '制作副本',
          run: () => options.entryAction(target, 'duplicate'),
        });
      items.push(
        { id: 'rename', label: '重命名…', run: () => options.rename(target) },
        'separator',
        {
          id: 'info',
          label: windows ? '属性…' : '显示简介…',
          run: options.nativeInfo ? () => options.entryAction(target, 'info') : undefined,
        },
      );
    }
    items.push({ id: 'trash', label: '删除…', run: () => options.trash(target) });
  }
  items.push(
    'separator',
    { id: 'copy-path', label: '复制文件路径', run: () => options.entryAction(target, 'copy-path') },
    {
      id: 'reveal',
      label: revealLabel(options.platform),
      run: root ? options.revealRoot : () => options.entryAction(target, 'reveal'),
    },
  );
  return tidy(items);
}
/** Real native context menu where available; the browser uses the same action model. */
export function useWorkspaceEntryMenu(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const version = useRef(0),
    mounted = useRef(true),
    nativeMenu = useRef<Menu | null>(null);
  const queryPending = useRef<number | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const closeNative = useCallback(async () => {
    const menu = nativeMenu.current;
    nativeMenu.current = null;
    if (menu) await menu.close().catch(() => {});
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      version.current++;
      void closeNative();
    };
  }, [closeNative]);
  useLayoutEffect(() => {
    const cancelQuery = () => {
      if (queryPending.current !== null) {
        version.current++;
        queryPending.current = null;
      }
    };
    document.addEventListener('pointerdown', cancelQuery, true);
    document.addEventListener('keydown', cancelQuery, true);
    window.addEventListener('blur', cancelQuery);
    return () => {
      document.removeEventListener('pointerdown', cancelQuery, true);
      document.removeEventListener('keydown', cancelQuery, true);
      window.removeEventListener('blur', cancelQuery);
    };
  }, []);
  useLayoutEffect(() => {
    if (!options.scope) return;
    let live = true;
    const stop = listen('workspace-file-undo-changed', () => {
      if (live) {
        version.current++;
        queryPending.current = null;
        setRequest(null);
        void closeNative();
      }
    });
    return () => {
      live = false;
      void stop.then((dispose) => dispose()).catch(() => {});
    };
  }, [options.scope, closeNative]);
  const observedScope = useRef(options.scope);
  useLayoutEffect(() => {
    if (observedScope.current === options.scope) return;
    observedScope.current = options.scope;
    version.current++;
    setRequest(null);
    void closeNative();
  }, [options.scope, closeNative]);
  const show = async (target: EntryMenuTarget, x: number, y: number) => {
    const original = latest.current;
    if (original.disabled || !original.scope) return;
    const ticket = ++version.current,
      scope = original.scope;
    const valid = () =>
      mounted.current &&
      version.current === ticket &&
      latest.current.scope === scope &&
      !latest.current.disabled &&
      !latest.current.busy &&
      latest.current.view === original.view;
    queryPending.current = ticket;
    let undo: WorkspaceFileUndo | null = null;
    try {
      undo = await original.fileUndo();
    } catch (reason) {
      if (valid()) original.report(`读取文件操作撤销状态失败：${String(reason)}`);
    }
    if (!valid()) return;
    const items = itemsFor(target, original, undo).map((item) =>
      item === 'separator'
        ? item
        : {
            ...item,
            run:
              item.run && !original.busy
                ? () => {
                    if (valid()) {
                      version.current++;
                      setRequest(null);
                      item.run?.();
                    }
                  }
                : undefined,
          },
    );
    setRequest(null);
    await closeNative();
    if (!valid()) return;
    if (original.native) {
      try {
        const menu = await Menu.new({
          items: items.map((item) =>
            item === 'separator'
              ? { item: 'Separator' as const }
              : {
                  id: item.id,
                  text: item.label,
                  enabled: !!item.run,
                  ...(item.checked === undefined ? {} : { checked: item.checked }),
                  action: () => item.run?.(),
                },
          ),
        });
        if (!valid()) {
          await menu.close();
          return;
        }
        nativeMenu.current = menu;
        queryPending.current = null;
        await menu.popup(new LogicalPosition(x, y));
        return;
      } catch {
        // Browser IPC doubles do not create native resources. Keep a real,
        // testable menu rather than reporting an unimplemented action success.
        await closeNative();
      }
    }
    if (valid()) {
      queryPending.current = null;
      setRequest({ x, y, items, version: ticket });
    }
  };
  const dismiss = useCallback(() => setRequest(null), []);
  return { show, request, dismiss };
}
export function WorkspaceEntryMenu({
  request,
  dismiss,
}: {
  request: Request | null;
  dismiss(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!request) return;
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    const blur = () => dismiss();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('blur', blur);
    };
  }, [request, dismiss]);
  if (!request) return null;
  return (
    <div
      className="workspace-entry-menu sidebar-popup-menu"
      ref={root}
      role="menu"
      aria-label="文件操作"
      style={{
        left: Math.max(0, Math.min(request.x, window.innerWidth - 224)),
        top: Math.max(0, Math.min(request.y, window.innerHeight - 450)),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ],
          index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        (event.key === 'Home'
          ? buttons[0]
          : event.key === 'End'
            ? buttons.at(-1)
            : buttons[(index + (event.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length]
        )?.focus();
      }}
    >
      {request.items.map((item, index) =>
        item === 'separator' ? (
          <hr
            key={`before-${request.items.slice(index + 1).find((next) => next !== 'separator')?.id}`}
          />
        ) : (
          <button
            type="button"
            key={item.id}
            {...(item.checked === undefined
              ? { role: 'menuitem' as const }
              : { role: 'menuitemradio' as const, 'aria-checked': item.checked })}
            disabled={!item.run}
            onClick={() => {
              dismiss();
              item.run?.();
            }}
          >
            {item.checked !== undefined && (
              <span className="workspace-menu-check" aria-hidden="true">
                {item.checked ? '✓' : ''}
              </span>
            )}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
