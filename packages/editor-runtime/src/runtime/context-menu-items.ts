import type { ContextAction, ContextMenuItem } from '../context-menu/contracts.js';
import type { ImageHostAction } from '../images/contracts.js';
import type { MarkLyraMenuState } from '../menu-state.js';
import {
  type EditingCommandId,
  editingCommand,
  editingCommandAllowed,
  editingCommandChecked,
} from './editing-commands.js';
export interface ContextMenuFacts {
  tokens: readonly string[];
  selected: boolean;
  lineWise: boolean;
  writable: boolean;
  sourceMode: boolean;
  codeMirror: boolean;
  table:
    | {
        row: number;
        rows: number;
        column: number;
        columns: number;
        body: boolean;
        sourceRows: boolean;
      }
    | undefined;
  link: string | undefined;
  externalLink: boolean;
  clipboardRead: boolean;
  clipboardWrite: boolean;
  openExternal: boolean;
  image?: {
    source: string;
    syntax: string;
    actions: readonly ImageHostAction[];
    preview?: boolean;
  };
  /** Original style facts read at capture time; absent outside ordinary rich text. */
  editing?: MarkLyraMenuState;
}
/** Context actions that run one shared editing command at the restored menu selection. */
export const EDITING_CONTEXT_ACTIONS = {
  'format.strong': 'strong',
  'format.em': 'em',
  'format.underline': 'underline',
  'format.del': 'del',
  'format.highlight': 'highlight',
  'format.code': 'code',
  'format.inlineMath': 'inlineMath',
  'format.superscript': 'superscript',
  'format.subscript': 'subscript',
  'format.link': 'link',
  'paragraph.body': 'paragraph',
  'paragraph.heading1': 'heading1',
  'paragraph.heading2': 'heading2',
  'paragraph.heading3': 'heading3',
  'paragraph.heading4': 'heading4',
  'paragraph.heading5': 'heading5',
  'paragraph.heading6': 'heading6',
  'paragraph.blockquote': 'blockquote',
  'paragraph.ul': 'ul',
  'paragraph.ol': 'ol',
  'paragraph.tasklist': 'tasklist',
  'paragraph.indent': 'indent',
  'paragraph.outdent': 'outdent',
  'insert.table': 'table',
  'insert.codeBlock': 'codeBlock',
  'insert.mathBlock': 'mathBlock',
  'insert.hr': 'hr',
  'insert.image': 'image',
} as const satisfies Partial<Record<ContextAction, EditingCommandId>>;
export type EditingContextAction = keyof typeof EDITING_CONTEXT_ACTIONS;
export function editingContextCommand(action: ContextAction) {
  return Object.hasOwn(EDITING_CONTEXT_ACTIONS, action)
    ? editingCommand(EDITING_CONTEXT_ACTIONS[action as EditingContextAction]).command
    : undefined;
}
const labels: Record<Exclude<ContextAction, EditingContextAction>, string> = {
  'edit.copy': '复制',
  'edit.cut': '剪切',
  'edit.paste': '粘贴',
  'edit.pastePlain': '粘贴纯文本',
  'edit.copyMarkdown': '复制为 Markdown',
  'edit.copyHTML': '复制为 HTML 代码',
  'edit.copySemanticHTML': '复制简化 HTML',
  'link.copyAddress': '复制链接地址',
  'link.open': '打开链接',
  'image.copyAddress': '复制图片地址',
  'image.reveal': '在访达中显示',
  'image.open': '在浏览器中打开图片',
  'image.preview': '查看大图',
  'image.copyToStorage': '复制图片到图片目录',
  'image.downloadToStorage': '下载图片到图片目录',
  'image.delete': '删除图片',
  'image.toHTML': '转换为 HTML 图片',
  'image.toMarkdown': '转换为 Markdown 图片',
  'image.zoom50': '50%',
  'image.zoom100': '100%',
  'image.zoom200': '200%',
  'table.insertRowBefore': '在上方插入行',
  'table.insertRowAfter': '在下方插入行',
  'table.insertColumnBefore': '在左侧插入列',
  'table.insertColumnAfter': '在右侧插入列',
  'table.deleteRow': '删除行',
  'table.deleteColumn': '删除列',
  'table.delete': '删除表格',
  'table.moveRowUp': '上移行',
  'table.moveRowDown': '下移行',
  'table.moveColumnLeft': '左移列',
  'table.moveColumnRight': '右移列',
  'table.copy': '复制表格',
  'table.format': '整理表格源码',
  'block.insertParagraphBefore': '在前方插入段落',
  'block.insertParagraphAfter': '在后方插入段落',
  'block.edit': '编辑块',
  'block.delete': '删除块',
  'code.copy': '复制全部代码',
  'code.format': '格式化全部代码',
  'code.formatSelection': '格式化所选代码',
};
export function contextMenuItems(f: ContextMenuFacts): ContextMenuItem[] {
  const item = (actionId: ContextAction, enabled = true): ContextMenuItem => ({
    type: 'item',
    actionId,
    label: Object.hasOwn(EDITING_CONTEXT_ACTIONS, actionId)
      ? editingCommand(EDITING_CONTEXT_ACTIONS[actionId as EditingContextAction]).label
      : labels[actionId as Exclude<ContextAction, EditingContextAction>],
    enabled,
  });
  const separator: ContextMenuItem = { type: 'separator' },
    items: ContextMenuItem[] = [];
  const selected = f.selected || f.lineWise;
  if (f.image) {
    const network = /^(?:https?:|\/\/)/i.test(f.image.source);
    items.push(
      item('image.preview', f.image.preview !== false),
      network
        ? item('image.open', f.openExternal)
        : item('image.reveal', f.image.actions.includes('reveal')),
      item('image.copyAddress', f.clipboardWrite),
      item(
        network ? 'image.downloadToStorage' : 'image.copyToStorage',
        f.writable && f.image.actions.includes(network ? 'downloadToStorage' : 'copyToStorage'),
      ),
      {
        type: 'submenu',
        label: '缩放图片',
        items: [
          item('image.zoom50', f.writable),
          item('image.zoom100', f.writable),
          item('image.zoom200', f.writable),
        ],
      },
      item(
        f.image.syntax === 'imgtag' ? 'image.toMarkdown' : 'image.toHTML',
        f.writable && f.image.syntax !== 'refimg',
      ),
      item('image.delete', f.writable),
      separator,
    );
  }
  if (f.tokens.includes('openLink') || f.tokens.includes('copyLink')) {
    items.push(
      item('link.open', Boolean(f.link) && f.externalLink && f.openExternal),
      item('link.copyAddress', Boolean(f.link) && f.clipboardWrite),
      separator,
    );
  }
  if (f.tokens.includes('normal') || f.tokens.includes('input')) {
    items.push(
      item('edit.cut', selected && f.writable && f.clipboardWrite),
      item('edit.copy', selected && f.clipboardWrite),
      item('edit.paste', f.writable && f.clipboardRead),
      item('edit.pastePlain', f.writable && f.clipboardRead),
    );
    if (!f.codeMirror)
      items.push({
        type: 'submenu',
        label: '复制为',
        items: [
          item('edit.copyMarkdown', f.selected && f.clipboardWrite),
          item('edit.copyHTML', f.selected && f.clipboardWrite),
          item('edit.copySemanticHTML', f.selected && f.clipboardWrite),
        ],
      });
  }
  const editing = editingGroups(f);
  if (editing.length) items.push(separator, ...editing);
  const table = f.table;
  if (f.tokens.includes('table') && table) {
    items.push(separator, {
      type: 'submenu',
      label: '表格',
      items: [
        item('table.insertRowBefore', f.writable && table.sourceRows),
        item('table.insertRowAfter', f.writable && table.sourceRows),
        item('table.insertColumnBefore', f.writable),
        item('table.insertColumnAfter', f.writable),
        separator,
        item('table.deleteRow', f.writable && table.body && table.sourceRows),
        item('table.deleteColumn', f.writable && table.columns > 1),
        item('table.delete', f.writable),
        separator,
        item('table.moveRowUp', f.writable && table.sourceRows && table.row > 0),
        item('table.moveRowDown', f.writable && table.sourceRows && table.row < table.rows - 1),
        item('table.moveColumnLeft', f.writable && table.column > 0),
        item('table.moveColumnRight', f.writable && table.column < table.columns - 1),
        separator,
        item('table.copy', f.clipboardWrite),
        item('table.format', f.writable),
      ],
    });
  }
  if (f.tokens.includes('code-tools') && !f.sourceMode)
    items.push(separator, {
      type: 'submenu',
      label: '代码',
      items: [
        item('code.copy', f.clipboardWrite),
        item('code.format', f.writable && f.codeMirror),
        item('code.formatSelection', f.writable && f.codeMirror && f.selected),
      ],
    });
  const blocks: ContextMenuItem[] = [];
  if (f.tokens.includes('insertParagraphBefore'))
    blocks.push(item('block.insertParagraphBefore', f.writable && !f.sourceMode));
  if (f.tokens.includes('insertParagraphAfter'))
    blocks.push(item('block.insertParagraphAfter', f.writable && !f.sourceMode));
  if (f.tokens.includes('edit')) blocks.push(item('block.edit', f.writable && !f.sourceMode));
  if (f.tokens.includes('delete') || f.tokens.includes('delete-fences'))
    blocks.push(item('block.delete', f.writable && !f.sourceMode));
  if (blocks.length) items.push(separator, ...blocks);
  return items;
}
/** Format, paragraph and insert groups use the application menu's names, order and rules, so
 * the right-click menu teaches the same commands and shortcuts. Empty groups are omitted. */
function editingGroups(f: ContextMenuFacts): ContextMenuItem[] {
  const state = f.editing;
  if (!state || !f.writable || f.sourceMode || f.codeMirror || !f.tokens.includes('normal'))
    return [];
  const separator: ContextMenuItem = { type: 'separator' };
  const entry = (actionId: EditingContextAction, check = true): ContextMenuItem => {
    const { label, command } = editingCommand(EDITING_CONTEXT_ACTIONS[actionId]);
    return {
      type: 'item',
      actionId,
      label,
      enabled: editingCommandAllowed(state, command),
      ...(check ? { checked: editingCommandChecked(state, command) } : {}),
    };
  };
  const group = (label: string, values: (ContextMenuItem | 'separator')[]): ContextMenuItem[] => {
    const children = values.map((value) => (value === 'separator' ? separator : value));
    return children.some((child) => child.type === 'item' && child.enabled)
      ? [{ type: 'submenu', label, items: children }]
      : [];
  };
  const inList = ['ul', 'ol', 'tasklist'].some((style) => state.blockStyles.includes(style));
  return [
    ...group('格式', [
      entry('format.strong'),
      entry('format.em'),
      entry('format.underline'),
      entry('format.del'),
      entry('format.highlight'),
      entry('format.code'),
      'separator',
      entry('format.inlineMath'),
      entry('format.superscript'),
      entry('format.subscript'),
      'separator',
      entry('format.link', false),
    ]),
    ...group('段落', [
      entry('paragraph.body'),
      entry('paragraph.heading1'),
      entry('paragraph.heading2'),
      entry('paragraph.heading3'),
      entry('paragraph.heading4'),
      entry('paragraph.heading5'),
      entry('paragraph.heading6'),
      'separator',
      entry('paragraph.blockquote'),
      entry('paragraph.ul'),
      entry('paragraph.ol'),
      entry('paragraph.tasklist'),
      ...(inList
        ? ([
            'separator',
            entry('paragraph.indent', false),
            entry('paragraph.outdent', false),
          ] as const)
        : []),
    ]),
    ...group('插入', [
      entry('insert.table', false),
      entry('insert.codeBlock', false),
      entry('insert.mathBlock', false),
      entry('insert.hr', false),
      'separator',
      entry('insert.image', false),
    ]),
  ];
}
