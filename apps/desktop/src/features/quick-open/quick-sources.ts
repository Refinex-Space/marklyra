import { displayPath } from '../../services/display-path.js';
import { recentFiles } from '../../services/recent.js';
import { type WorkspaceFolder, workspaces } from '../../services/workspaces.js';
import { type QuickItem, shortcutLabel } from './quick-open-model.js';

/** Accelerators as the application menu declares them (menu.rs); shown, never registered here. */
const ACCELERATORS: Record<string, string> = {
  new: 'CmdOrCtrl+N',
  'new-window': 'CmdOrCtrl+Shift+N',
  open: 'CmdOrCtrl+O',
  save: 'CmdOrCtrl+S',
  'save-as': 'CmdOrCtrl+Shift+S',
  'print-preview': 'CmdOrCtrl+P',
  find: 'CmdOrCtrl+F',
  replace: 'CmdOrCtrl+Shift+F',
  'view:source': 'CmdOrCtrl+/',
  'view:focus': 'F8',
  'view:typewriter': 'F9',
  preferences: 'CmdOrCtrl+,',
  'quick-open': 'CmdOrCtrl+Shift+P',
};
export function acceleratorFor(action: string, mac: boolean): string | undefined {
  const accelerator = ACCELERATORS[action];
  return accelerator ? shortcutLabel(accelerator, mac) : undefined;
}

const MARKDOWN_EXTENSION =
  /\.(md|markdown|mdx|mkd|mdown|mdtext|mdtxt|mdwn|mmd|qmd|rmd|rmarkdown|txt|text|apib)$/i;
const stem = (name: string) => name.replace(MARKDOWN_EXTENSION, '');
const windowsPath = (path: string) => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path);
const slashPath = (path: string) => (windowsPath(path) ? path.replaceAll('\\', '/') : path);
const trail = (path: string) => path.split('/').filter(Boolean).join(' › ');

export interface QuickContext {
  mac: boolean;
  /** A document (even an unsaved one) is open in the editor, not the first-screen home. */
  hasDocument: boolean;
  /** The open document is saved on disk. */
  canRename: boolean;
  /** Export kinds the host can write right now, as the menu names them (`pdf`, `docx`…). */
  availableFormats: readonly string[];
  /** The sidebar calendar is enabled and a folder is open. */
  calendar?: boolean;
  /** Run an application menu action through the same guards as the menu itself. */
  run(action: string): void;
  openAiSettings(): void;
}

/** Actions, workspace and settings entries. Anything that cannot work right now is left out. */
export function quickItems(context: QuickContext): QuickItem[] {
  const { mac, hasDocument, canRename, availableFormats, run } = context;
  const action = (
    id: string,
    title: string,
    icon: QuickItem['icon'],
    keywords = '',
    kind: QuickItem['kind'] = 'action',
  ): QuickItem => {
    const shortcut = acceleratorFor(id, mac);
    return {
      id: `${kind}:${id}`,
      kind,
      title,
      icon,
      keywords,
      ...(shortcut ? { shortcut } : {}),
      run: () => run(id),
    };
  };
  const exports = [
    ['pdf', '导出为 PDF', 'export pdf'],
    ['html', '导出为 HTML', 'export html'],
    ['image', '导出为图像', 'export image png'],
    ['docx', '导出为 Word', 'export word docx'],
  ] as const;
  const items: QuickItem[] = [
    action('new', '新建笔记', 'add', 'new create note'),
    action('new-window', '新建窗口', 'newWindow', 'new window'),
    action('open', '打开文件…', 'open', 'open file'),
    action('recent-files', '最近文件…', 'history', 'recent'),
  ];
  if (hasDocument) {
    items.push(
      action('close-document', '回到首页', 'home', 'close document home start'),
      action('save', '保存', 'save', 'save'),
      action('save-as', '另存为…', 'save', 'save as'),
      ...(canRename ? [action('rename-document', '重命名…', 'rename', 'rename')] : []),
      action('find', '查找…', 'search', 'find search'),
      action('replace', '查找并替换…', 'search', 'replace'),
      action('view:source', '源代码模式', 'source', 'source code markdown'),
      action('view:focus', '专注模式', 'document', 'focus'),
      action('view:typewriter', '打字机模式', 'document', 'typewriter'),
      action('print-preview', '打印预览…', 'print', 'print'),
      ...exports
        .filter(([format]) => availableFormats.includes(format))
        .map(([format, title, keywords]) => action(`export-${format}`, title, 'export', keywords)),
    );
  }
  items.push(
    action('view:sidebar', '显示/隐藏侧边栏', 'sidebar', 'sidebar toggle', 'workspace'),
    action('open-folder', '打开文件夹…', 'open', 'open folder workspace', 'workspace'),
    action('view:files', '文件树', 'open', 'files tree', 'workspace'),
    action('view:articles', '文档列表', 'document', 'articles list', 'workspace'),
    action(
      'view:workspace-search',
      '在文件夹中搜索',
      'search',
      'search find in files',
      'workspace',
    ),
    ...(hasDocument
      ? [action('view:outline', '显示/隐藏文档目录', 'menu', 'outline toc', 'workspace')]
      : []),
    ...(context.calendar
      ? [
          action(
            'view:calendar',
            '显示/收起日历',
            'calendar',
            'calendar 日历 due 到期',
            'workspace',
          ),
        ]
      : []),
    action('view:ai', 'AI 助手', 'ai', 'ai assistant agent', 'workspace'),
    action('preferences', '偏好设置…', 'settings', 'preferences settings options', 'setting'),
    {
      id: 'setting:ai',
      kind: 'setting',
      title: '智能体（AI）设置',
      icon: 'ai',
      keywords: 'ai agent settings preferences',
      run: () => context.openAiSettings(),
    },
  );
  return items;
}

export interface QuickNotes {
  items: QuickItem[];
  /** Set when the folder holds more notes than were listed. */
  hint?: string;
}
interface Open {
  workspace(workspaceId: string, relativePath: string): void;
  recent(id: string): void;
}

type NoteItem = QuickItem & { fullPath: string; detail: string };

/** Keep the short labels unless two visible names and locations would be identical. */
function distinguishLocations(items: NoteItem[]) {
  const groups = new Map<string, NoteItem[]>();
  for (const item of items) {
    const group = groups.get(item.title);
    if (group) group.push(item);
    else groups.set(item.title, [item]);
  }
  for (const group of groups.values()) {
    if (group.length < 2 || new Set(group.map((item) => item.detail)).size === group.length)
      continue;
    const paths = group.map(({ fullPath }) => slashPath(fullPath).split('/'));
    let shared = 0;
    while (
      paths.every((parts) => shared < parts.length - 1 && parts[shared] === paths[0]?.[shared])
    )
      shared++;
    const sameFilename = paths.every((parts) => parts.at(-1) === paths[0]?.at(-1));
    const details = paths.map((path) => {
      const parts = path.slice(shared);
      if (sameFilename && parts.length > 1) parts.pop();
      return parts.join(' › ');
    });
    const distinct = new Set(details).size === group.length;
    group.forEach((item, i) => {
      item.detail = (distinct && details[i]) || item.fullPath;
    });
  }
}

/** Recent files first, then the open folder's notes, newest first; each file once. */
export async function loadQuickNotes(
  workspace: WorkspaceFolder | null,
  open: Open,
): Promise<QuickNotes> {
  const [recent, report] = await Promise.all([
    recentFiles.list().then(
      (listing) => listing.entries,
      () => [],
    ),
    workspace
      ? workspaces.articles(workspace.id).then(
          (value) => value,
          () => null,
        )
      : Promise.resolve(null),
  ]);
  const base = workspace ? displayPath(workspace.path) : '';
  const root = workspace ? `${slashPath(base).replace(/\/$/, '')}/` : '';
  const rootKey = root.toLowerCase();
  const rootParts = root.split('/').length - 1;
  const seen = new Set<string>();
  const items: NoteItem[] = [];
  for (const entry of [...recent].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)) {
    const fullPath = displayPath(entry.path);
    const path = slashPath(fullPath);
    const key = path.toLowerCase();
    seen.add(key);
    const parts = path.split('/');
    const folder =
      root && key.startsWith(rootKey) ? parts.slice(rootParts, -1) : parts.slice(-3, -1);
    items.push({
      id: `note:recent:${entry.id}`,
      kind: 'note',
      title: stem(entry.name),
      fullPath,
      detail: folder.filter(Boolean).join(' › '),
      keywords: entry.name,
      icon: 'document',
      run: () => open.recent(entry.id),
    });
  }
  if (workspace && report) {
    const documents = [...report.entries].sort(
      (a, b) => (b.modifiedAt ?? -1) - (a.modifiedAt ?? -1) || a.name.localeCompare(b.name),
    );
    const separator = windowsPath(base) ? '\\' : '/';
    for (const entry of documents) {
      if (seen.has(`${root}${entry.relativePath}`.toLowerCase())) continue;
      items.push({
        id: `note:workspace:${entry.relativePath}`,
        kind: 'note',
        title: stem(entry.name),
        fullPath: (root + entry.relativePath).replaceAll('/', separator),
        detail: trail(entry.folderRelativePath),
        keywords: `${entry.name} ${entry.relativePath}`,
        icon: 'document',
        run: () => open.workspace(workspace.id, entry.relativePath),
      });
    }
  }
  distinguishLocations(items);
  return {
    items,
    ...(report?.truncated ? { hint: '笔记较多，仅列出了一部分；更多可在侧栏搜索中查找。' } : {}),
  };
}
