import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

interface SitesMockOptions {
  seed?: boolean;
  delay?: number;
  /** `open_external_link` rejects with this message. */
  openFails?: string;
  /** Vite's saved icon is an SVG without a namespace, which an <img> cannot decode. */
  brokenIcon?: boolean;
}

/** In-memory stand-in for the Rust site store: same wire format, revision checks and rules. */
function installSitesMock(options: SitesMockOptions) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  type Group = {
    id: string;
    name: string;
    color: string;
    parent: string | null;
    order: number;
    collapsed: boolean;
    created: string;
    revision: string;
  };
  type Site = {
    id: string;
    url: string;
    title: string;
    description: string;
    group: string | null;
    order: number;
    pinned: boolean;
    icon: null;
    manual: string[];
    created: string;
    fetched: null;
    revision: string;
  };
  const state = {
    generation: 1,
    rev: 1,
    id: 1,
    present: false,
    groups: [] as Group[],
    items: [] as Site[],
    recent: [] as string[],
  };
  const mock = { calls: [] as { command: string; args: unknown }[], opened: [] as string[], state };
  Reflect.set(window, '__sitesMock', mock);
  const revision = () => `r${++state.rev}`;
  const newId = () => `id${String(++state.id).padStart(6, '0')}`;
  const addGroup = (name: string, color: string, parent: string | null = null) => {
    const group: Group = {
      id: newId(),
      name,
      color,
      parent,
      order: state.groups.filter((g) => g.parent === parent).length + 1,
      collapsed: false,
      created: '2026-11-16T00:00:00Z',
      revision: revision(),
    };
    state.groups.push(group);
    state.present = true;
    return group;
  };
  const addSite = (
    url: string,
    title: string,
    group: string | null,
    description = '',
    pinned = false,
  ) => {
    const site: Site = {
      id: newId(),
      url,
      title,
      description,
      group,
      order: state.items.filter((s) => s.group === group).length + 1,
      pinned,
      icon: null,
      manual: [],
      created: '2026-11-16T00:00:00Z',
      fetched: null,
      revision: revision(),
    };
    state.items.push(site);
    state.present = true;
    return site;
  };
  if (options.seed) {
    const dev = addGroup('开发工具', 'blue');
    const docs = addGroup('文档', 'indigo', dev.id);
    const read = addGroup('阅读', 'amber');
    addSite('https://vitejs.dev/', 'Vite', dev.id, '下一代的前端工具链', true);
    addSite('https://tauri.app/', 'Tauri', dev.id, '用 Web 前端构建桌面应用');
    addSite('https://developer.mozilla.org/', 'MDN Web Docs', docs.id, 'Web 技术文档');
    addSite('https://sspai.com/', '少数派', read.id, '高效工作，品质生活');
    addSite('https://excalidraw.com/', 'excalidraw', null, '手绘风格的在线白板');
  }
  const normalize = (value: string) => {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw '[invalid] 网址格式不正确';
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw '[invalid] 仅支持 http 或 https 网址';
    return url.href;
  };
  const view = () => {
    const known = new Set(state.groups.map((g) => g.id));
    const roots = new Map(state.groups.map((g) => [g.id, g.parent]));
    return {
      generation: state.generation,
      present: state.present,
      groups: state.groups
        .map((g) => ({ ...g, parent: g.parent && roots.get(g.parent) === null ? g.parent : null }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      items: state.items
        .map((s) => ({ ...s, group: s.group && known.has(s.group) ? s.group : null }))
        .sort((a, b) => a.order - b.order),
      invalid: [],
      truncated: false,
    };
  };
  const mutate = (m: Record<string, unknown> & { kind: string }) => {
    const result = {
      generation: 0,
      applied: [] as string[],
      conflicts: [] as string[],
      created: [] as string[],
    };
    const group = (id: unknown) => {
      const g = state.groups.find((x) => x.id === id);
      if (!g) throw '[not-found] 找不到分组';
      return g;
    };
    const site = (id: unknown) => {
      const s = state.items.find((x) => x.id === id);
      if (!s) throw '[not-found] 找不到站点';
      return s;
    };
    switch (m.kind) {
      case 'addGroup': {
        const name = String(m.name).trim();
        if (!name) throw '[invalid] 分组名称不能为空';
        const g = addGroup(name, String(m.color ?? 'gray'), (m.parent as string | null) ?? null);
        result.created.push(g.id);
        result.applied.push(g.id);
        break;
      }
      case 'updateGroup': {
        const g = group(m.id);
        if (g.revision !== m.revision) {
          result.conflicts.push(g.id);
          break;
        }
        Object.assign(g, m.set as object, { revision: revision() });
        result.applied.push(g.id);
        break;
      }
      case 'removeGroup': {
        const g = group(m.id);
        if (g.revision !== m.revision) {
          result.conflicts.push(g.id);
          break;
        }
        const doomed = [g.id, ...state.groups.filter((x) => x.parent === g.id).map((x) => x.id)];
        if (m.items === 'delete')
          state.items = state.items.filter((s) => !s.group || !doomed.includes(s.group));
        else for (const s of state.items) if (s.group && doomed.includes(s.group)) s.group = null;
        state.groups = state.groups.filter((x) => !doomed.includes(x.id));
        result.applied.push(g.id);
        break;
      }
      case 'reorderGroups': {
        (m.ids as string[]).forEach((id, index) => {
          const g = group(id);
          g.order = index + 1;
          g.revision = revision();
          result.applied.push(id);
        });
        break;
      }
      case 'addItem': {
        const url = normalize(String(m.url));
        const s = addSite(
          url,
          String(m.title ?? '').trim() || new URL(url).hostname,
          (m.group as string | null) ?? null,
          String(m.description ?? ''),
          m.pinned === true,
        );
        s.manual = (m.manual as string[] | undefined) ?? [];
        result.created.push(s.id);
        result.applied.push(s.id);
        break;
      }
      case 'updateItem': {
        const s = site(m.id);
        if (s.revision !== m.revision) {
          result.conflicts.push(s.id);
          break;
        }
        const set = { ...(m.set as Record<string, unknown>) };
        if (typeof set.url === 'string') set.url = normalize(set.url);
        Object.assign(s, set, { revision: revision() });
        result.applied.push(s.id);
        break;
      }
      case 'moveItems': {
        const ids = m.ids as string[];
        const revs = m.revisions as string[];
        ids.forEach((id, i) => {
          const s = site(id);
          if (s.revision !== revs[i]) {
            result.conflicts.push(id);
            return;
          }
          s.group = (m.group as string | null) ?? null;
          s.order =
            Math.max(0, ...state.items.filter((x) => x.group === s.group).map((x) => x.order)) + 1;
          s.revision = revision();
          result.applied.push(id);
        });
        break;
      }
      case 'removeItems': {
        const ids = m.ids as string[];
        const revs = m.revisions as string[];
        ids.forEach((id, i) => {
          const s = site(id);
          if (s.revision !== revs[i]) result.conflicts.push(id);
          else {
            state.items = state.items.filter((x) => x.id !== id);
            result.applied.push(id);
          }
        });
        break;
      }
      default:
        throw '[invalid] 未知操作';
    }
    state.generation += 1;
    result.generation = state.generation;
    return result;
  };
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'open_external_link') {
      mock.calls.push({ command, args });
      if (options.openFails) throw options.openFails;
      mock.opened.push(String(args.url));
      return;
    }
    if (!command.startsWith('sites_')) return previous(command, args);
    mock.calls.push({ command, args });
    if (command === 'sites_snapshot') {
      if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
      return view();
    }
    if (command === 'sites_mutate') return mutate(args.mutation as never);
    if (command === 'sites_preview') {
      return { title: '预览标题', description: '预览描述', iconDataUrl: null };
    }
    if (command === 'sites_enrich' || command === 'sites_refetch') return;
    if (command === 'sites_set_icon') {
      return {
        generation: state.generation,
        applied: [String(args.id)],
        conflicts: [],
        created: [],
      };
    }
    if (command === 'sites_icon' && options.brokenIcon) {
      return { mime: 'image/svg+xml', base64: btoa('<svg><rect width="4" height="4"/></svg>') };
    }
    if (command === 'sites_icon' || command === 'sites_engine_icon') {
      throw 'no icon in the browser stand-in';
    }
    if (command === 'sites_recent') {
      return state.recent.map((id) => ({ id, at: '2026-11-16T00:00:00Z' }));
    }
    if (command === 'sites_record_open') {
      const id = String(args.id);
      state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 20);
      return state.recent.map((item) => ({ id: item, at: '2026-11-16T00:00:00Z' }));
    }
    throw `unknown command ${command}`;
  };
}

type SitesMock = { opened: string[]; calls: { command: string; args: Record<string, unknown> }[] };
const mockOf = (page: Page) =>
  page.evaluate(() => {
    const m = Reflect.get(window, '__sitesMock') as SitesMock;
    return { opened: [...m.opened], calls: m.calls.map((c) => ({ ...c })) };
  });

async function setup(page: Page, options: SitesMockOptions = { seed: true }, folder = true) {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installSitesMock, options);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, '# 文档\n\n正文\n');
  if (folder) {
    await emitLayoutMenu(page, 'open-folder');
    await expect(entry(page)).toBeEnabled();
  }
}
const entry = (page: Page) => page.getByRole('button', { name: '站点导航', exact: true }).first();
const workbench = (page: Page) => page.locator('.site-workbench');
const search = (page: Page) => page.getByRole('combobox', { name: '搜索或输入网址' });
const nav = (page: Page) => page.getByRole('navigation', { name: '站点分组' });
const card = (page: Page, title: string) =>
  page.locator('.site-card', { has: page.locator('.site-card-title', { hasText: title }) });

test('the entry is on by default, waits for a folder, and the page replaces the document card and sidebar', async ({
  page,
}) => {
  await setup(page, { seed: true }, false);
  await expect(entry(page)).toBeDisabled();
  await emitLayoutMenu(page, 'open-folder');
  await expect(entry(page)).toBeEnabled();
  await entry(page).click();
  await expect(workbench(page)).toBeVisible();
  await expect(entry(page)).toHaveAttribute('aria-pressed', 'true');
  // The search box is where typing starts.
  await expect(search(page)).toBeFocused();
  // The file tree is replaced by the groups, not unmounted.
  await expect(nav(page)).toBeVisible();
  await expect(nav(page).getByRole('button', { name: /全部站点/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.sidebar[data-sites]')).toHaveCount(1);
  await expect(
    page.locator('.sidebar .workspace-navigation:visible, .sidebar .directory-tree:visible'),
  ).toHaveCount(0);
  // The editor cannot be typed into while the page covers it.
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  // Escape leaves, and the tree and the editor come back.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(workbench(page)).toHaveCount(0);
  await expect(page.locator('.sidebar[data-sites]')).toHaveCount(0);
  await expect(page.locator('.runtime-editor-mount')).not.toHaveAttribute('inert', '');
});

test('turning the setting off removes the entry and leaves the page; the saved sites stay', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await expect(workbench(page)).toBeVisible();
  await emitLayoutMenu(page, 'preferences');
  const settings = page.frameLocator('.runtime-preferences-frame');
  await settings.getByRole('button', { name: '站点导航', exact: true }).click();
  const panel = page.getByRole('region', { name: '站点导航设置' });
  await expect(panel.getByRole('heading', { name: '站点导航' })).toBeVisible();
  const toggle = panel.getByRole('switch', { name: '在标题栏显示站点导航' });
  await expect(toggle).toBeChecked();
  // The other settings follow the switch.
  await toggle.uncheck({ force: true });
  await expect(panel.getByRole('switch', { name: '在搜索框下方显示常用站点' })).toBeDisabled();
  // The titlebar shows no page controls while settings are open; leave, then look for the entry.
  await settings.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(workbench(page)).toHaveCount(0);
  await expect(entry(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '知识图谱', exact: true }).first()).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}'),
  );
  expect(stored.sites.enabled).toBe(false);
  // No site was touched.
  const writes = (await mockOf(page)).calls.filter((c) => c.command === 'sites_mutate');
  expect(writes).toHaveLength(0);
  await emitLayoutMenu(page, 'preferences');
  await settings.getByRole('button', { name: '站点导航', exact: true }).click();
  await panel.getByRole('switch', { name: '在标题栏显示站点导航' }).check({ force: true });
  await settings.getByRole('button', { name: '返回应用', exact: true }).click();
  await expect(entry(page)).toBeVisible();
});

test('a stored preference of "off" never shows the entry', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('marklyra-preferences-v1', JSON.stringify({ sites: { enabled: false } })),
  );
  await setup(page, { seed: true }, false);
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.getByRole('button', { name: '知识图谱', exact: true }).first()).toBeEnabled();
  await expect(entry(page)).toHaveCount(0);
});

test('groups list their sites; counts include sub-groups; ungrouped sites have their own entry', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await expect(card(page, 'Vite')).toBeVisible();
  const dev = nav(page).getByRole('button', { name: /^开发工具/ });
  await expect(dev.locator('.site-nav-count')).toHaveText('3');
  await expect(
    nav(page).getByRole('button', { name: /^文档/ }).locator('.site-nav-count'),
  ).toHaveText('1');
  await expect(
    nav(page)
      .getByRole('button', { name: /^未分组/ })
      .locator('.site-nav-count'),
  ).toHaveText('1');
  await dev.click();
  await expect(dev).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('开发工具');
  // Its own sites, then the sub-group's.
  await expect(page.locator('.site-card-title')).toHaveText(['Vite', 'Tauri', 'MDN Web Docs']);
  await expect(page.getByRole('heading', { name: /文档/, level: 3 })).toBeVisible();
  await nav(page)
    .getByRole('button', { name: /^未分组/ })
    .click();
  await expect(page.locator('.site-card-title')).toHaveText(['excalidraw']);
  // Collapsing hides the sub-group row only.
  await page.getByRole('button', { name: '折叠「开发工具」' }).click();
  await expect(nav(page).getByRole('button', { name: /^文档/ })).toHaveCount(0);
  await expect(dev).toBeVisible();
});

test('opening a card hands its address to the system browser and records it as recent', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await card(page, 'Tauri').locator('.site-card-main').click();
  expect((await mockOf(page)).opened).toEqual(['https://tauri.app/']);
  await nav(page)
    .getByRole('button', { name: /^最近打开/ })
    .click();
  await expect(page.locator('.site-card-title')).toHaveText(['Tauri']);
});

test('a failed open is reported under the search box instead of being swallowed', async ({
  page,
}) => {
  await setup(page, { seed: true, openFails: '[io] 无法打开外部链接：fixture' });
  await entry(page).click();
  await card(page, 'Vite').locator('.site-card-main').click();
  await expect(page.locator('.site-search-error')).toContainText('无法打开外部链接');
});

test('search: Enter opens an address, searches with the default engine, and ⌘Enter forces a search', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await search(page).fill('github.com');
  await search(page).press('ArrowDown');
  await search(page).press('ArrowUp');
  // No saved site matches, so the address row leads and Enter opens it.
  await expect(page.getByRole('option', { name: /打开 github\.com/ })).toBeVisible();
  await search(page).press('Enter');
  await search(page).fill('rust tauri 插件');
  await search(page).press('Enter');
  await search(page).fill('node.js');
  await search(page).press('Control+Enter');
  expect((await mockOf(page)).opened).toEqual([
    'https://github.com/',
    'https://www.bing.com/search?q=rust%20tauri%20%E6%8F%92%E4%BB%B6',
    'https://www.bing.com/search?q=node.js',
  ]);
  // A search that was opened clears the box.
  await expect(search(page)).toHaveValue('');
});

test('search: Tab and the engine menu change the engine for one search; a keyword picks it inline', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await expect(search(page)).toHaveAttribute('placeholder', /必应/);
  await search(page).press('Tab');
  await expect(search(page)).toHaveAttribute('placeholder', /Google/);
  await search(page).fill('serde');
  await search(page).press('Enter');
  // Back on the default afterwards.
  await expect(search(page)).toHaveAttribute('placeholder', /必应/);
  await page.getByRole('button', { name: /搜索引擎：必应/ }).click();
  await page.getByRole('menuitem', { name: /Google/ }).click();
  await expect(search(page)).toHaveAttribute('placeholder', /Google/);
  await search(page).press('Tab');
  await expect(search(page)).toHaveAttribute('placeholder', /必应/);
  await search(page).fill('g clap derive');
  await search(page).press('Enter');
  expect((await mockOf(page)).opened).toEqual([
    'https://www.google.com/search?q=serde',
    'https://www.google.com/search?q=clap%20derive',
  ]);
});

test('search: saved sites are offered first and Enter opens the highlighted one', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await search(page).fill('少数');
  await expect(page.getByRole('option').first()).toContainText('少数派');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('option').last()).toContainText('用必应搜索');
  await search(page).press('Enter');
  expect((await mockOf(page)).opened).toEqual(['https://sspai.com/']);
});

test('search: Enter while an input method composes only commits the candidate', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await search(page).focus();
  const cdp = await page
    .context()
    .newCDPSession(page)
    .catch(() => null);
  // Chromium can drive a real composition; WebKit falls back to composition events.
  if (cdp) {
    await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await expect(page.getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Enter');
    expect((await mockOf(page)).opened).toEqual([]);
    await cdp.send('Input.insertText', { text: '你好' });
  } else {
    await search(page).evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart'));
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      );
    });
    expect((await mockOf(page)).opened).toEqual([]);
    await search(page).fill('你好');
  }
  await expect(search(page)).toHaveValue('你好');
  await search(page).press('Enter');
  expect((await mockOf(page)).opened).toHaveLength(1);
});

test('adding a site: validates the address, warns about a duplicate, and lands in the chosen group', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await nav(page).getByRole('button', { name: /^阅读/ }).click();
  await page.getByRole('button', { name: '添加站点' }).first().click();
  const dialog = page.getByRole('dialog', { name: '添加站点' });
  await expect(dialog.getByLabel('网址')).toBeFocused();
  await dialog.getByRole('button', { name: '添加' }).click();
  await expect(dialog.getByRole('alert')).toContainText('请输入有效的网址');
  await dialog.getByLabel('网址').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: '添加' }).click();
  await expect(dialog.getByRole('alert')).toContainText('请输入有效的网址');
  await dialog.getByLabel('网址').fill('https://sspai.com');
  await expect(dialog.locator('.site-note.warn')).toContainText('该网址已在「阅读」中');
  await dialog.getByLabel('网址').fill('linear.app');
  // The current group is the default.
  await expect(dialog.getByLabel('分组')).toHaveValue(/.+/);
  await dialog.getByLabel('名称').fill('Linear');
  await dialog.getByLabel('描述').fill('问题追踪');
  await dialog.getByLabel('设为常用').check();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(card(page, 'Linear')).toBeVisible();
  await expect(card(page, 'Linear').locator('.site-card-host')).toHaveText('linear.app');
  const add = (await mockOf(page)).calls.find(
    (c) => c.command === 'sites_mutate' && (c.args.mutation as { kind: string }).kind === 'addItem',
  );
  expect(add?.args.mutation).toMatchObject({
    kind: 'addItem',
    url: 'https://linear.app/',
    title: 'Linear',
    description: '问题追踪',
    pinned: true,
    manual: ['title', 'description'],
  });
  // Pinned sites also sit under the search box.
  await expect(
    page.getByRole('list', { name: '常用站点' }).getByRole('button', { name: 'Linear' }),
  ).toBeVisible();
});

test('editing, pinning, moving and deleting a site (with undo)', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await card(page, 'Tauri').hover();
  await card(page, 'Tauri')
    .getByRole('button', { name: /^编辑：Tauri/ })
    .click();
  const dialog = page.getByRole('dialog', { name: '编辑站点' });
  await dialog.getByLabel('名称').fill('Tauri 2');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(card(page, 'Tauri 2')).toBeVisible();
  await card(page, 'Tauri 2')
    .getByRole('button', { name: /^设为常用/ })
    .click({ force: true });
  await expect(card(page, 'Tauri 2').locator('.site-pinned')).toBeVisible();
  // Move through the context menu.
  await card(page, 'Tauri 2').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '移动到…' }).click();
  await page.getByRole('menuitem', { name: '阅读' }).click();
  await nav(page).getByRole('button', { name: /^阅读/ }).click();
  await expect(card(page, 'Tauri 2')).toBeVisible();
  // Delete, then take it back.
  await card(page, 'Tauri 2').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除' }).click();
  await expect(card(page, 'Tauri 2')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(card(page, 'Tauri 2')).toBeVisible();
});

test('creating, recolouring, reordering and removing groups', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await page.getByRole('button', { name: '新建分组' }).click();
  const dialog = page.getByRole('dialog', { name: '新建分组' });
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(dialog.getByRole('alert')).toContainText('请输入分组名称');
  await dialog.getByLabel('名称').fill('工具箱');
  await dialog.getByRole('radio', { name: '粉' }).check({ force: true });
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(nav(page).getByRole('button', { name: /^工具箱/ })).toBeVisible();
  // Rename and recolour from the row menu.
  await page.getByRole('button', { name: '「工具箱」的更多操作' }).click({ force: true });
  await page.getByRole('menuitem', { name: '重命名或更改颜色…' }).click();
  const edit = page.getByRole('dialog', { name: '编辑分组' });
  await edit.getByLabel('名称').fill('工具');
  await edit.getByLabel('自定义').fill('#12ab9f');
  await edit.getByRole('button', { name: '保存' }).click();
  await expect(nav(page).getByRole('button', { name: /^工具/ }).locator('.site-dot')).toHaveCSS(
    'background-color',
    'rgb(18, 171, 159)',
  );
  // Move it up past 阅读.
  const order = () =>
    nav(page)
      .locator('[data-group]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-group')));
  const before = await order();
  await page.getByRole('button', { name: '「工具」的更多操作' }).click({ force: true });
  await page.getByRole('menuitem', { name: '上移' }).click();
  await expect.poll(order).not.toEqual(before);
  // Removing a group offers both outcomes and says how many sites are involved.
  await nav(page).getByRole('button', { name: /^阅读/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除分组…' }).click();
  const remove = page.getByRole('dialog', { name: '删除分组「阅读」' });
  await expect(remove).toContainText('这个分组中有 1 个站点');
  await remove.getByRole('button', { name: '删除分组，站点移到未分组' }).click();
  await expect(nav(page).getByRole('button', { name: /^阅读/ })).toHaveCount(0);
  await nav(page)
    .getByRole('button', { name: /^未分组/ })
    .click();
  await expect(card(page, '少数派')).toBeVisible();
});

test('an empty folder offers a first site and starter groups, and reading creates nothing', async ({
  page,
}) => {
  await setup(page, {});
  await entry(page).click();
  await expect(page.getByRole('button', { name: '添加第一个站点' })).toBeVisible();
  expect((await mockOf(page)).calls.map((c) => c.command)).not.toContain('sites_mutate');
  await page.getByRole('button', { name: '创建示例分组' }).click();
  await expect(nav(page).getByRole('button', { name: /^开发/ })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: /^设计/ })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: /^阅读/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '添加第一个站点' })).toHaveCount(0);
});

test('while the sites are read, skeletons stand in with no loading text', async ({ page }) => {
  await setup(page, { seed: true, delay: 1500 });
  await entry(page).click();
  await expect(page.locator('.site-cards-skeleton')).toBeVisible();
  await expect(nav(page).getByRole('status', { name: '正在读取' })).toBeVisible();
  await expect(workbench(page)).not.toContainText('加载中');
  await expect(workbench(page)).not.toContainText('正在读取');
  await expect(card(page, 'Vite')).toBeVisible();
  await expect(page.locator('.site-cards-skeleton')).toHaveCount(0);
});

test('the list view and the pinned row follow the display choices', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await expect(page.getByRole('list', { name: '常用站点' })).toBeVisible();
  await page.getByRole('button', { name: '列表' }).click();
  await expect(page.locator('.site-row')).toHaveCount(5);
  await expect(page.locator('.site-card')).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}'),
  );
  expect(stored.sites.view).toBe('list');
});

test('cards are keyboard operable: Tab reaches the card, Enter opens it', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await card(page, 'Vite').locator('.site-card-main').focus();
  await page.keyboard.press('Enter');
  expect((await mockOf(page)).opened).toEqual(['https://vitejs.dev/']);
});

/** Contrast of an element's text against the colour actually painted behind it. */
async function paint(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const rgb = (value: string) => {
        const m = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        // rgb() channels are 0–255; color(srgb …), what color-mix() computes to, is 0–1.
        const k = value.startsWith('color(') ? 255 : 1;
        return { r: (m[0] ?? 0) * k, g: (m[1] ?? 0) * k, b: (m[2] ?? 0) * k, a: m[3] ?? 1 };
      };
      const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const c = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
      };
      // Composite every painted background from the element up to the page.
      const stack: { r: number; g: number; b: number; a: number }[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const bg = rgb(getComputedStyle(node).backgroundColor);
        if (bg.a > 0) stack.push(bg);
        if (bg.a >= 1) break;
      }
      let base = { r: 255, g: 255, b: 255 };
      for (const layer of stack.reverse())
        base = {
          r: layer.r * layer.a + base.r * (1 - layer.a),
          g: layer.g * layer.a + base.g * (1 - layer.a),
          b: layer.b * layer.a + base.b * (1 - layer.a),
        };
      const ink = rgb(getComputedStyle(el).color);
      const [hi, lo] = [lum(ink), lum(base)].sort((x, y) => y - x) as [number, number];
      return { contrast: (hi + 0.05) / (lo + 0.05), background: base };
    });
}
/** How many painted backgrounds sit between `from` and the container `until`. */
const layers = (page: Page, from: string, until: string) =>
  page
    .locator(from)
    .first()
    .evaluate((el, stop) => {
      let count = 0;
      for (let node: Element | null = el; node && !node.matches(stop); node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        const alpha = Number(value.match(/[\d.]+/g)?.[3] ?? (/^(rgb|color)\(/.test(value) ? 1 : 0));
        if (alpha > 0) count += 1;
      }
      return count;
    }, until);

for (const theme of ['marklyra-light', 'marklyra-dark'] as const) {
  test(`hovered buttons keep their own colours and readable text (${theme})`, async ({ page }) => {
    await installLayout(page, undefined, 'web');
    await page.addInitScript(installSitesMock, { seed: true });
    await readyLayout(page, theme);
    await openLayoutDocument(page, '# 文档\n\n正文\n');
    await emitLayoutMenu(page, 'open-folder');
    await entry(page).click();
    await expect(card(page, 'Vite')).toBeVisible();
    const add = '.site-head .site-btn.primary';
    const idle = await paint(page, add);
    await page.locator(add).hover();
    await page.waitForTimeout(300);
    const hovered = await paint(page, add);
    expect(hovered.contrast).toBeGreaterThanOrEqual(4.5);
    // Still the accent, not the neutral hover tint of an ordinary button.
    expect(Math.abs(hovered.background.b - idle.background.b)).toBeLessThan(40);
    await search(page).fill('vite');
    await page.locator('.site-search-go').hover();
    await page.waitForTimeout(300);
    expect((await paint(page, '.site-search-go')).contrast).toBeGreaterThanOrEqual(3);
  });
}

test('hovering the selected group keeps it selected, keeps its count and paints one background', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  const current = nav(page).getByRole('button', { name: /^全部站点/ });
  await expect(current).toHaveAttribute('aria-current', 'page');
  const label = '.site-nav [aria-current="page"] .site-nav-label';
  const idle = await paint(page, label);
  await current.hover();
  await page.waitForTimeout(300);
  const hovered = await paint(page, label);
  expect(Math.abs(hovered.background.b - idle.background.b)).toBeLessThan(12);
  await expect(current.locator('.site-nav-count')).toHaveCSS('opacity', '1');
  expect(await layers(page, label, '.site-nav-scroll')).toBe(1);
  // A hovered sub-group is one rounded highlight, not a row tint with a second one inside.
  const child = nav(page).getByRole('button', { name: /^文档/ });
  await child.hover();
  await page.waitForTimeout(300);
  expect(await layers(page, '.site-nav-row.child .site-nav-label', '.site-nav-scroll')).toBe(1);
});

test('a hovered list row is a single highlight', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await page.getByRole('button', { name: '列表' }).click();
  await page.locator('.site-row').nth(1).hover();
  await page.waitForTimeout(300);
  expect(await layers(page, '.site-row:nth-child(2) .site-row-title', '.site-list')).toBe(1);
});

test('opening the edit dialog never replaces the saved title with the fetched one', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await card(page, 'Vite').hover();
  await card(page, 'Vite')
    .getByRole('button', { name: /^编辑：Vite/ })
    .click();
  const dialog = page.getByRole('dialog', { name: '编辑站点' });
  await page.waitForTimeout(900);
  await expect(dialog.getByLabel('名称')).toHaveValue('Vite');
  await expect(dialog.getByLabel('描述')).toHaveValue('下一代的前端工具链');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog).toHaveCount(0);
  const update = (await mockOf(page)).calls.find(
    (c) =>
      c.command === 'sites_mutate' && (c.args.mutation as { kind: string }).kind === 'updateItem',
  );
  expect(update).toBeUndefined();
});

async function dragTo(
  page: Page,
  from: ReturnType<Page['locator']>,
  to: ReturnType<Page['locator']>,
  part: 'upper' | 'lower' | 'middle' = 'middle',
) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('not laid out');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  const y = part === 'upper' ? b.y + 6 : part === 'lower' ? b.y + b.height - 6 : b.y + b.height / 2;
  await page.mouse.move(b.x + b.width / 2, y, { steps: 6 });
}

test('dragging a card onto a group moves it, with a label following the pointer', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  const reading = nav(page).locator('.site-nav-row', { hasText: '阅读' });
  await dragTo(page, card(page, 'Tauri'), reading);
  await expect(page.locator('.site-drag-ghost')).toContainText('Tauri');
  await expect(reading).toHaveClass(/\bdrop\b/);
  await expect(card(page, 'Tauri')).toHaveClass(/dragging/);
  await page.mouse.up();
  await expect(page.locator('.site-drag-ghost')).toHaveCount(0);
  const move = (await mockOf(page)).calls.find(
    (c) =>
      c.command === 'sites_mutate' && (c.args.mutation as { kind: string }).kind === 'moveItems',
  );
  expect(move).toBeTruthy();
  await nav(page).getByRole('button', { name: /^阅读/ }).click();
  await expect(card(page, 'Tauri')).toBeVisible();
  // The press that ended the drag did not open the site.
  expect((await mockOf(page)).opened).toEqual([]);
});

test('Escape cancels a drag without moving anything', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await dragTo(page, card(page, 'Tauri'), nav(page).locator('.site-nav-row', { hasText: '阅读' }));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.site-drag-ghost')).toHaveCount(0);
  const kinds = (await mockOf(page)).calls
    .filter((c) => c.command === 'sites_mutate')
    .map((c) => (c.args.mutation as { kind: string }).kind);
  expect(kinds).not.toContain('moveItems');
  await expect(workbench(page)).toBeVisible();
});

test('a group dragged onto the lower half of the next group lands after it', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  const order = () =>
    nav(page)
      .locator('.site-nav-row:not(.child) [data-group]')
      .evaluateAll((els) => els.map((e) => e.textContent?.replace(/\d+$/, '').trim()));
  await expect.poll(order).toEqual(['开发工具', '阅读']);
  const dev = nav(page).locator('.site-nav-row', { hasText: '开发工具' });
  const reading = nav(page).locator('.site-nav-row', { hasText: '阅读' });
  await dragTo(page, dev, reading, 'lower');
  await expect(reading).toHaveClass(/drop-after/);
  await page.mouse.up();
  await expect.poll(order).toEqual(['阅读', '开发工具']);
});

test('the custom colour is a picker swatch, and the chosen colour is shown and saved', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await page.getByRole('button', { name: '新建分组' }).click();
  const dialog = page.getByRole('dialog', { name: '新建分组' });
  // No hex text field to type into any more.
  await expect(dialog.locator('input[type="text"], input:not([type])')).toHaveCount(1);
  const picker = dialog.getByLabel('自定义颜色');
  await expect(picker).toHaveAttribute('type', 'color');
  await dialog.getByLabel('名称').fill('取色');
  await picker.fill('#12ab9f');
  await expect(dialog.locator('.site-swatch.picker')).toHaveCSS(
    'background-color',
    'rgb(18, 171, 159)',
  );
  await expect(dialog.locator('.site-swatch.picker')).toHaveAttribute('title', /#12ab9f/);
  // Twelve swatches stay on one line in the small dialog.
  const tops = await dialog
    .locator('.site-swatch')
    .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(tops).toBe(1);
  await dialog.getByRole('button', { name: '创建' }).click();
  await expect(nav(page).getByRole('button', { name: /^取色/ }).locator('.site-dot')).toHaveCSS(
    'background-color',
    'rgb(18, 171, 159)',
  );
});

test('the engine menu shows each engine with its mark', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await page.getByRole('button', { name: /搜索引擎：必应/ }).click();
  const menu = page.getByRole('menu', { name: '搜索引擎' });
  await expect(
    menu.getByRole('menuitem', { name: /必应/ }).locator('.site-engine-mark'),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: /Google/ }).locator('.site-engine-mark'),
  ).toBeVisible();
});

test('an icon the WebView cannot decode falls back to the letter mark', async ({ page }) => {
  await setup(page, { seed: true, brokenIcon: true });
  await page.evaluate(() => {
    const m = Reflect.get(window, '__sitesMock') as {
      state: { items: { title: string; icon: string | null }[] };
    };
    const vite = m.state.items.find((item) => item.title === 'Vite');
    if (vite) vite.icon = 'icons/broken.svg';
  });
  await entry(page).click();
  const mark = card(page, 'Vite').locator('.site-mark');
  await expect(mark).toHaveText('V');
  await expect(mark.locator('img')).toHaveCount(0);
});

test('the edit dialog fetches the site again on request', async ({ page }) => {
  await setup(page);
  await entry(page).click();
  await card(page, 'Vite').hover();
  await card(page, 'Vite')
    .getByRole('button', { name: /^编辑：Vite/ })
    .click();
  const dialog = page.getByRole('dialog', { name: '编辑站点' });
  // The saved site is shown, its mark at its own size, not stretched across the card.
  // Measured once the dialog's opening scale has settled.
  await expect
    .poll(async () =>
      Math.round((await dialog.locator('.site-preview .site-mark').boundingBox())?.width ?? 0),
    )
    .toBe(40);
  await dialog.getByRole('button', { name: '重新获取' }).click();
  const refetch = (await mockOf(page)).calls.find(
    (c) => c.command === 'sites_refetch' && c.args.force === true,
  );
  expect(refetch?.args.ids).toHaveLength(1);
  await expect(dialog.getByLabel('名称')).toHaveValue('Vite');
});

test('a new address that could not be read can be fetched again from the dialog', async ({
  page,
}) => {
  await setup(page);
  await entry(page).click();
  await page.getByRole('button', { name: '添加站点' }).first().click();
  const dialog = page.getByRole('dialog', { name: '添加站点' });
  await dialog.getByLabel('网址').fill('linear.app');
  await expect(dialog.locator('.site-preview strong')).toHaveText('预览标题');
  await expect
    .poll(async () =>
      Math.round((await dialog.locator('.site-preview .site-mark').boundingBox())?.width ?? 0),
    )
    .toBe(40);
  await dialog.getByRole('button', { name: '重新获取' }).click();
  await expect
    .poll(
      async () =>
        (await mockOf(page)).calls.filter(
          (c) => c.command === 'sites_preview' && c.args.fresh === true,
        ).length,
    )
    .toBe(1);
});
