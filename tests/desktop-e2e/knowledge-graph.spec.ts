import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

const source =
  '\uFEFF# Layout Reference\r\n\r\nAlpha [其他文档](Notes/Other.md) 中文 😀\n\n[丢失](Missing.md)\r\n';
function installGraphMock(text: string) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  const query = {
    focus: 'Layout.md',
    depth: 1,
    filter: '',
    folder: '',
    tag: '',
    showMissing: true,
    showOrphans: true,
    limit: 2000,
  };
  const initial = {
    version: 1,
    query,
    positions: {
      'Layout.md': { x: 0, y: 0, pinned: false },
      'Notes/Other.md': { x: 100, y: 0, pinned: false },
      'missing:fixture': { x: -100, y: 0, pinned: false },
      'Isolated.md': { x: 0, y: 240, pinned: false },
    },
    camera: { x: 0.5, y: 0.5, ratio: 1 },
    particles: false,
  };
  const state = {
    view: initial as unknown,
    queries: [] as Record<string, unknown>[],
    exports: [] as unknown[],
    statusError: '',
    generation: 1,
    richDetails: false,
    delay: false,
    release: null as null | (() => void),
  };
  Reflect.set(window, '__knowledgeMock', state);
  const fingerprint = (value: string) => {
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      for (const byte of [unit & 255, unit >>> 8])
        hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  };
  const documents: Record<string, string> = {
    'Layout.md': text,
    'Notes/Other.md': '# Other\n\nOther document',
    'Isolated.md': '# Isolated',
  };
  const references = [
    {
      source: 'Layout.md',
      target: 'Notes/Other.md',
      destination: 'Notes/Other.md',
      status: 'resolved',
      fragment: '',
      anchorMissing: false,
      candidates: [],
      sourceFingerprint: fingerprint(text),
      wiki: false,
      line: 3,
      column: 7,
      matchLength: '[其他文档](Notes/Other.md)'.length,
      expectedText: '[其他文档](Notes/Other.md)',
      preview: 'Alpha [其他文档](Notes/Other.md) 中文 😀',
    },
    {
      source: 'Layout.md',
      target: null,
      destination: 'Missing.md',
      status: 'missing',
      fragment: '',
      anchorMissing: false,
      candidates: [],
      sourceFingerprint: fingerprint(text),
      wiki: false,
      line: 5,
      column: 1,
      matchLength: '[丢失](Missing.md)'.length,
      expectedText: '[丢失](Missing.md)',
      preview: '[丢失](Missing.md)',
    },
  ];
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (
      command === 'open_workspace_document' &&
      typeof args.relativePath === 'string' &&
      documents[args.relativePath]
    ) {
      host.__desktopMock.calls.push({ command, args });
      const document = {
        id: `graph-${args.relativePath}`,
        path: `/mock/layout/${args.relativePath}`,
        text: documents[args.relativePath] as string,
        encoding: 'UTF-8',
      };
      host.__desktopMock.nextDocument = document;
      return document;
    }
    if (!command.startsWith('knowledge_')) return previous(command, args);
    host.__desktopMock.calls.push({ command, args });
    const status = {
      generation: state.generation,
      working: false,
      complete: true,
      scanned: 3,
      parsed: 3,
      unchanged: 0,
      unreadable: 0,
      skipped: 0,
      resolved: 2,
      elapsedMs: 2,
      watcher: true,
      error: state.statusError || null,
      sqliteVersion: 'fixture',
    };
    if (command === 'knowledge_open') return { key: 'fixture-root', status };
    if (command === 'knowledge_status') return status;
    if (command === 'knowledge_view') return state.view;
    if (command === 'knowledge_save_view') {
      state.view = JSON.parse(JSON.stringify(args.view));
      return null;
    }
    if (command === 'knowledge_export_view') {
      state.exports.push(args.view);
      return true;
    }
    if (command === 'knowledge_import_view')
      return {
        ...initial,
        query: { ...query, focus: null },
        positions: { ...initial.positions, 'Layout.md': { x: 125, y: -40, pinned: true } },
        particles: true,
      };
    if (command === 'knowledge_anchor') return null;
    if (command === 'knowledge_rebuild') {
      state.generation++;
      return null;
    }
    if (command === 'knowledge_active') return null;
    if (command === 'knowledge_references') {
      const first = references[0];
      const related =
        state.richDetails && first
          ? [
              ...references,
              {
                ...first,
                target: null,
                status: 'external',
                line: 7,
                destination:
                  'https://github.com/alibaba/spring-ai-alibaba/blob/main/spring-ai-alibaba-agent-framework/src/main/java/com/alibaba/cloud/ai/graph/agent/ReactAgent.java',
                preview:
                  '本文以 Spring AI Alibaba 的 Agent 为例，说明长期记忆、工具调用和可追溯引用的组织方式。'.repeat(
                    4,
                  ),
              },
            ]
          : references;
      const items = related
        .filter((r) => (args.incoming ? r.target === args.note : r.source === args.note))
        .filter((r) => !args.destination || r.destination === args.destination);
      return { items, total: items.length, offset: 0 };
    }
    if (command === 'knowledge_snapshot') {
      const q = args.query as typeof query;
      state.queries.push({ ...q });
      if (state.delay) {
        state.delay = false;
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      }
      let nodes = [
        {
          id: 'Layout.md',
          path: 'Layout.md',
          title: state.richDetails
            ? '深入理解 Alibaba-ReAct Agent 原理与可验证的知识关系'
            : 'Layout Reference',
          tags: ['研究'],
          incoming: 0,
          outgoing: 1,
          state: 'ready',
        },
        {
          id: 'Notes/Other.md',
          path: 'Notes/Other.md',
          title: 'Other',
          tags: [] as string[],
          incoming: 1,
          outgoing: 0,
          state: 'ready',
        },
        {
          id: 'Isolated.md',
          path: 'Isolated.md',
          title: 'Isolated',
          tags: [] as string[],
          incoming: 0,
          outgoing: 0,
          state: 'ready',
        },
        {
          id: 'missing:fixture',
          path: null,
          title: 'Missing.md',
          tags: [] as string[],
          incoming: 1,
          outgoing: 0,
          state: 'missing',
        },
      ];
      if (q.focus) nodes = nodes.filter((n) => n.id !== 'Isolated.md');
      if (!q.showMissing) nodes = nodes.filter((n) => n.path);
      if (!q.showOrphans) nodes = nodes.filter((n) => n.incoming + n.outgoing > 0);
      if (q.filter)
        nodes = nodes.filter(
          (n) =>
            n.id.toLowerCase().includes(q.filter.toLowerCase()) ||
            n.title.toLowerCase().includes(q.filter.toLowerCase()),
        );
      if (q.folder) nodes = nodes.filter((n) => n.path?.startsWith(`${q.folder}/`));
      if (q.tag) nodes = nodes.filter((n) => n.tags.includes(q.tag));
      const ids = new Set(nodes.map((n) => n.id));
      return {
        generation: state.generation,
        nodes,
        edges: [
          {
            id: 'a-b',
            source: 'Layout.md',
            target: 'Notes/Other.md',
            count: 1,
            anchorMissing: false,
          },
          {
            id: 'a-missing',
            source: 'Layout.md',
            target: 'missing:fixture',
            count: 1,
            anchorMissing: false,
          },
        ].filter((e) => ids.has(e.source) && ids.has(e.target)),
        totalNotes: 3,
        totalEdges: 1,
        unresolved: 1,
        truncated: false,
        folders: ['Notes'],
        tags: ['研究'],
      };
    }
    throw new Error(`Unknown knowledge command: ${command}`);
  };
}
async function setup(page: Page, theme = 'marklyra-light') {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installGraphMock, source);
  await readyLayout(page, theme);
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.getByRole('button', { name: '知识图谱', exact: true })).toBeEnabled();
}
async function openGraph(page: Page) {
  await page.getByRole('button', { name: '知识图谱', exact: true }).click();
  await expect(page.locator('.knowledge-workbench')).toBeVisible();
  await expect(page.locator('.knowledge-footer')).toContainText('索引已更新');
  await expect(page.locator('.knowledge-canvas canvas')).toHaveCount(1);
}
async function choose(page: Page, name: string) {
  const summary = page.locator('.knowledge-node-browser summary');
  if ((await page.locator('.knowledge-node-browser').getAttribute('open')) === null)
    await summary.click();
  await page.locator(`.knowledge-node-list button[title="${name}"]`).click();
}

test('graph search and document-list focus do not draw full-width blue frames', async ({
  page,
}) => {
  await setup(page, 'marklyra-dark');
  await openGraph(page);
  const input = page.getByRole('textbox', { name: '搜索图谱' });
  await input.click();
  expect(await input.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  expect(
    await page
      .locator('.knowledge-search')
      .evaluate((element) => getComputedStyle(element).boxShadow),
  ).toBe('none');
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  for (const label of ['关系层级', '显示预算', '筛选目录', '筛选标签']) {
    const control = page.getByLabel(label, { exact: true });
    await control.focus();
    expect(await control.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
      'none',
    );
    expect(await control.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
  }
  const summary = page.locator('.knowledge-node-browser summary');
  await choose(page, 'Layout.md');
  await summary.click();
  await summary.focus();
  expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  await summary.press('Enter');
  await expect(page.locator('.knowledge-node-browser')).toHaveAttribute('open', '');
  await expect(page.locator('.knowledge-workbench')).toBeVisible();
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: graph chrome aligns, filters stay orderly and the inspector resizes without resetting the scene`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1480, height: 900 });
    await setup(page, theme);
    await page.evaluate(() => {
      Reflect.get(window, '__knowledgeMock').richDetails = true;
    });
    const history = await layoutHistory(page);
    await openGraph(page);
    const header = await page.locator('.knowledge-header').boundingBox();
    const folderHeader = await page.locator('.workspace-navigation-single').boundingBox();
    if (!header || !folderHeader) throw new Error('Missing aligned headers');
    expect(header.height).toBe(folderHeader.height);
    expect(Math.abs(header.y - folderHeader.y)).toBeLessThanOrEqual(1);
    const sizes = await page.evaluate(() => [
      getComputedStyle(document.querySelector('.knowledge-heading strong') as Element).fontSize,
      getComputedStyle(document.querySelector('.workspace-folder-trigger') as Element).fontSize,
    ]);
    expect(sizes[0]).toBe(sizes[1]);
    await expect(page.getByRole('complementary', { name: '关系详情' })).toHaveCount(0);
    await page.getByRole('button', { name: '筛选', exact: true }).click();
    const searchBox = await page.locator('.knowledge-search').boundingBox();
    const actions = await page.getByRole('group', { name: '图谱视图操作' }).boundingBox();
    if (!searchBox || !actions) throw new Error('Missing graph toolbar');
    expect(
      Math.abs(searchBox.y + searchBox.height / 2 - actions.y - actions.height / 2),
    ).toBeLessThanOrEqual(1);
    expect(actions.x).toBeGreaterThan(searchBox.x + searchBox.width);
    const fieldRows = await page
      .locator('.knowledge-filter-fields > label')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(Math.max(...fieldRows) - Math.min(...fieldRows)).toBeLessThanOrEqual(1);
    await choose(page, 'Layout.md');
    const handle = page.getByRole('separator', { name: '调整关系面板宽度' });
    const pane = page.locator('.knowledge-inspector');
    await expect.poll(async () => Math.round((await pane.boundingBox())?.width ?? 0)).toBe(320);
    await page.evaluate(async () => {
      Reflect.set(
        window,
        '__graphCanvasBefore',
        document.querySelector('.knowledge-canvas canvas'),
      );
      Reflect.set(window, '__graphSceneUpdates', 0);
      const route = '/src/features/knowledge-graph/renderer.ts';
      const module = await import(route),
        original = module.GraphRenderer.prototype.setData;
      module.GraphRenderer.prototype.setData = function (...args: unknown[]) {
        Reflect.set(window, '__graphSceneUpdates', Reflect.get(window, '__graphSceneUpdates') + 1);
        return original.apply(this, args);
      };
    });
    const box = await handle.boundingBox();
    if (!box) throw new Error('Missing graph resize handle');
    const x = box.x + box.width / 2,
      y = box.y + 70;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 90, y, { steps: 12 });
    await expect(handle).toHaveAttribute('aria-valuenow', '410');
    await expect.poll(async () => Math.round((await pane.boundingBox())?.width ?? 0)).toBe(410);
    await expect(page.locator('.resize-shield')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator('.resize-shield')).toHaveCount(0);
    await handle.focus();
    await handle.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '420');
    await expect.poll(async () => Math.round((await pane.boundingBox())?.width ?? 0)).toBe(420);
    expect(await page.evaluate(() => Reflect.get(window, '__graphSceneUpdates'))).toBe(0);
    expect(
      await page.evaluate(
        () =>
          Reflect.get(window, '__graphCanvasBefore') ===
          document.querySelector('.knowledge-canvas canvas'),
      ),
    ).toBe(true);
    expect(await layoutHistory(page)).toBe(history);
    const output = resolve('artifacts/knowledge-graph/ui-polish');
    await mkdir(output, { recursive: true });
    await page.getByRole('button', { name: '适应图谱' }).click();
    await page.getByRole('textbox', { name: '搜索图谱' }).click();
    await page.screenshot({ path: resolve(output, `${info.project.name}-${theme}-wide.png`) });
    await page.getByRole('button', { name: '收起关系详情' }).click();
    await expect(page.getByRole('complementary', { name: '关系详情' })).toHaveCount(0);
    await choose(page, 'Notes/Other.md');
    await expect.poll(async () => Math.round((await pane.boundingBox())?.width ?? 0)).toBe(420);
    await choose(page, 'Layout.md');
    await page.setViewportSize({ width: 960, height: 740 });
    await expect(page.locator('.knowledge-workbench')).toHaveAttribute('data-narrow', 'true');
    await expect(handle).toBeHidden();
    expect(
      await page
        .locator('.knowledge-workbench')
        .evaluate((element) => element.scrollWidth > element.clientWidth + 1),
    ).toBe(false);
    await page.screenshot({ path: resolve(output, `${info.project.name}-${theme}-narrow.png`) });
    const external = page.getByText('github.com', { exact: true });
    await external.scrollIntoViewIfNeeded();
    await expect(external).toBeVisible();
    const externalBox = await external.boundingBox(),
      inspectorBox = await pane.boundingBox();
    if (!externalBox || !inspectorBox) throw new Error('Missing scrollable reference card');
    expect(externalBox.y).toBeGreaterThanOrEqual(inspectorBox.y);
    expect(externalBox.y + externalBox.height).toBeLessThanOrEqual(
      inspectorBox.y + inspectorBox.height,
    );
    await page.screenshot({
      path: resolve(output, `${info.project.name}-${theme}-narrow-scrolled.png`),
    });
    await page.getByRole('button', { name: '返回文档', exact: true }).first().click();
    expect(await layoutHistory(page)).toBe(history);
    await page.setViewportSize({ width: 1480, height: 900 });
    await openGraph(page);
    await choose(page, 'Layout.md');
    await expect(handle).toHaveAttribute('aria-valuenow', '420');
    await handle.focus();
    await handle.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '260');
    await handle.press('End');
    const maximum = await handle.getAttribute('aria-valuemax');
    if (!maximum) throw new Error('Missing resize limit');
    await expect(handle).toHaveAttribute('aria-valuenow', maximum);
    await page.getByRole('button', { name: '返回文档', exact: true }).first().click();
    expect(await layoutHistory(page)).toBe(history);
  });
}

test('graph keeps the editor instance and history, and persists pinned view state', async ({
  page,
}) => {
  await setup(page);
  const before = await layoutHistory(page);
  await page.evaluate(() =>
    Reflect.set(window, '__originalEditorFrame', document.querySelector('.marklyra-editor-frame')),
  );
  await openGraph(page);
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  await choose(page, 'Layout.md');
  await expect(page.getByRole('complementary', { name: '关系详情' })).toContainText(
    'Notes/Other.md',
  );
  await page.getByRole('button', { name: '固定位置', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消固定', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回文档', exact: true }).first().click();
  await expect(page.locator('.knowledge-workbench')).toHaveCount(0);
  await expect(page.locator('.runtime-editor-mount')).not.toHaveAttribute('inert');
  expect(
    await page.evaluate(
      () =>
        Reflect.get(window, '__originalEditorFrame') ===
        document.querySelector('.marklyra-editor-frame'),
    ),
  ).toBe(true);
  expect(await layoutHistory(page)).toBe(before);
  await openGraph(page);
  await choose(page, 'Layout.md');
  await expect(page.getByRole('button', { name: '取消固定', exact: true })).toBeVisible();
});

test('pointer drag follows the pointer and leaves unrelated documents in place', async ({
  page,
}) => {
  await setup(page);
  await openGraph(page);
  await page.getByRole('button', { name: '全目录', exact: true }).click();
  await choose(page, 'Layout.md');
  await page.getByRole('button', { name: '定位节点', exact: true }).click();
  await page.waitForTimeout(300);
  const box = await page.locator('.knowledge-canvas canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 30, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const view = Reflect.get(window, '__knowledgeMock').view;
        return Math.abs(view.positions['Layout.md'].x) > 10;
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(window, '__knowledgeMock').view.positions['Isolated.md']),
  ).toEqual({ x: 0, y: 240, pinned: false });
  await page.getByRole('button', { name: '返回文档', exact: true }).first().click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const route = '/src/features/knowledge-graph/renderer.ts';
        const module = await import(route);
        return module.graphResources;
      }),
    )
    .toEqual({ renderers: 0, workers: 0 });
});

test('filters, IME search, portable view import, and light/dark narrow layouts', async ({
  page,
}, testInfo) => {
  await setup(page);
  await openGraph(page);
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByLabel('未解析目标', { exact: true }).uncheck();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__knowledgeMock').queries.at(-1)?.showMissing),
    )
    .toBe(false);
  const input = page.getByRole('textbox', { name: '搜索图谱' });
  await input.dispatchEvent('compositionstart', { data: 'zhong' });
  await input.fill('zhong');
  await page.waitForTimeout(180);
  expect(
    await page.evaluate(() => Reflect.get(window, '__knowledgeMock').queries.at(-1)?.filter),
  ).toBe('');
  await input.fill('中文');
  await input.dispatchEvent('compositionend', { data: '中文' });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__knowledgeMock').queries.at(-1)?.filter))
    .toBe('中文');
  await page.getByRole('button', { name: '清除图谱搜索' }).click();
  await choose(page, 'Layout.md');
  await page.getByRole('button', { name: '导入视图', exact: true }).click();
  await expect(page.getByRole('button', { name: '全目录', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await choose(page, 'Layout.md');
  await expect(page.getByRole('button', { name: '取消固定', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出视图', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__knowledgeMock').exports.length))
    .toBe(1);
  const directory = resolve('artifacts/knowledge-graph/ui');
  await mkdir(directory, { recursive: true });
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  const ink = () =>
    page.locator('.knowledge-canvas canvas').evaluate((element) => {
      const canvas = element as HTMLCanvasElement,
        context = canvas.getContext('2d');
      if (!context) return 0;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 16)
        if (
          Math.abs((data[i] ?? 0) - (data[0] ?? 0)) +
            Math.abs((data[i + 1] ?? 0) - (data[1] ?? 0)) +
            Math.abs((data[i + 2] ?? 0) - (data[2] ?? 0)) >
          50
        )
          ink++;
      return ink;
    });
  await expect.poll(ink).toBeGreaterThan(20);
  await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-light.png`) });
  await emitLayoutMenu(page, 'theme:marklyra-dark');
  await page.setViewportSize({ width: 960, height: 740 });
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'marklyra-dark');
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  await expect.poll(ink).toBeGreaterThan(20);
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(directory, `${testInfo.project.name}-dark-narrow.png`) });
  const overflow = await page
    .locator('.knowledge-workbench')
    .evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(overflow).toBe(false);
});

test('incoming references navigate to guarded source positions without changing Markdown', async ({
  page,
}) => {
  await setup(page);
  await openGraph(page);
  await choose(page, 'Notes/Other.md');
  await page.getByRole('tab', { name: '入链', exact: true }).click();
  await expect(page.locator('.knowledge-reference')).toHaveCount(1);
  await page.getByRole('button', { name: '定位原文 · 3 行', exact: true }).click();
  await expect(page.locator('.knowledge-workbench')).toHaveCount(0);
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    'Alpha',
  );
  expect(await page.evaluate(() => (window as TestWindow).__desktopMock.nextDocument.text)).toBe(
    source,
  );
});

test('late snapshots cannot overwrite a newer query or a reopened graph', async ({ page }) => {
  await setup(page);
  await openGraph(page);
  const input = page.getByRole('textbox', { name: '搜索图谱' });
  await page.evaluate(() => {
    Reflect.get(window, '__knowledgeMock').delay = true;
  });
  await input.fill('Layout');
  await expect
    .poll(() => page.evaluate(() => !!Reflect.get(window, '__knowledgeMock').release))
    .toBe(true);
  await input.fill('Other');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const state = Reflect.get(window, '__knowledgeMock');
    state.release();
    state.release = null;
  });
  await choose(page, 'Notes/Other.md');
  await expect(page.locator('.knowledge-node-list button[title="Layout.md"]')).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.get(window, '__knowledgeMock').delay = true;
  });
  await input.fill('Layout');
  await expect
    .poll(() => page.evaluate(() => !!Reflect.get(window, '__knowledgeMock').release))
    .toBe(true);
  await page.getByRole('button', { name: '返回文档', exact: true }).first().click();
  await openGraph(page);
  await page.getByRole('textbox', { name: '搜索图谱' }).fill('Other');
  await choose(page, 'Notes/Other.md');
  await page.evaluate(() => Reflect.get(window, '__knowledgeMock').release());
  await page.waitForTimeout(200);
  await expect(page.locator('.knowledge-node-list button[title="Layout.md"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '搜索图谱' })).toHaveValue('Other');
});

test('IME guards graph entry and hidden editor commands while graph find stays usable', async ({
  page,
}) => {
  await setup(page);
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' })),
  );
  await page.waitForTimeout(80);
  await emitLayoutMenu(page, 'view:graph');
  await expect(page.locator('.knowledge-workbench')).toHaveCount(0);
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await page.waitForTimeout(100);
  await openGraph(page);
  const before = await layoutHistory(page);
  await emitLayoutMenu(page, 'format:strong');
  await emitLayoutMenu(page, 'undo');
  await emitLayoutMenu(page, 'view:source');
  await emitLayoutMenu(page, 'find');
  await expect(page.getByRole('textbox', { name: '搜索图谱' })).toBeFocused();
  expect(await layoutHistory(page)).toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await choose(page, 'Layout.md');
  await page.getByRole('button', { name: '定位节点', exact: true }).click();
  await expect(page.locator('.knowledge-canvas canvas')).toBeVisible();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    const context = mock.calls.find((call) => call.command === 'register_editor_command_context')
      ?.args?.context;
    mock.emitEvent('menu-action', { context, sequence: 1, action: 'find' });
  });
  await expect(page.getByRole('textbox', { name: '搜索图谱' })).toBeFocused();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    const context = mock.calls.find((call) => call.command === 'register_editor_command_context')
      ?.args?.context;
    mock.emitEvent('menu-action', { context, sequence: 2, action: 'undo' });
  });
  await emitLayoutMenu(page, 'close-document');
  await expect(page.locator('.knowledge-workbench')).toHaveCount(0);
  expect(await layoutHistory(page)).toBe(before);
});
