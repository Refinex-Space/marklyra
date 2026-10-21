import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type ContextMenuItem, offeredContextActions } from '../src/context-menu/contracts.js';
import type { MarkLyraMenuState } from '../src/menu-state.js';
import type { MarkLyraCommand } from '../src/protocol.js';
import { type ContextMenuDependencies, RuntimeContextMenu } from '../src/runtime/context-menu.js';
import {
  type ContextMenuFacts,
  contextMenuItems,
  EDITING_CONTEXT_ACTIONS,
} from '../src/runtime/context-menu-items.js';
import {
  EDITING_COMMANDS,
  editingCommandAllowed,
  editingCommandChecked,
  shortcutLabel,
} from '../src/runtime/editing-commands.js';
import { slashSections } from '../src/runtime/slash-commands.js';

const state = (patch: Partial<MarkLyraMenuState> = {}): MarkLyraMenuState => ({
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  canUndo: false,
  canRedo: false,
  locked: false,
  modalOpen: false,
  inlineAllowed: true,
  blockAllowed: true,
  inlineStyles: [],
  blockStyles: ['paragraph'],
  ...patch,
});
const facts = (patch: Partial<ContextMenuFacts> = {}): ContextMenuFacts => ({
  tokens: ['normal'],
  selected: true,
  lineWise: false,
  writable: true,
  sourceMode: false,
  codeMirror: false,
  table: undefined,
  link: undefined,
  externalLink: false,
  clipboardRead: true,
  clipboardWrite: true,
  openExternal: true,
  editing: state(),
  ...patch,
});
const submenu = (items: ContextMenuItem[], label: string) => {
  const found = items.find((item) => item.type === 'submenu' && item.label === label);
  return found?.type === 'submenu' ? found.items : undefined;
};
const titles = (items: ContextMenuItem[]) =>
  items.filter((item) => item.type === 'submenu').map((item) => item.label);

describe('shared editing command catalog', () => {
  it('prints the same accelerators the application menu registers', () => {
    const menu = readFileSync(
      new URL('../../../apps/desktop/src-tauri/src/menu.rs', import.meta.url),
      'utf8',
    );
    const accelerators = new Map<string, string | undefined>();
    for (const match of menu.matchAll(
      /Action\(\s*"([^"]+)",\s*"[^"]*",\s*(None|Some\("([^"]+)"\)),?\s*\)/g,
    ))
      if (match[1]) accelerators.set(match[1], match[3]);
    const menuId = (command: MarkLyraCommand) => {
      switch (command.type) {
        case 'heading':
          return `heading:${command.level}`;
        case 'list':
          return `list:${command.style}`;
        case 'format':
          return `format:${command.style}`;
        default:
          return {
            insertTable: 'insert-table',
            codeBlock: 'code-block',
            mathBlock: 'math-block',
            horizontalRule: 'hr',
            indent: 'indent',
            outdent: 'outdent',
          }[command.type as string];
      }
    };
    for (const entry of EDITING_COMMANDS) {
      const id = menuId(entry.command);
      expect(id && accelerators.has(id), `${entry.id} → ${id}`).toBe(true);
      expect(entry.shortcut, entry.id).toBe(accelerators.get(id as string));
    }
  });
  it('renders shortcuts in each platform convention', () => {
    expect(shortcutLabel('CmdOrCtrl+Shift+U', true)).toBe('⇧⌘U');
    expect(shortcutLabel('CmdOrCtrl+Shift+U', false)).toBe('Ctrl+Shift+U');
    expect(shortcutLabel('CmdOrCtrl+Shift+Minus', false)).toBe('Ctrl+Shift+-');
    expect(shortcutLabel('CmdOrCtrl+BracketRight', true)).toBe('⌘]');
  });
  it('mirrors the application menu enable and check rules', () => {
    const heading: MarkLyraCommand = { type: 'heading', level: 2 };
    const bold: MarkLyraCommand = { type: 'format', style: 'strong' };
    expect(editingCommandAllowed(state(), heading)).toBe(true);
    expect(editingCommandAllowed(state({ blockAllowed: false }), heading)).toBe(false);
    expect(editingCommandAllowed(state({ inlineAllowed: false }), bold)).toBe(false);
    for (const blocked of [{ locked: true }, { sourceMode: true }, { modalOpen: true }])
      expect(editingCommandAllowed(state(blocked), bold)).toBe(false);
    expect(
      editingCommandAllowed(state({ blockAllowed: false, blockStyles: ['ul'] }), {
        type: 'list',
        style: 'ol',
      }),
    ).toBe(true);
    expect(editingCommandChecked(state({ blockStyles: ['header2'] }), heading)).toBe(true);
    expect(editingCommandChecked(state(), { type: 'heading', level: 0 })).toBe(true);
    expect(editingCommandChecked(state({ inlineStyles: ['strong'] }), bold)).toBe(true);
  });
});

describe('slash command search', () => {
  const ids = (query: string) =>
    slashSections(query).flatMap((section) => section.entries.map((entry) => entry.id));
  it('groups a short default list and keeps rare levels searchable', () => {
    const sections = slashSections('');
    expect(sections.map((section) => section.label)).toEqual(['基础', '列表', '插入']);
    expect(ids('')).not.toContain('heading4');
    expect(ids('h4')[0]).toBe('heading4');
    expect(ids('')).not.toContain('strong');
    expect(ids('bold')).toEqual([]);
  });
  it.each([
    ['h2', 'heading2'],
    ['##', 'heading2'],
    ['ejbt', 'heading2'],
    ['表格', 'table'],
    ['biaoge', 'table'],
    ['代码', 'codeBlock'],
    ['todo', 'tasklist'],
    ['待办', 'tasklist'],
    ['yinyong', 'blockquote'],
    ['---', 'hr'],
    ['公式', 'mathBlock'],
    ['Link', 'link'],
    ['正文', 'paragraph'],
  ])('ranks %s first as %s', (query, expected) => {
    expect(ids(query)[0]).toBe(expected);
  });
  it('matches every heading level for a generic query and nothing for prose', () => {
    expect(ids('标题')).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
    ]);
    expect(ids('zzz')).toEqual([]);
  });
  it('omits commands the current caret cannot run', () => {
    expect(ids('').length).toBeGreaterThan(0);
    expect(
      slashSections('', (entry) => entry.command.type !== 'insertTable').flatMap((section) =>
        section.entries.map((entry) => entry.id),
      ),
    ).not.toContain('table');
  });
});

describe('right-click editing groups', () => {
  it('adds format, paragraph and insert submenus after the clipboard group', () => {
    const items = contextMenuItems(facts());
    expect(titles(items)).toEqual(['复制为', '格式', '段落', '插入']);
    const paragraph = submenu(items, '段落') ?? [];
    expect(paragraph.find((item) => item.type === 'item' && item.checked)).toMatchObject({
      actionId: 'paragraph.body',
    });
    expect(
      paragraph.some((item) => item.type === 'item' && item.actionId === 'paragraph.indent'),
    ).toBe(false);
    const actions = offeredContextActions(items);
    for (const action of Object.keys(EDITING_CONTEXT_ACTIONS))
      if (!action.endsWith('dent')) expect(actions.has(action as never), action).toBe(true);
  });
  it('checks current styles and offers indentation only inside lists', () => {
    const items = contextMenuItems(
      facts({ editing: state({ inlineStyles: ['strong'], blockStyles: ['ul', 'paragraph'] }) }),
    );
    const format = submenu(items, '格式') ?? [];
    expect(
      format.find((item) => item.type === 'item' && item.actionId === 'format.strong'),
    ).toMatchObject({ checked: true });
    const paragraph = submenu(items, '段落') ?? [];
    expect(
      paragraph.find((item) => item.type === 'item' && item.actionId === 'paragraph.ul'),
    ).toMatchObject({ checked: true });
    expect(offeredContextActions(items).has('paragraph.indent')).toBe(true);
  });
  it('omits groups with nothing runnable and stays out of code, source and locked contexts', () => {
    const blocks = contextMenuItems(facts({ editing: state({ blockAllowed: false }) }));
    const offered = offeredContextActions(blocks);
    // Same rules as the application menu: list-like blocks still apply, headings do not.
    expect(offered.has('paragraph.heading1')).toBe(false);
    expect(offered.has('insert.table')).toBe(false);
    expect(offered.has('paragraph.ul')).toBe(true);
    expect(offered.has('insert.codeBlock')).toBe(true);
    const inline = contextMenuItems(
      facts({
        editing: state({ blockAllowed: false, inlineAllowed: false, blockStyles: ['meta_block'] }),
      }),
    );
    expect(titles(inline)).toEqual(['复制为']);
    const { editing: _, ...plain } = facts();
    const patches: Partial<ContextMenuFacts>[] = [
      { codeMirror: true },
      { sourceMode: true },
      { writable: false },
      { tokens: ['table'] },
    ];
    expect(titles(contextMenuItems(plain))).not.toContain('格式');
    for (const patch of patches)
      expect(titles(contextMenuItems(facts(patch)))).not.toContain('格式');
  });
  it('stays within the shared item budget with every context group present', () => {
    let count = 0;
    const walk = (items: ContextMenuItem[]) => {
      for (const item of items) {
        count++;
        if (item.type === 'submenu') walk(item.items);
      }
    };
    walk(
      contextMenuItems(
        facts({
          tokens: [
            'normal',
            'openLink',
            'copyLink',
            'table',
            'insertParagraphBefore',
            'edit',
            'delete',
          ],
          link: 'https://example.test',
          externalLink: true,
          table: { row: 1, rows: 3, column: 1, columns: 3, body: true, sourceRows: true },
          image: { source: 'a.png', syntax: 'img', actions: ['reveal', 'copyToStorage'] },
          editing: state({ blockStyles: ['ul', 'paragraph'] }),
        }),
      ),
    );
    expect(count).toBeLessThanOrEqual(128);
  });
});

describe('right-click editing execution', () => {
  function harness(editing: MarkLyraMenuState, locked = false) {
    const commands: MarkLyraCommand[] = [];
    const stamp = { generation: 1, sequence: 4 };
    const target = {
      isConnected: true,
      closest: (selector: string) => (selector === '[cid]' ? { getAttribute: () => 'p' } : null),
    };
    const editor = {
      sessionStr: 'editor-session',
      sourceView: { inSourceMode: false },
      writingArea: { contains: () => true, ownerDocument: { getSelection: () => null } },
      refocus: () => {},
    };
    const deps = {
      runtime: { editor, File: { isLocked: locked, _onInitParse: false, option: {} } },
      stamp: () => stamp,
      composing: () => false,
      loading: () => false,
      disposed: () => false,
      capabilities: () => ({ clipboardRead: true, clipboardWrite: true, openExternal: true }),
      send: () => {},
      clipboardHTML: (value: string) => value,
      normalizeSelection: () => true,
      armReplacement: () => true,
      armTableRow: () => true,
      command: (value: MarkLyraCommand) => commands.push(value),
    } as unknown as ContextMenuDependencies;
    const menu = new RuntimeContextMenu(deps);
    Reflect.set(menu, 'binding', {
      requestId: 'request',
      editor,
      session: 'editor-session',
      target,
      cid: 'p',
      sourceMode: false,
      stamp: { ...stamp },
      selection: { bookmark: null, focusCid: null, selected: false },
      actions: offeredContextActions(contextMenuItems(facts({ editing }))),
      tokens: ['normal'],
      link: undefined,
      lineWise: false,
      editing,
    });
    return { menu, commands, stamp };
  }
  it('runs the shared command for the offered action', () => {
    const h = harness(state());
    expect(h.menu.execute({ requestId: 'request', actionId: 'paragraph.heading2' })).toEqual({});
    expect(h.commands).toEqual([{ type: 'heading', level: 2 }]);
  });
  it('rejects stale, locked or unavailable editing actions without running them', () => {
    const stale = harness(state());
    stale.stamp.sequence++;
    expect(() => stale.menu.execute({ requestId: 'request', actionId: 'format.strong' })).toThrow();
    const locked = harness(state(), true);
    expect(() =>
      locked.menu.execute({ requestId: 'request', actionId: 'format.strong' }),
    ).toThrow();
    const cell = harness(state({ blockAllowed: false }));
    expect(() => cell.menu.execute({ requestId: 'request', actionId: 'insert.table' })).toThrow();
    expect([...stale.commands, ...locked.commands, ...cell.commands]).toEqual([]);
  });
});
