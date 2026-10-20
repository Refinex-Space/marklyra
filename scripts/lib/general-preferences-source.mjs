import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'),
);

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

const property = (node, name) => node?.properties?.find((item) => item.key?.name === name)?.value;
const isElement = (node, name) =>
  node?.type === 'CallExpression' &&
  node.callee?.property?.name === 'createElement' &&
  node.arguments[0]?.object?.name === 'b' &&
  node.arguments[0]?.property?.name === name;

/** Reuse supported control handlers; licensing checks and bundled notices are untouched. */
export function generalPreferencesEdits(source, ast) {
  const panels = [];
  walk(ast, (node) => {
    if (
      isElement(node, 'o') &&
      node.arguments[2]?.callee?.object?.type === 'ThisExpression' &&
      node.arguments[2].callee.property?.name === 'panelHeader' &&
      node.arguments[2].arguments[0]?.value === 'General'
    )
      panels.push(node);
  });
  if (panels.length !== 1) throw new Error('Unexpected original General panel');
  const panel = panels[0];
  const groups = new Map();
  walk(panel, (node) => {
    if (isElement(node, 'k')) groups.set(property(node.arguments[1], 'title')?.value, node);
  });
  const language = groups.get('Language')?.arguments[2];
  const quit = groups.get('Quit')?.arguments[2];
  const shortcuts = groups.get('Shortcut Keys')?.arguments[2]?.arguments[2];
  const update = groups.get('Update');
  const check = update?.arguments[2]?.arguments[2];
  const automatic = update?.arguments[3];
  const advanced = groups.get('Advanced Settings');
  const system = groups.get('System Integration');
  if (
    panel.arguments.length !== 12 ||
    !language ||
    !quit ||
    !shortcuts ||
    !check ||
    !automatic ||
    !advanced ||
    !system ||
    panel.arguments[6]?.name !== 'e'
  )
    throw new Error('Unexpected original General controls');
  const code = (node) => source.slice(node.start, node.end);
  const element = (tag, props, ...children) =>
    `p.a.createElement(${JSON.stringify(tag)},${JSON.stringify(props)},${children.join(',')})`;
  const text = (value) => JSON.stringify(value);
  const group = (title, keywords, ...children) =>
    `p.a.createElement(b.k,${JSON.stringify({ title, keyWords: keywords })},${children.join(',')})`;
  const behavior = group(
    '应用偏好',
    ['Language', '语言', 'Quit', '退出', 'Shortcut Keys', '快捷键', 'Enable Debug', '调试'],
    `p.a.createElement(b.v,{rows:[["界面语言",${code(language)}],["快捷键",${code(shortcuts)}]]})`,
    `window.isMac?${code(quit)}:null`,
    'p.a.createElement(b.c,{keyName:"debugMode",label:"Enable Debug",checked:!!this.getValue("debugMode"),onChange:this.onChange,hint:"开启后可检查应用界面、控制台和网络请求。macOS：⌘⌥I（Command + Option + I）；Windows：Ctrl + Shift + I。关闭后停用调试入口；Windows 已打开的面板请手动关闭。"})',
    code(advanced.arguments[4]),
    `window.isWin?p.a.createElement(p.a.Fragment,null,${system.arguments.slice(2).map(code).join(',')}):null`,
  );
  const brand = element(
    'div',
    { className: 'settings-about-brand' },
    element(
      'div',
      null,
      element('span', { className: 'settings-about-eyebrow' }, text('为写作，保持自由')),
      element('h2', null, text('MarkLyra')),
      element(
        'p',
        { className: 'settings-about-tagline' },
        element('span', null, text('永久免费 · 开放源代码')),
        element(
          'button',
          {
            type: 'button',
            className: 'settings-about-github',
            'data-marklyra-open-repository': 'true',
            title: 'GitHub · Refinex-Space/marklyra',
            'aria-label': '打开 MarkLyra GitHub 仓库',
          },
          element(
            'span',
            { className: 'icon icon-github-circled', 'aria-hidden': 'true' },
            text(''),
          ),
        ),
      ),
    ),
    element('span', { className: 'settings-about-license' }, text('Apache 2.0')),
  );
  const release = element(
    'div',
    { className: 'row settings-about-version' },
    element('span', null, text('当前版本 '), element('strong', null, text(version))),
    element(
      'button',
      { type: 'button', className: 'btn btn-default', 'data-marklyra-update-check': 'true' },
      text('检查更新'),
    ),
  );
  const about = group(
    '关于 MarkLyra',
    ['MarkLyra', 'GitHub', '仓库', '版本', '更新', '开源', '免费', 'Apache', 'License', '许可'],
    brand,
    release,
    code(automatic),
    element(
      'p',
      { className: 'settings-about-legal' },
      text('MarkLyra 自有代码采用 Apache 2.0；第三方组件遵循各自许可。'),
    ),
  );
  return [
    {
      start: panel.start,
      end: panel.end,
      text:
        `p.a.createElement(b.o,${code(panel.arguments[1])},${code(panel.arguments[2])},` +
        `${element('div', { className: 'settings-general-preferences' }, behavior)},` +
        `${element('div', { className: 'settings-general-about' }, about)})`,
    },
  ];
}
