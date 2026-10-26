import type { MarkLyraMenuState } from '../menu-state.js';
import type { MarkLyraCommand } from '../protocol.js';

/** One finite catalog shared by the right-click menu and the slash menu. Every entry is an
 * existing, source-proven MarkLyraCommand; nothing here reaches native selectors. */
export type EditingCommandId =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'ul'
  | 'ol'
  | 'tasklist'
  | 'blockquote'
  | 'indent'
  | 'outdent'
  | 'table'
  | 'codeBlock'
  | 'mathBlock'
  | 'hr'
  | 'link'
  | 'image'
  | 'strong'
  | 'em'
  | 'underline'
  | 'del'
  | 'highlight'
  | 'code'
  | 'inlineMath'
  | 'superscript'
  | 'subscript';

export interface EditingCommand {
  id: EditingCommandId;
  label: string;
  command: MarkLyraCommand;
  /** The application menu accelerator for the same command (menu.rs), for display only. */
  shortcut?: string;
  /** Lower-case search aliases: English names, Markdown markers, full pinyin and initials. */
  keywords: readonly string[];
}

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6, name: string, pinyin: string): EditingCommand => ({
  id: `heading${level}`,
  label: `${name}级标题`,
  command: { type: 'heading', level },
  shortcut: `CmdOrCtrl+${level}`,
  keywords: [
    `h${level}`,
    `heading${level}`,
    '#'.repeat(level),
    'heading',
    'title',
    'biaoti',
    'bt',
    `${pinyin}jibiaoti`,
    `${pinyin[0]}jbt`,
    '标题',
  ],
});

export const EDITING_COMMANDS: readonly EditingCommand[] = [
  {
    id: 'paragraph',
    label: '正文',
    command: { type: 'heading', level: 0 },
    shortcut: 'CmdOrCtrl+0',
    keywords: ['text', 'paragraph', 'body', 'zhengwen', 'zw', 'wenben', 'duanluo', '段落', '文本'],
  },
  heading(1, '一', 'yi'),
  heading(2, '二', 'er'),
  heading(3, '三', 'san'),
  heading(4, '四', 'si'),
  heading(5, '五', 'wu'),
  heading(6, '六', 'liu'),
  {
    id: 'ul',
    label: '无序列表',
    command: { type: 'list', style: 'ul' },
    shortcut: 'CmdOrCtrl+Shift+U',
    keywords: [
      'ul',
      'bullet',
      'list',
      'unordered',
      '-',
      'wuxuliebiao',
      'wxlb',
      'liebiao',
      'lb',
      '列表',
    ],
  },
  {
    id: 'ol',
    label: '有序列表',
    command: { type: 'list', style: 'ol' },
    shortcut: 'CmdOrCtrl+Shift+O',
    keywords: [
      'ol',
      'numbered',
      'ordered',
      'list',
      '1.',
      'youxuliebiao',
      'yxlb',
      'liebiao',
      'lb',
      '编号',
    ],
  },
  {
    id: 'tasklist',
    label: '任务列表',
    command: { type: 'list', style: 'tasklist' },
    shortcut: 'CmdOrCtrl+Shift+X',
    keywords: [
      'todo',
      'task',
      'checkbox',
      '[]',
      'renwuliebiao',
      'rwlb',
      'daiban',
      'db',
      '待办',
      '清单',
    ],
  },
  {
    id: 'blockquote',
    label: '引用',
    command: { type: 'list', style: 'blockquote' },
    shortcut: 'CmdOrCtrl+Shift+Q',
    keywords: ['quote', 'blockquote', '>', 'yinyong', 'yy'],
  },
  {
    id: 'indent',
    label: '增加缩进',
    command: { type: 'indent' },
    shortcut: 'CmdOrCtrl+BracketRight',
    keywords: ['indent', 'suojin', 'sj'],
  },
  {
    id: 'outdent',
    label: '减少缩进',
    command: { type: 'outdent' },
    shortcut: 'CmdOrCtrl+BracketLeft',
    keywords: ['outdent', 'suojin', 'sj'],
  },
  {
    id: 'table',
    label: '表格',
    command: { type: 'insertTable' },
    shortcut: 'CmdOrCtrl+Shift+T',
    keywords: ['table', 'grid', 'biaoge', 'bg'],
  },
  {
    id: 'codeBlock',
    label: '代码块',
    command: { type: 'codeBlock' },
    shortcut: 'CmdOrCtrl+Shift+C',
    keywords: ['code', 'codeblock', 'fence', '```', 'daimakuai', 'dmk', 'daima', 'dm'],
  },
  {
    id: 'mathBlock',
    label: '数学公式块',
    command: { type: 'mathBlock' },
    shortcut: 'CmdOrCtrl+Shift+B',
    keywords: [
      'math',
      'latex',
      'formula',
      'equation',
      '$$',
      'gongshi',
      'gs',
      'shuxue',
      'sx',
      '公式',
    ],
  },
  {
    id: 'hr',
    label: '分隔线',
    command: { type: 'horizontalRule' },
    shortcut: 'CmdOrCtrl+Shift+Minus',
    keywords: ['hr', 'divider', 'line', 'separator', '---', 'fengexian', 'fgx', '分割线', '横线'],
  },
  {
    id: 'link',
    label: '链接',
    command: { type: 'format', style: 'link' },
    shortcut: 'CmdOrCtrl+K',
    keywords: ['link', 'url', 'href', 'lianjie', 'lj', '超链接', '网址'],
  },
  {
    id: 'image',
    label: '图片',
    command: { type: 'format', style: 'image' },
    keywords: ['image', 'img', 'picture', 'photo', 'tupian', 'tp', '图像', '照片'],
  },
  {
    id: 'strong',
    label: '加粗',
    command: { type: 'format', style: 'strong' },
    shortcut: 'CmdOrCtrl+B',
    keywords: ['bold', 'strong', 'jiacu', 'jc', '粗体'],
  },
  {
    id: 'em',
    label: '斜体',
    command: { type: 'format', style: 'em' },
    shortcut: 'CmdOrCtrl+I',
    keywords: ['italic', 'em', 'xieti', 'xt'],
  },
  {
    id: 'underline',
    label: '下划线',
    command: { type: 'format', style: 'underline' },
    shortcut: 'CmdOrCtrl+U',
    keywords: ['underline', 'xiahuaxian', 'xhx'],
  },
  {
    id: 'del',
    label: '删除线',
    command: { type: 'format', style: 'del' },
    keywords: ['strike', 'strikethrough', 'del', 'shanchuxian', 'scx'],
  },
  {
    id: 'highlight',
    label: '高亮',
    command: { type: 'format', style: 'highlight' },
    shortcut: 'CmdOrCtrl+Shift+H',
    keywords: ['highlight', 'mark', 'gaoliang', 'gl'],
  },
  {
    id: 'code',
    label: '行内代码',
    command: { type: 'format', style: 'code' },
    keywords: ['inline code', 'code', 'hangneidaima', 'hndm'],
  },
  {
    id: 'inlineMath',
    label: '行内公式',
    command: { type: 'format', style: 'inline_math' },
    keywords: ['inline math', 'math', 'hangneigongshi', 'hngs'],
  },
  {
    id: 'superscript',
    label: '上标',
    command: { type: 'format', style: 'superscript' },
    keywords: ['superscript', 'sup', 'shangbiao', 'sb'],
  },
  {
    id: 'subscript',
    label: '下标',
    command: { type: 'format', style: 'subscript' },
    keywords: ['subscript', 'sub', 'xiabiao', 'xb'],
  },
];

const byId = new Map(EDITING_COMMANDS.map((entry) => [entry.id, entry]));
export function editingCommand(id: EditingCommandId): EditingCommand {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown editing command: ${id}`);
  return entry;
}

/** Mirrors the desktop shell's nativeMenuCommandAllowed and Rust menu/state.rs. */
export function editingCommandAllowed(state: MarkLyraMenuState, command: MarkLyraCommand): boolean {
  if (state.modalOpen || state.locked || state.sourceMode) return false;
  switch (command.type) {
    case 'format':
      return state.inlineAllowed;
    case 'heading':
    case 'insertTable':
    case 'horizontalRule':
      return state.blockAllowed;
    case 'list':
    case 'codeBlock':
    case 'mathBlock':
    case 'indent':
    case 'outdent':
      return !state.blockStyles.includes('meta_block') || state.blockAllowed;
    default:
      return false;
  }
}

/** The same checked facts as the application menu shows for the current caret. */
export function editingCommandChecked(state: MarkLyraMenuState, command: MarkLyraCommand): boolean {
  switch (command.type) {
    case 'format':
      return state.inlineStyles.includes(command.style);
    case 'list':
      return state.blockStyles.includes(command.style);
    case 'heading':
      return state.blockStyles.includes(
        command.level === 0 ? 'paragraph' : `header${command.level}`,
      );
    case 'codeBlock':
      return state.blockStyles.includes('fences');
    case 'mathBlock':
      return state.blockStyles.includes('math_block');
    default:
      return false;
  }
}

const keyNames: Record<string, string> = {
  BracketRight: ']',
  BracketLeft: '[',
  Minus: '-',
};
/** Renders a menu.rs accelerator the way each platform's own menus print it. */
export function shortcutLabel(accelerator: string, mac: boolean): string {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const name = keyNames[key] ?? key;
  if (mac) {
    const symbols = parts
      .map((part) =>
        part === 'CmdOrCtrl' ? '⌘' : part === 'Shift' ? '⇧' : part === 'Alt' ? '⌥' : '⌃',
      )
      .sort((a, b) => '⌃⌥⇧⌘'.indexOf(a) - '⌃⌥⇧⌘'.indexOf(b));
    return symbols.join('') + name;
  }
  return [...parts.map((part) => (part === 'CmdOrCtrl' ? 'Ctrl' : part)), name].join('+');
}
