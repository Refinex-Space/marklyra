import type { LegacyGlobals } from './legacy-types.js';
import type {
  TableAxis,
  TableControlAction,
  TableControlContext,
} from './table-controls-actions.js';
import { tableControlsStyle } from './table-controls-style.js';

interface TableControlsHost {
  runtime: LegacyGlobals;
  available(): boolean;
  capture(cell: HTMLTableCellElement, axis: TableAxis): TableControlContext | undefined;
  execute(work: () => void): void;
  onError(error: unknown): void;
}

/** Transient UI lives outside #write. Hover never selects a cell or edits authored DOM. */
export class RuntimeTableControls {
  private root: HTMLDivElement | undefined;
  private style: HTMLStyleElement | undefined;
  private cell: HTMLTableCellElement | undefined;
  private context: TableControlContext | undefined;
  private axis: TableAxis | undefined;
  private menu: HTMLDivElement | undefined;
  private submenu: HTMLDivElement | undefined;
  private alignmentTrigger: HTMLButtonElement | undefined;
  private origin: { element: HTMLElement; range: Range | undefined } | undefined;
  private highlight: HTMLDivElement | undefined;
  private handles = new Map<string, HTMLButtonElement>();
  private frame = 0;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly abort = new AbortController();
  private readonly observer = new MutationObserver(() => this.schedule());
  private readonly resize = new ResizeObserver(() => this.schedule());
  constructor(private readonly host: TableControlsHost) {}

  install(): void {
    if (this.root || this.abort.signal.aborted) return;
    const area = this.host.runtime.editor?.writingArea;
    if (!area) return;
    this.style = document.createElement('style');
    this.style.textContent = tableControlsStyle;
    document.head.append(this.style);
    const root = document.createElement('div');
    root.className = 'ml-table-controls';
    root.hidden = true;
    root.setAttribute('contenteditable', 'false');
    this.root = root;
    this.highlight = document.createElement('div');
    this.highlight.className = 'ml-table-highlight';
    this.highlight.hidden = true;
    root.append(this.highlight);
    for (const [id, label, symbol] of [
      ['row', '行操作', '⋮'],
      ['column', '列操作', '⋯'],
      ['add-row', '在表格末尾添加行', '+'],
      ['add-column', '在表格右侧添加列', '+'],
    ]) {
      if (!id || !label || !symbol) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ml-table-handle';
      button.dataset.tableHandle = id;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.textContent = symbol;
      if (id === 'row' || id === 'column') {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
      }
      button.addEventListener('pointerenter', () => {
        this.cancelLeave();
        if (!this.menu) this.paint(id.includes('column') ? 'column' : 'row');
      });
      button.addEventListener('click', (event) => {
        if (id === 'row' || id === 'column') this.open(id, event.detail === 0);
        else this.append(id === 'add-row' ? 'row' : 'column');
      });
      root.append(button);
      this.handles.set(id, button);
    }
    // Keep the existing caret until a specific action is chosen.
    root.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    root.addEventListener('pointerdown', (event) => event.stopPropagation());
    root.addEventListener('keydown', (event) => this.menuKey(event));
    root.addEventListener('click', (event) => event.stopPropagation());
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    document.body.append(root);
    const options = { capture: true, signal: this.abort.signal };
    document.addEventListener('pointermove', (event) => this.hover(event), options);
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!root.contains(event.target as Node)) this.reset();
      },
      options,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (root.contains(event.target as Node)) return;
        if (event.altKey && event.shiftKey && event.code === 'KeyT' && this.available()) {
          const selection = document.getSelection();
          const node = selection?.anchorNode;
          const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
          const cell = element?.closest<HTMLTableCellElement>('td,th');
          if (
            selection?.isCollapsed &&
            cell?.querySelector('[mdtype="table_cell"][cid]') &&
            area.contains(cell)
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.target(cell);
            this.open('row', true);
            return;
          }
        }
        this.reset();
      },
      options,
    );
    for (const type of ['beforeinput', 'input', 'compositionstart', 'paste', 'drop', 'contextmenu'])
      document.addEventListener(type, () => this.reset(), options);
    document.addEventListener(
      'scroll',
      (event) => {
        if (this.submenu?.contains(event.target as Node)) return;
        if (this.menu?.contains(event.target as Node)) {
          this.closeSubmenu();
          return;
        }
        this.closeMenu();
        this.schedule();
      },
      { ...options, passive: true },
    );
    window.addEventListener(
      'resize',
      () => {
        this.closeMenu();
        this.schedule();
      },
      options,
    );
    window.addEventListener(
      'blur',
      (event) => {
        if (event.target === window) this.reset();
      },
      options,
    );
    this.observer.observe(area, { childList: true, subtree: true, characterData: true });
    this.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.resize.observe(area);
  }

  private cancelLeave(): void {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = undefined;
  }

  reset(): void {
    this.cancelLeave();
    this.closeMenu();
    this.cell = undefined;
    if (this.root) this.root.hidden = true;
  }

  destroy(): void {
    this.reset();
    this.abort.abort();
    this.observer.disconnect();
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
    this.root?.remove();
    this.style?.remove();
  }

  private available(): boolean {
    const editor = this.host.runtime.editor;
    return (
      this.host.available() &&
      Boolean(editor) &&
      !editor?.isIME &&
      !editor?.sourceView.inSourceMode &&
      !this.host.runtime.File?.isLocked &&
      !document.body.classList.contains('typora-export')
    );
  }

  private target(cell: HTMLTableCellElement): void {
    if (cell !== this.cell) {
      this.closeMenu();
      this.cell = cell;
    }
    this.layout();
  }

  private hover(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    if (!this.available()) {
      this.reset();
      return;
    }
    const target = event.target instanceof Element ? event.target : undefined;
    if (this.root?.contains(target ?? null)) {
      this.cancelLeave();
      if (this.root) this.root.dataset.input = 'pointer';
      const button = target?.closest('button');
      if (button && this.menu?.contains(button) && button !== this.alignmentTrigger) {
        this.closeSubmenu();
      }
      return;
    }
    if (event.buttons || document.getSelection()?.isCollapsed === false) {
      this.reset();
      return;
    }
    if (this.menu) return;
    const cell = target?.closest<HTMLTableCellElement>('td,th');
    if (
      cell?.querySelector('[mdtype="table_cell"][cid]') &&
      this.host.runtime.editor?.writingArea.contains(cell)
    ) {
      this.cancelLeave();
      this.target(cell);
      if (this.highlight) this.highlight.hidden = true;
    } else if (this.cell) {
      // Keep the whole table rim active, including the empty gap between a cell
      // and its strip. A slow approach must not race a short dismissal timer.
      const bounds = this.cell.closest('table')?.getBoundingClientRect();
      if (
        bounds &&
        event.clientX >= bounds.left - 20 &&
        event.clientX <= bounds.right + 20 &&
        event.clientY >= bounds.top - 24 &&
        event.clientY <= bounds.bottom + 20
      ) {
        this.cancelLeave();
        this.leaveTimer = undefined;
      } else if (!this.leaveTimer) {
        this.leaveTimer = setTimeout(() => this.reset(), 320);
      }
    }
  }

  private schedule(): void {
    if (this.frame || !this.cell) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.layout();
    });
  }

  private layout(): void {
    const cell = this.cell,
      root = this.root;
    const table = cell?.closest('table'),
      row = cell?.closest('tr');
    const owner = cell?.closest('[mdtype="table"][cid]');
    if (
      !cell ||
      !root ||
      !table ||
      !row ||
      !owner ||
      !cell.isConnected ||
      !this.available() ||
      !this.host.runtime.editor?.writingArea.contains(cell) ||
      table.querySelector('[colspan],[rowspan]') ||
      (this.context && !this.context.current())
    ) {
      this.reset();
      return;
    }
    const bounds = table.getBoundingClientRect(),
      rect = cell.getBoundingClientRect();
    const port = document.querySelector('content')?.getBoundingClientRect();
    const top = Math.max(0, port?.top ?? 0),
      bottom = Math.min(innerHeight, port?.bottom ?? innerHeight);
    const left = Math.max(0, port?.left ?? 0),
      right = Math.min(innerWidth, port?.right ?? innerWidth);
    if (rect.bottom <= top || rect.top >= bottom || rect.right <= left || rect.left >= right) {
      this.reset();
      return;
    }
    root.hidden = false;
    const place = (
      id: string,
      x: number,
      y: number,
      width: number,
      height: number,
      show = true,
    ) => {
      const button = this.handles.get(id);
      if (!button) return;
      button.hidden = !show || y < top || y + height > bottom || x < left || x + width > right;
      Object.assign(button.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    };
    const rowWidth = Math.min(8, bounds.left - left - 3);
    place(
      'row',
      bounds.left - rowWidth - 3,
      Math.max(rect.top, top),
      rowWidth,
      Math.min(rect.bottom, bottom) - Math.max(rect.top, top),
      rowWidth >= 6,
    );
    const x = Math.max(rect.left, left),
      width = Math.min(rect.right, right) - x;
    const y = bounds.top - 11;
    place('column', x, y, width, 8, width > 8);
    place(
      'add-row',
      Math.max(bounds.left, left),
      bounds.bottom + 3,
      Math.min(bounds.right, right) - Math.max(bounds.left, left),
      8,
      row.rowIndex === table.rows.length - 1 && !this.menu,
    );
    place(
      'add-column',
      bounds.right + 3,
      Math.max(bounds.top, top),
      8,
      Math.min(bounds.bottom, bottom) - Math.max(bounds.top, top),
      cell.cellIndex === row.cells.length - 1 && !this.menu,
    );
    if (this.axis) this.paint(this.axis);
  }

  private paint(axis: TableAxis): void {
    const cell = this.cell,
      highlight = this.highlight,
      table = cell?.closest('table');
    if (!cell || !highlight || !table) return;
    const row = cell.closest('tr');
    const rect = cell.getBoundingClientRect(),
      bounds = table.getBoundingClientRect();
    const target = axis === 'row' ? row?.getBoundingClientRect() : undefined;
    const port = document.querySelector('content')?.getBoundingClientRect();
    const left = Math.max(port?.left ?? 0, axis === 'row' ? bounds.left : rect.left);
    const top = Math.max(port?.top ?? 0, axis === 'row' ? (target?.top ?? rect.top) : bounds.top);
    const right = Math.min(port?.right ?? innerWidth, axis === 'row' ? bounds.right : rect.right);
    const bottom = Math.min(
      port?.bottom ?? innerHeight,
      axis === 'row' ? (target?.bottom ?? rect.bottom) : bounds.bottom,
    );
    Object.assign(highlight.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    });
    highlight.hidden = false;
  }

  private open(axis: TableAxis, keyboard = false): void {
    const cell = this.cell;
    if (!cell || !this.available()) {
      this.reset();
      return;
    }
    this.cancelLeave();
    const selection = document.getSelection();
    const active = document.activeElement;
    const origin =
      this.origin ??
      (active instanceof HTMLElement && !this.root?.contains(active)
        ? {
            element: active,
            range: selection?.rangeCount === 1 ? selection.getRangeAt(0).cloneRange() : undefined,
          }
        : undefined);
    this.closeMenu();
    const context = this.host.capture(cell, axis);
    if (!context?.items.length) {
      this.reset();
      return;
    }
    this.context = context;
    this.origin = origin;
    this.axis = axis;
    if (this.root) this.root.dataset.input = keyboard ? 'keyboard' : 'pointer';
    const menu = document.createElement('div');
    menu.className = 'ml-table-menu';
    menu.tabIndex = -1;
    const tabs = document.createElement('div');
    tabs.className = 'ml-table-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '表格操作范围');
    for (const tab of ['row', 'column'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tab === 'row' ? '行' : '列';
      button.setAttribute('aria-label', tab === 'row' ? '切换到行操作' : '切换到列操作');
      button.setAttribute('aria-pressed', String(tab === axis));
      button.addEventListener('click', (event) => this.open(tab, event.detail === 0));
      tabs.append(button);
    }
    menu.append(tabs);
    const commands = document.createElement('div');
    commands.setAttribute('role', 'menu');
    commands.setAttribute('aria-label', axis === 'row' ? '表格行操作' : '表格列操作');
    let previous: string | undefined;
    for (const item of context.items) {
      if (previous && previous !== item.group) commands.append(document.createElement('hr'));
      previous = item.group;
      if (item.group === 'alignment') {
        if (!this.alignmentTrigger) {
          const trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'ml-table-submenu-trigger';
          trigger.textContent = '对齐方式';
          trigger.setAttribute('aria-label', '对齐方式');
          trigger.setAttribute('role', 'menuitem');
          trigger.setAttribute('aria-haspopup', 'menu');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.addEventListener('pointerenter', () => this.openAlignment(context));
          trigger.addEventListener('click', (event) =>
            this.openAlignment(context, event.detail === 0),
          );
          this.alignmentTrigger = trigger;
          commands.append(trigger);
        }
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-label', item.label);
      button.textContent = item.label;
      button.disabled = !item.enabled;
      if (item.checked) button.dataset.checked = '';
      if (item.group === 'heading') {
        button.title = item.checked ? '对应内容已经加粗' : '加粗对应内容，不改变 Markdown 表头结构';
      }
      if (item.actionId.includes('delete')) button.dataset.danger = '';
      button.addEventListener('click', () => this.run(context, item.actionId));
      commands.append(button);
    }
    menu.append(commands);
    this.menu = menu;
    this.root?.append(menu);
    this.handles.get(axis)?.setAttribute('aria-expanded', 'true');
    this.layout();
    const anchor = this.handles.get(axis)?.getBoundingClientRect() ?? cell.getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    menu.style.maxHeight = `${Math.max(80, innerHeight - 16)}px`;
    menu.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, innerHeight - Math.min(rect.height, innerHeight - 16) - 8))}px`;
    const focus = keyboard
      ? menu.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')
      : menu;
    focus?.focus({ preventScroll: true });
  }

  private openAlignment(context: TableControlContext, keyboard = false): void {
    const trigger = this.alignmentTrigger,
      parent = this.menu;
    if (!trigger || !parent || this.context !== context || !context.current()) return;
    if (this.root) this.root.dataset.input = keyboard ? 'keyboard' : 'pointer';
    if (!this.submenu) {
      const popup = document.createElement('div');
      popup.className = 'ml-table-menu ml-table-submenu';
      popup.tabIndex = -1;
      popup.setAttribute('role', 'menu');
      popup.setAttribute('aria-label', '对齐方式');
      for (const item of context.items.filter((item) => item.group === 'alignment')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitemradio');
        button.setAttribute('aria-label', item.label);
        button.setAttribute('aria-checked', String(Boolean(item.checked)));
        button.textContent = item.label;
        button.disabled = !item.enabled;
        if (item.checked) button.dataset.checked = '';
        button.addEventListener('click', () => {
          if (this.submenu === popup) this.run(context, item.actionId);
        });
        popup.append(button);
      }
      this.submenu = popup;
      this.root?.append(popup);
      trigger.setAttribute('aria-expanded', 'true');
      const box = popup.getBoundingClientRect(),
        anchor = trigger.getBoundingClientRect(),
        edge = parent.getBoundingClientRect();
      const right = edge.right + 2 + box.width <= innerWidth - 8;
      popup.dataset.side = right ? 'right' : 'left';
      popup.style.maxHeight = `${Math.max(0, innerHeight - 16)}px`;
      popup.style.left = `${Math.max(8, right ? edge.right + 2 : edge.left - box.width - 2)}px`;
      popup.style.top = `${Math.max(8, Math.min(anchor.top - 4, innerHeight - box.height - 8))}px`;
    }
    const focus = keyboard
      ? (this.submenu.querySelector<HTMLButtonElement>('[aria-checked=true]:not(:disabled)') ??
        this.submenu.querySelector<HTMLButtonElement>('button:not(:disabled)'))
      : this.submenu;
    focus?.focus({ preventScroll: true });
  }

  private closeSubmenu(): void {
    const focused = this.submenu?.contains(document.activeElement);
    this.submenu?.remove();
    this.submenu = undefined;
    this.alignmentTrigger?.setAttribute('aria-expanded', 'false');
    if (focused) this.menu?.focus({ preventScroll: true });
  }

  private closeMenu(): void {
    this.closeSubmenu();
    this.alignmentTrigger = undefined;
    this.menu?.remove();
    this.menu = undefined;
    this.context = undefined;
    this.origin = undefined;
    this.axis = undefined;
    for (const button of this.handles.values()) button.setAttribute('aria-expanded', 'false');
    if (this.highlight) this.highlight.hidden = true;
  }

  private append(axis: TableAxis): void {
    if (!this.cell || !this.available()) {
      this.reset();
      return;
    }
    const context = this.host.capture(this.cell, axis);
    if (context) {
      this.context = context;
      this.run(context, axis === 'row' ? 'table.insertRowAfter' : 'table.insertColumnAfter');
    } else this.reset();
  }

  private run(context: TableControlContext, action: TableControlAction): void {
    if (context !== this.context || !this.available()) return;
    try {
      this.host.execute(() => context.run(action));
      this.reset();
    } catch (error) {
      this.reset();
      this.host.onError(error);
    }
  }

  private menuKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (this.root) this.root.dataset.input = 'keyboard';
    const inSubmenu = Boolean(this.submenu?.contains(event.target as Node));
    if (this.submenu && (event.key === 'Escape' || (inSubmenu && event.key === 'ArrowLeft'))) {
      event.preventDefault();
      this.closeSubmenu();
      this.alignmentTrigger?.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'ArrowRight' && event.target === this.alignmentTrigger && this.context) {
      event.preventDefault();
      this.openAlignment(this.context, true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const origin = this.context?.current() ? this.origin : undefined;
      this.closeMenu();
      if (origin?.element.isConnected) {
        origin.element.focus({ preventScroll: true });
        if (origin.range?.startContainer.isConnected && origin.range.endContainer.isConnected) {
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(origin.range);
        }
      }
    } else if (this.menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const items = [
        ...(inSubmenu
          ? (this.submenu ?? this.menu)
          : this.menu
        ).querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)'),
      ];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : index < 0
              ? event.key === 'ArrowUp'
                ? items.length - 1
                : 0
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    } else if (this.menu && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (inSubmenu) return;
      event.stopPropagation();
      this.open(event.key === 'ArrowLeft' ? 'row' : 'column', true);
    } else if (event.key === 'Tab') {
      // Cycle through the axis tabs and enabled commands without losing the editor caret.
      if (!this.menu) return;
      event.preventDefault();
      const buttons = [
        ...(inSubmenu
          ? (this.submenu ?? this.menu)
          : this.menu
        ).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      ];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        index < 0
          ? event.shiftKey
            ? buttons.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
}
