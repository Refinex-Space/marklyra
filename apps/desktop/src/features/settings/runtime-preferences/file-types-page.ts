import {
  baseFileTypes,
  checkedFileTypeList,
  type FileTypeSettings,
  fileTypeEnabled,
} from './file-types.js';

export interface FileTypePageControls {
  state: () => Record<string, unknown>;
  change: (disabled: string[]) => void;
  defaultExtension: (extension: string) => void;
  remove: (extension: string) => void;
}
let expanded = true;
let custom = false;
let lastDefault: string | undefined;
const names: Record<string, string> = {
  md: 'Markdown',
  markdown: 'Markdown',
  mkd: 'Markdown',
  mdown: 'Markdown',
  mdtext: 'Markdown',
  mdtxt: 'Markdown',
  mdwn: 'Markdown',
  mdx: 'MDX',
  mmd: 'MultiMarkdown',
  rmd: 'R Markdown',
  qmd: 'Quarto',
  rmarkdown: 'R Markdown',
  txt: '纯文本',
  text: '纯文本',
  apib: 'API Blueprint',
  '': '无扩展名文件',
};
export function renderFileTypes(pane: Element, controls: FileTypePageControls) {
  const state = controls.state();
  if (state.marklyraFileTypeActions !== true) return;
  const currentDefault = String(state.defaultExtension || 'md');
  if (lastDefault !== undefined && lastDefault !== currentDefault) custom = false;
  lastDefault = currentDefault;
  const supported = checkedFileTypeList(state.supportedFileTypes);
  const disabled = checkedFileTypeList(state.disabledFileTypes);
  const settings: FileTypeSettings = {
    defaultExtension: String(state.defaultExtension || 'md'),
    supportedFileTypes: supported,
    disabledFileTypes: disabled,
  };
  const group = pane
    .querySelector('[data-marklyra-preference="defaultExtension"]')
    ?.closest<HTMLElement>('.input-group');
  const content = group?.closest<HTMLElement>('.content');
  if (!group || !content) return;
  group.classList.add('settings-managed-default');
  const title = group.querySelector('.input-group-header-title');
  if (title && title.textContent !== '默认新建文件类型') title.textContent = '默认新建文件类型';
  let editor = group.querySelector<HTMLElement>('.settings-default-type');
  if (!editor) {
    editor = document.createElement('div');
    editor.className = 'settings-default-type';
    const row = document.createElement('div');
    row.className = 'row settings-select-row';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '默认新建文件类型');
    select.dataset.marklyraFileDefault = 'true';
    select.addEventListener('change', () => {
      custom = select.value === ':custom';
      if (custom) {
        input.hidden = false;
        input.focus();
      } else controls.defaultExtension(select.value);
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.hidden = !custom;
    input.placeholder = '输入扩展名，如 notes.md';
    input.setAttribute('aria-label', '自定义扩展名');
    input.dataset.marklyraFileDefault = 'true';
    input.addEventListener('blur', () => {
      if (custom && input.value) controls.defaultExtension(input.value);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
    row.append(select);
    editor.append(row, input);
    group.append(editor);
  }
  const select = editor.querySelector('select');
  const input = editor.querySelector('input');
  if (select) {
    const signature = JSON.stringify([supported, disabled, settings.defaultExtension]);
    if (select.dataset.options !== signature) {
      select.replaceChildren(
        ...supported
          .filter((id) => id && !disabled.includes(id))
          .map((id) => new Option(`${names[id] || '自定义'} (.${id})`, id)),
        new Option('自定义…', ':custom'),
      );
      select.dataset.options = signature;
    }
    select.value = custom ? ':custom' : settings.defaultExtension.toLowerCase();
  }
  if (input) {
    input.hidden = !custom;
    if (document.activeElement !== input) input.value = settings.defaultExtension;
  }
  let details = content.querySelector<HTMLDetailsElement>('.settings-file-types');
  if (!details) {
    details = document.createElement('details');
    details.className = 'settings-file-types';
    details.open = expanded;
    details.style.order = '15';
    details.addEventListener('toggle', () => {
      expanded = details?.open ?? true;
    });
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = '支持的文件类型';
    const count = document.createElement('span');
    count.className = 'settings-file-types-count';
    summary.append(title, count);
    const description = document.createElement('p');
    description.textContent =
      '以下类型按 Markdown 或纯文本编辑，不执行代码。关闭后不再显示在目录和搜索中，也无法新打开；已打开文稿可继续保存。关闭默认类型时，会自动选择其他已启用类型。';
    const grid = document.createElement('div');
    grid.className = 'settings-file-type-grid';
    details.append(summary, description, grid);
    content.append(details);
  }
  const enabled = supported.length - disabled.length;
  const count = details.querySelector('.settings-file-types-count');
  const summaryText = `${enabled} / ${supported.length} 已启用`;
  if (count && count.textContent !== summaryText) count.textContent = summaryText;
  const grid = details.querySelector('.settings-file-type-grid');
  if (!grid) return;
  for (const row of Array.from(grid.children)) {
    if (!supported.includes((row as HTMLElement).dataset.typeId ?? '')) row.remove();
  }
  const enabledSuffixes = supported.filter((id) => id && !disabled.includes(id));
  for (const id of supported) {
    let row = Array.from(grid.children).find((row) => (row as HTMLElement).dataset.typeId === id) as
      | HTMLDivElement
      | undefined;
    if (!row) {
      row = document.createElement('div');
      row.className = 'checkbox settings-file-type-row';
      row.dataset.typeId = id;
      const label = document.createElement('label');
      label.title = id ? `.${id}` : '无扩展名';
      const extension = document.createElement('strong');
      extension.textContent = id ? `.${id}` : '无扩展名';
      const name = document.createElement('small');
      name.textContent = names[id] || '自定义类型';
      label.append(extension, name);
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.id = `file-type-${crypto.randomUUID()}`;
      label.htmlFor = toggle.id;
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-label', `${id ? `.${id}` : '无扩展名'} 文件类型`);
      toggle.dataset.marklyraFileType = id;
      toggle.addEventListener('change', () => {
        const current = checkedFileTypeList(controls.state().disabledFileTypes);
        controls.change(toggle.checked ? current.filter((type) => type !== id) : [...current, id]);
      });
      row.append(label);
      if (!baseFileTypes.includes(id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'settings-file-type-remove';
        remove.dataset.marklyraFileRemove = id;
        remove.title = `删除 .${id} 自定义文件类型`;
        remove.setAttribute('aria-label', remove.title);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 20 20');
        icon.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8v6M12 8v6');
        icon.append(path);
        remove.append(icon);
        remove.addEventListener('click', () => controls.remove(id));
        row.append(remove);
      }
      row.append(toggle);
      grid.append(row);
    }
    const toggle = row.querySelector('input');
    if (toggle) {
      toggle.checked = fileTypeEnabled(id, settings);
      toggle.dataset.marklyraLastType = String(
        !!id && toggle.checked && enabledSuffixes.length === 1,
      );
      toggle.disabled = toggle.disabled || toggle.dataset.marklyraLastType === 'true';
      toggle.title =
        toggle.dataset.marklyraLastType === 'true' ? '至少保留一种可新建的文件类型' : '';
    }
  }
}
