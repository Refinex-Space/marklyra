import { setupBoundedSelect } from './bounded-select.js';
import { type FileTypePageControls, renderFileTypes } from './file-types-page.js';
import { renderSavePreferences, type SavePageControls } from './save-preferences-page.js';
import css from './settings-page.css?inline';
import themeCss from './settings-theme.css?inline';
import { renderTreePreferences, type TreePageControls } from './tree-preferences-page.js';

const summaries: Record<string, string> = {
  文件: '启动、保存与文档管理',
  编辑器: '编辑体验与输入行为',
  图像: '插入图片与本地存储',
  Markdown: '语法、排版与文档格式',
  导出: '输出格式与文档样式',
  外观: '主题、字体与界面显示',
  通用: '应用行为与系统集成',
};

export function presentSettingsPage(value: unknown) {
  if (
    !document.documentElement.hasAttribute('data-settings-page') ||
    !value ||
    typeof value !== 'object'
  )
    return;
  const input = value as Record<string, unknown>;
  const root = document.documentElement;
  root.dataset.settingsDark = String(input.dark === true);
  if (typeof input.sidebarWidth === 'number' && Number.isFinite(input.sidebarWidth))
    root.style.setProperty(
      '--settings-sidebar-width',
      `${Math.max(200, Math.min(440, input.sidebarWidth))}px`,
    );
  if (typeof input.sidebarBackground === 'string' && CSS.supports('color', input.sidebarBackground))
    root.style.setProperty('--settings-sidebar-bg', input.sidebarBackground);
}

export function setupSettingsPage(
  close: () => void,
  fileTypes?: FileTypePageControls & SavePageControls & TreePageControls,
) {
  if (new URL(location.href).searchParams.get('layout') !== 'page') return;
  document.documentElement.dataset.settingsPage = 'true';
  const style = document.createElement('style');
  style.textContent = themeCss + css;
  document.head.append(style);
  positionHelpTooltips();
  const refreshBoundedSelect = setupBoundedSelect(
    'select[data-marklyra-preference="defaultCodeLang"]',
  );
  document.addEventListener('keydown', (event) => {
    const item =
      event.target instanceof HTMLElement && event.target.closest<HTMLElement>('.nav-group-item');
    if (item && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      item.click();
    }
  });
  const observer = new ResizeObserver(() => requestAnimationFrame(() => arrangeHints(document)));
  const refresh = () => {
    const sidebar = document.querySelector('.pane-sm.sidebar');
    const searchRow = sidebar?.querySelector('.list-group-header');
    const pane = document.querySelector('.pane-group > .pane');
    if (!sidebar || !searchRow || !pane) return;
    observer.observe(pane);
    sidebar.setAttribute('aria-label', '设置导航');
    sidebar.setAttribute('role', 'navigation');
    if (!sidebar.querySelector('.settings-back')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'settings-back';
      back.title = '返回应用';
      back.setAttribute('aria-label', '返回应用');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.classList.add('settings-back-arrow');
      icon.setAttribute('viewBox', '0 0 20 20');
      icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M10 4 4 10l6 6M4 10h12');
      icon.append(path);
      back.append(icon, document.createTextNode('返回应用'));
      back.addEventListener('click', close);
      sidebar.prepend(back);
      const search = searchRow.querySelector<HTMLInputElement>('input');
      if (search) {
        search.placeholder = '搜索设置';
        search.setAttribute('aria-label', '搜索设置');
        back.focus({ preventScroll: true });
      }
    }
    let heading = pane.querySelector<HTMLElement>('.settings-page-heading');
    if (!heading) {
      heading = document.createElement('header');
      heading.className = 'settings-page-heading';
      heading.append(document.createElement('h1'), document.createElement('p'));
      pane.prepend(heading);
    }
    const search = sidebar.querySelector<HTMLInputElement>('.search-input')?.value.trim();
    const title = search
      ? '搜索结果'
      : sidebar.querySelector('.nav-group-item.active')?.textContent?.trim() || '设置';
    const noResults =
      pane.querySelector('.content:not([data-index])')?.classList.contains('display-none') ===
      false;
    const subtitle = search
      ? noResults
        ? '没有找到匹配的设置，请尝试其他关键词。'
        : `与“${search}”相关的设置`
      : summaries[title] || '';
    const headingTitle = heading.children[0];
    const headingSubtitle = heading.children[1];
    if (headingTitle && headingTitle.textContent !== title) headingTitle.textContent = title;
    if (headingSubtitle && headingSubtitle.textContent !== subtitle)
      headingSubtitle.textContent = subtitle;
    for (const item of sidebar.querySelectorAll<HTMLElement>('.nav-group-item')) {
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.setAttribute('aria-current', item.classList.contains('active') ? 'page' : 'false');
    }
    for (const hint of pane.querySelectorAll('.panel-content-hint, .input-group-header-hint')) {
      hint.classList.toggle(
        'settings-deferred-hint',
        /重启|重新启动|restart|relaunch/i.test(hint.textContent || ''),
      );
    }
    adaptHostPlatform(pane);
    arrangeFileGroups(pane);
    if (fileTypes) {
      renderFileTypes(pane, fileTypes);
      renderSavePreferences(pane, fileTypes);
      renderTreePreferences(pane, fileTypes);
    }
    arrangeEditingGroups(pane);
    arrangeIndentControls(pane);
    pane
      .querySelector('[data-marklyra-preference="zoomFactor"]')
      ?.closest('tr')
      ?.classList.add('settings-zoom-row');
    pane
      .querySelector('[data-marklyra-theme-action="open-theme-folder"]')
      ?.closest('.row')
      ?.classList.add('settings-theme-actions');
    for (const row of pane.querySelectorAll('tr')) {
      if (row.querySelector('td:first-child > .checkbox.row'))
        row.classList.add('settings-table-toggle');
    }
    for (const select of pane.querySelectorAll('select')) {
      for (const option of select.options) {
        const id = option.value.replace(/\.css$/, '');
        const name =
          id === 'marklyra-light'
            ? 'MarkLyra Light'
            : id === 'marklyra-dark'
              ? 'MarkLyra Dark'
              : null;
        if (name && option.textContent !== name) option.textContent = name;
      }
      const row = select.parentElement;
      if (!row?.classList.contains('row')) continue;
      row.classList.add('settings-select-row');
      if (!row.querySelector('.settings-select-chevron')) {
        const arrow = document.createElement('span');
        arrow.className = 'icon icon-down-open settings-select-chevron';
        arrow.setAttribute('aria-hidden', 'true');
        row.append(arrow);
      }
    }
    arrangeHints(pane);
    refreshBoundedSelect();
  };
  document.addEventListener('input', (event) => {
    if (event.target instanceof Element && event.target.matches('.search-input'))
      queueMicrotask(refresh);
  });
  observer.observe(document.documentElement);
  document.fonts.ready.then(refresh);
  return refresh;
}

const windowsText: readonly [string, string][] = [
  ['( ⌘C )', '(Ctrl+C)'],
  ['按住 Command', '按住 Ctrl'],
];

/** The page is always the cocoa personality; only genuine Windows differences are adapted. */
function adaptHostPlatform(pane: Element) {
  if (new URL(location.href).searchParams.get('hostOs') !== 'win') return;
  // Windows closes the application with its last window; that macOS policy has no meaning here.
  pane
    .querySelector('[data-marklyra-preference="quitAfterWindowClose"]')
    ?.closest<HTMLElement>('.checkbox.row')
    ?.classList.add('settings-platform-hidden');
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let text = node.nodeValue ?? '';
    for (const [from, to] of windowsText) text = text.replace(from, to);
    if (text !== node.nodeValue) node.nodeValue = text;
  }
}

// Keep the original controls in their React-owned parents. Visual grouping uses
// ordering and adjoining borders, so conditional controls and save handlers survive.
function arrangeFileGroups(pane: Element) {
  const startup = pane.querySelector('[data-marklyra-preference="restoreWhenLaunch"]');
  const content = startup?.closest<HTMLElement>('.content');
  if (!content) return;
  content.classList.add('settings-file-content');
  const sections = [
    { title: '启动与新建', keys: ['restoreWhenLaunch', 'defaultExtension'] },
    {
      title: '文档与记录',
      keys: ['save_file_on_switch', 'noRecentFiles'],
    },
    { title: '拖放行为', keys: ['actionWhenDropFolder'] },
  ];
  let order = 0;
  for (const section of sections) {
    section.keys.forEach((key, index) => {
      const group = content
        .querySelector(`[data-marklyra-preference="${key}"]`)
        ?.closest<HTMLElement>('.input-group');
      if (!group) return;
      group.classList.add('settings-card-part');
      group.classList.toggle('settings-card-start', index === 0);
      group.classList.toggle('settings-card-end', index === section.keys.length - 1);
      group.dataset.sectionTitle = section.title;
      group.style.order = String(order++ * 10);
      if (['restoreWhenLaunch', 'defaultExtension'].includes(key)) {
        group.classList.add('settings-inline-setting');
      } else {
        group.classList.add('settings-labelled-rows');
      }
    });
  }
}

function arrangeHints(pane: ParentNode) {
  for (const hint of pane.querySelectorAll<HTMLElement>('.label-hint')) {
    const row = hint.parentElement;
    if (!row) continue;
    const label = row.matches('.checkbox')
      ? row.querySelector('label')
      : row.matches('tr')
        ? row.querySelector('td label') || row.querySelector('td')
        : row.closest('.input-group')?.querySelector('.input-group-header-title');
    if (!label || !hint.getClientRects().length) continue;
    // An inline slot reserves room beside the label, including wrapped labels.
    let slot = label.querySelector<HTMLElement>(':scope > .settings-hint-slot');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'settings-hint-slot';
      slot.setAttribute('aria-hidden', 'true');
      label.append(slot);
    }
    const group = hint.closest<HTMLElement>('.input-group');
    if (!group) continue;
    group.classList.add('settings-has-hints');
    hint.classList.add('settings-inline-hint');
    const anchor = slot.getBoundingClientRect();
    const origin = hint.offsetParent?.getBoundingClientRect();
    if (!origin) continue;
    hint.style.left = `${anchor.left - origin.left + 4}px`;
    hint.style.top = `${anchor.top - origin.top + (anchor.height - 16) / 2}px`;
    if (!hint.hasAttribute('tabindex')) {
      hint.tabIndex = 0;
      hint.setAttribute(
        'aria-label',
        settingsHelpText(hint) || hint.getAttribute('hint') || '查看说明',
      );
    }
  }
}

function arrangeEditingGroups(pane: Element) {
  const keys = ['no_pairing_match', 'noEmojiAutoComplete', 'auto_expand_block'];
  keys.forEach((key, index) => {
    const group = pane
      .querySelector(`[data-marklyra-preference="${key}"]`)
      ?.closest<HTMLElement>('.input-group');
    if (!group) return;
    group.classList.add('settings-card-part', 'settings-labelled-rows');
    group.classList.toggle('settings-card-start', index === 0);
    group.classList.toggle('settings-card-end', index === keys.length - 1);
    group.dataset.sectionTitle = '输入与编辑';
  });
}

function arrangeIndentControls(pane: Element) {
  for (const select of pane.querySelectorAll<HTMLSelectElement>(
    'select[data-marklyra-preference="indentSize"]',
  )) {
    const group = select.closest('.input-group');
    const cell = select.parentElement;
    if (!group || !cell) continue;
    group.classList.add('settings-indent-group');
    cell.classList.add('settings-indent-size');
    select.setAttribute('aria-label', '缩进宽度');
    if (!cell.querySelector('.settings-indent-label')) {
      const label = document.createElement('span');
      label.className = 'settings-indent-label';
      label.textContent = '缩进宽度';
      label.setAttribute('aria-hidden', 'true');
      cell.prepend(label);
    }
  }
}

function settingsHelpText(hint: HTMLElement) {
  if (hint.closest('.checkbox')?.querySelector('[data-marklyra-preference="noDisplayLinesInMath"]'))
    return (
      '开启后，可在普通公式中用 \\\\ 或 \\newline 分行显示；使用 align、matrix 等环境的公式仍按自身规则排版。\n' +
      '关闭后不再自动处理普通公式的换行。\n' +
      '修改后在新建窗口或重启应用后生效。'
    );
  if (hint.closest('tr')?.querySelector('[data-marklyra-preference="auto_numbering_for_math"]'))
    return (
      '可选择不自动编号、使用 AMS 编号规则，或为所有块级公式自动编号。\n' +
      'AMS 规则只为 equation、align 等支持编号的公式环境添加序号。\n' +
      '自动编号只影响公式显示，不会向 Markdown 原文写入序号。\n' +
      '修改后在新建窗口或重启应用后生效。'
    );
  if (hint.closest('.checkbox')?.querySelector('[data-marklyra-preference="noRecentFiles"]'))
    return (
      '开启后记录最近使用的文件和文件夹，便于再次打开。\n' +
      '关闭后停止新增记录，并隐藏最近记录；固定的文件夹仍可访问。\n' +
      '关闭开关不会清除已有历史。需要清除时，请使用“清除历史文件记录”，原文档不会删除。'
    );
  if (hint.closest('tr')?.querySelector('[data-marklyra-preference="strict_mode"]'))
    return (
      '开启后按更严格的规则解析标题和列表。\n' +
      '例如，# 标题 会识别为标题，#标题 会保留为普通文本；列表的嵌套和续行会按标记宽度检查缩进。\n' +
      '关闭后兼容较宽松的标题与列表写法。\n' +
      '修改后在新建窗口或重启应用后生效。'
    );
  if (!hint.closest('.checkbox')?.querySelector('[data-marklyra-preference="autoEscapeImageURL"]'))
    return null;
  return (
    'URL 转义会对空格、中文等字符进行编码。\n' +
    '例如，img/example file.png 会转为 img/example%20file.png，其中 %20 表示空格。\n' +
    '开启后与其他 Markdown 引擎的兼容性更好；关闭后路径更易阅读。'
  );
}

function positionHelpTooltips() {
  const tooltip = document.getElementById('ty-tooltip');
  if (!tooltip) return;
  let anchor: HTMLElement | null = null;
  let frame = 0;
  const position = () => {
    frame = 0;
    if (!anchor?.isConnected || !tooltip.classList.contains('shown')) return;
    const description = settingsHelpText(anchor);
    if (description && tooltip.textContent !== description) tooltip.textContent = description;
    const target = anchor.getBoundingClientRect();
    // The original tooltip writes both left and right; clear its old right edge
    // before measuring, otherwise repositioning can squeeze the text to one column.
    tooltip.style.right = 'auto';
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(target.left, window.innerWidth - box.width - 8));
    const below = target.bottom + 8;
    const top =
      below + box.height <= window.innerHeight - 8
        ? below
        : Math.max(8, target.top - box.height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(position);
  };
  document.addEventListener('mouseover', (event) => {
    if (!(event.target instanceof Element)) return;
    anchor = event.target.closest<HTMLElement>('.label-hint');
    if (anchor) schedule();
  });
  new MutationObserver(schedule).observe(tooltip, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
}
