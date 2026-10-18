import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutCaret,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const source =
  '\uFEFF# Guide\r\n\r\n## First\n\nAlpha **Bravo**.\r\n\r\n## Second\n\nTail text.\r\n';
const details = (page: Page) => page.getByRole('complementary', { name: '文档目录' });
const content = (page: Page) =>
  page.frameLocator('.runtime-area .marklyra-editor-frame').locator('content');

async function editingArea(page: Page, selector = 'content') {
  const iframe = await page.locator('.runtime-area .marklyra-editor-frame').boundingBox();
  const area = await page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator(selector)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(style.paddingRight) || 0;
      return {
        x: rect.x + paddingLeft,
        y: rect.y,
        width: element.clientWidth - paddingLeft - paddingRight,
        height: element.clientHeight,
        scrollbar: (element as HTMLElement).offsetWidth - element.clientWidth,
      };
    });
  if (!iframe) throw Error('Missing editor frame');
  return { ...area, x: area.x + iframe.x, y: area.y + iframe.y };
}
async function expectAligned(page: Page) {
  await expect
    .poll(async () => {
      const panel = await details(page).boundingBox();
      const target = Number(
        await page.getByRole('separator', { name: '调整目录宽度' }).getAttribute('aria-valuenow'),
      );
      return panel && Math.abs(panel.width - target);
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const panel = await details(page).boundingBox();
      const area = await editingArea(page);
      const main = await page.locator('main.document-area').boundingBox();
      return (
        panel &&
        main &&
        Math.max(Math.abs(panel.x - area.x - area.width), Math.abs(main.x - area.x))
      );
    })
    .toBeLessThanOrEqual(2);
}

for (const theme of ['github', 'night']) {
  test(`${theme}: right outline occupies a third column and preserves the editor and selection`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    await layoutCaret(page);
    const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
    const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
    await frame.locator('#write').evaluate((root) => {
      const selection = getSelection();
      Reflect.set(window, '__detailsInvariant', {
        root,
        nodes: [...root.childNodes],
        anchor: selection?.anchorNode,
        offset: selection?.anchorOffset,
      });
    });
    const history = await layoutHistory(page);
    const original = await editingArea(page);
    await expect(page.getByRole('button', { name: '切换侧栏视图' })).toHaveCount(0);
    await emitLayoutMenu(page, 'view:outline');
    await expect(details(page)).toBeVisible();
    await expect(details(page).getByRole('treeitem')).toHaveCount(3);
    await expect(frame.locator('#toc-dropmenu')).toBeHidden();
    await expect(page.locator('.sidebar-current-title')).toHaveCount(0);
    await expectAligned(page);
    const panel = await details(page).boundingBox();
    const area = await editingArea(page);
    expect(
      original &&
        area &&
        panel &&
        Math.abs(original.width - area.width - panel.width - 20 + original.scrollbar),
    ).toBeLessThanOrEqual(2);
    await expect(page.locator('.runtime-area .marklyra-editor-frame')).toHaveJSProperty(
      'clientWidth',
      page.viewportSize()?.width,
    );
    expect(
      await frame.locator('#write').evaluate((root) => {
        const before = Reflect.get(window, '__detailsInvariant');
        return (
          before.root === root &&
          before.nodes.every((node: Node, index: number) => root.childNodes[index] === node) &&
          getSelection()?.anchorNode === before.anchor &&
          getSelection()?.anchorOffset === before.offset
        );
      }),
    ).toBe(true);
    await details(page).getByRole('treeitem', { name: 'Second', exact: true }).click();
    await expect(page.locator('.runtime-area .marklyra-editor-frame')).toBeFocused();
    expect(await layoutHistory(page)).toBe(history);
    await page.screenshot({ path: info.outputPath('three-columns.png') });
    await expect(page.getByRole('button', { name: '关闭目录', exact: true })).toHaveCount(0);
    await emitLayoutMenu(page, 'view:outline');
    await expect(details(page)).toBeHidden();
    await expect.poll(async () => (await editingArea(page)).width).toBe(original.width);
    expect(await iframe?.evaluate((node) => node.isConnected)).toBe(true);
    await saveLayoutSource(page, info, 'outline-preserves-source', source);
  });
}

test('right outline stays independent of files/search and adapts to resizing and source view', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:outline');
  for (const width of [960, 1484, 680]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAligned(page);
    await info.attach(`viewport-${width}`, {
      contentType: 'application/json',
      body: JSON.stringify({
        area: await editingArea(page),
        host: await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          viewport: innerWidth,
          bodyHeight: innerHeight,
          sidebar: document.querySelector('.sidebar')?.getBoundingClientRect().toJSON(),
          main: document.querySelector('.document-area')?.getBoundingClientRect().toJSON(),
          panel: document
            .querySelector('.document-details-panel')
            ?.getBoundingClientRect()
            .toJSON(),
        })),
        port: await content(page).evaluate((element) => ({
          rect: element.getBoundingClientRect().toJSON(),
          client: element.clientWidth,
          padding: getComputedStyle(element).paddingRight,
          right: document.documentElement.style.getPropertyValue('--marklyra-content-trailing'),
          space: document.documentElement.style.getPropertyValue(
            '--marklyra-document-scrollbar-space',
          ),
        })),
      }),
    });
    expect((await editingArea(page)).width).toBeGreaterThanOrEqual(218);
  }
  await emitLayoutMenu(page, 'view:sidebar');
  await expect(page.locator('aside.sidebar')).toBeHidden();
  await expect(details(page)).toBeVisible();
  await expectAligned(page);
  await emitLayoutMenu(page, 'view:workspace-search');
  await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
  await expect(details(page)).toBeVisible();
  await page.getByRole('button', { name: '返回文件', exact: true }).click();
  await emitLayoutMenu(page, 'view:source');
  const sourceView = page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#typora-source');
  await expect(sourceView).toBeVisible();
  await expect
    .poll(async () => {
      const view = await editingArea(page, '#typora-source .CodeMirror-scroll');
      const panel = await details(page).boundingBox();
      return view && panel && Math.abs(panel.x - view.x - view.width);
    })
    .toBeLessThanOrEqual(2);
  await emitLayoutMenu(page, 'find');
  const find = page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#md-searchpanel');
  await expect.poll(async () => (await find.boundingBox())?.width).toBe(680);
  expect(
    await page.evaluate(() =>
      document.elementFromPoint(innerWidth - 20, 48)?.classList.contains('marklyra-editor-frame'),
    ),
  ).toBe(true);
  await find.locator('.close-btn').click();
  await expect(details(page)).toBeVisible();
  await emitLayoutMenu(page, 'view:source');
  await saveLayoutSource(page, info, 'responsive-details-preserve-source', source);
});

test('both side panels resize live within their limits and keep thin dividers without changing editor state', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await layoutCaret(page);
  const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
  const root = page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write');
  await root.evaluate((element) => {
    Reflect.set(window, '__resizeNodes', [...element.childNodes]);
    Reflect.set(window, '__resizeAnchor', getSelection()?.anchorNode);
    Reflect.set(window, '__resizeOffset', getSelection()?.anchorOffset);
  });
  const history = await layoutHistory(page);
  await emitLayoutMenu(page, 'view:outline');
  await expectAligned(page);
  const handle = page.getByRole('separator', { name: '调整目录宽度' });
  const box = await handle.boundingBox();
  if (!box) throw Error('Missing outline resize handle');
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 97, box.y + 100, { steps: 6 });
  await expect(
    page.locator('.native-document-notice').filter({ hasText: 'ResizeObserver' }),
  ).toHaveCount(0);
  await expect(handle).toHaveAttribute('aria-valuenow', '380');
  await expect.poll(async () => (await details(page).boundingBox())?.width).toBe(380);
  await expectAligned(page);
  await expect(page.locator('.resize-guide')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('live-pane-resize.png') });
  await expect(page.locator('.resize-shield')).toHaveCount(1);
  await page.mouse.move(0, box.y + 100, { steps: 5 });
  await expect.poll(async () => (await details(page).boundingBox())?.width).toBe(440);
  await expectAligned(page);
  await page.mouse.move(1483, box.y + 100, { steps: 6 });
  await expect.poll(async () => (await details(page).boundingBox())?.width).toBe(200);
  await expect(handle).toHaveAttribute('aria-valuenow', '200');
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '200');
  await expectAligned(page);
  await expect(page.locator('.resize-guide')).toHaveCount(0);
  const leftHandle = page.getByRole('separator', { name: '调整侧栏宽度' });
  const leftBox = await leftHandle.boundingBox();
  if (!leftBox) throw Error('Missing sidebar resize handle');
  await page.mouse.move(leftBox.x + 1, leftBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + 61, leftBox.y + 100, { steps: 6 });
  await expect(leftHandle).toHaveAttribute('aria-valuenow', '330');
  await expect
    .poll(async () => (await page.locator('aside.sidebar').boundingBox())?.width)
    .toBe(330);
  await expectAligned(page);
  await expect(page.locator('.resize-guide')).toHaveCount(0);
  await page.mouse.up();
  await expect(leftHandle).toHaveAttribute('aria-valuenow', '330');
  await expect(page.locator('.resize-shield')).toHaveCount(0);
  expect(
    await root.evaluate(
      (element) =>
        Reflect.get(window, '__resizeNodes').every(
          (node: Node, index: number) => element.childNodes[index] === node,
        ) &&
        getSelection()?.anchorNode === Reflect.get(window, '__resizeAnchor') &&
        getSelection()?.anchorOffset === Reflect.get(window, '__resizeOffset'),
    ),
  ).toBe(true);
  const cancelBox = await handle.boundingBox();
  if (!cancelBox) throw Error('Missing outline resize handle');
  await page.mouse.move(cancelBox.x + 3, cancelBox.y + 100);
  await page.mouse.down();
  await emitLayoutMenu(page, 'view:outline');
  await expect(page.locator('.resize-shield')).toHaveCount(0);
  await page.mouse.up();
  await expect(details(page)).toBeHidden();
  await emitLayoutMenu(page, 'view:outline');
  await expectAligned(page);
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '440');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '400');
  await expectAligned(page);
  await emitLayoutMenu(page, 'view:outline');
  await expect(details(page)).toBeHidden();
  await emitLayoutMenu(page, 'view:outline');
  await expectAligned(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '400');
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(handle).toHaveAttribute('aria-valuemax', '280');
  await expect(handle).toHaveAttribute('aria-valuenow', '280');
  await expectAligned(page);
  expect((await editingArea(page)).width).toBeGreaterThanOrEqual(218);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(700);
  const leftMaximum = Number(await leftHandle.getAttribute('aria-valuemax'));
  await leftHandle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(leftHandle).toHaveAttribute('aria-valuenow', String(leftMaximum - 10));
  await page.keyboard.press('ArrowRight');
  await expect(leftHandle).toHaveAttribute('aria-valuenow', String(leftMaximum));
  await page.setViewportSize({ width: 1484, height: 1021 });
  await expect(handle).toHaveAttribute('aria-valuenow', '400');
  await expectAligned(page);
  await emitLayoutMenu(page, 'view:source');
  await handle.focus();
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '200');
  await expectAligned(page);
  await expect
    .poll(async () => {
      const area = await editingArea(page, '#typora-source .CodeMirror-scroll');
      return Math.abs(area.x + area.width - ((await details(page).boundingBox())?.x ?? 0));
    })
    .toBeLessThanOrEqual(2);
  const sourceInput = await page
    .frameLocator('.runtime-area iframe')
    .locator('#typora-source textarea')
    .elementHandle();
  const sourceHandle = await handle.boundingBox();
  if (!sourceHandle) throw Error('Missing source outline resize handle');
  await page.mouse.move(sourceHandle.x + 3, sourceHandle.y + 100);
  await page.mouse.down();
  await page.mouse.move(sourceHandle.x - 77, sourceHandle.y + 100, { steps: 6 });
  await expect.poll(async () => (await details(page).boundingBox())?.width).toBe(280);
  const sourcePort = await page
    .frameLocator('.runtime-area iframe')
    .locator('#typora-source .CodeMirror-scroll')
    .boundingBox();
  expect(sourcePort && Math.abs(sourcePort.x + sourcePort.width - 1484)).toBeLessThanOrEqual(1);
  await expect
    .poll(async () => {
      const area = await editingArea(page, '#typora-source .CodeMirror-scroll');
      return Math.abs(area.x + area.width - ((await details(page).boundingBox())?.x ?? 0));
    })
    .toBeLessThanOrEqual(2);
  await page.mouse.up();
  await expect.poll(async () => (await details(page).boundingBox())?.width).toBe(280);
  expect(await sourceInput?.evaluate((element) => element.isConnected)).toBe(true);
  await emitLayoutMenu(page, 'view:source');
  expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await layoutHistory(page)).toBe(history);
  await saveLayoutSource(page, info, 'resized-outline-preserves-source', source);
});

for (const theme of ['github', 'night']) {
  test(`${theme}: both pane dividers stay equally thin and unchanged on hover`, async ({
    page,
  }) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'view:outline');
    await expectAligned(page);
    const read = () =>
      page.evaluate(() => {
        const left = document.querySelector('.sidebar');
        const right = document.querySelector('.document-details-resize');
        if (!left || !right) throw Error('Missing pane divider');
        const leading = getComputedStyle(left);
        const trailing = getComputedStyle(right, '::before');
        return {
          left: [leading.borderRightWidth, leading.borderRightColor],
          right: [trailing.borderLeftWidth, trailing.borderLeftColor],
          background: trailing.backgroundColor,
        };
      });
    const idle = await read();
    expect(Number.parseFloat(idle.left[0] ?? '0')).toBeLessThanOrEqual(1);
    expect(idle.right).toEqual(idle.left);
    expect(idle.background).toBe('rgba(0, 0, 0, 0)');
    await page
      .getByRole('separator', { name: '调整侧栏宽度' })
      .hover({ position: { x: 1, y: 100 } });
    expect(await read()).toEqual(idle);
    await page
      .getByRole('separator', { name: '调整目录宽度' })
      .hover({ position: { x: 2, y: 100 } });
    expect(await read()).toEqual(idle);
  });
}

test('outline opening and closing interpolate the layout, reverse cleanly and respect reduced motion', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  const sampleToggle = () =>
    page.evaluate(async () => {
      const panel = document.querySelector<HTMLElement>('.document-details-panel');
      if (!panel) throw Error('Missing outline panel');
      const widths: number[] = [];
      const start = performance.now();
      (window as TestWindow).__desktopMock.emitMenu('view:outline');
      do {
        await new Promise(requestAnimationFrame);
        widths.push(panel.getBoundingClientRect().width);
      } while (performance.now() - start < 380);
      return widths;
    });
  const opening = await sampleToggle();
  await expectAligned(page);
  expect(opening.filter((width) => width > 2 && width < 278).length).toBeGreaterThan(1);
  await page.screenshot({ path: info.outputPath('refined-outline.png') });
  const closing = await sampleToggle();
  expect(closing.filter((width) => width > 2 && width < 278).length).toBeGreaterThan(1);
  await expect(details(page)).toBeHidden();
  expect(closing.at(-1)).toBe(0);
  await expect
    .poll(() =>
      content(page).evaluate(() =>
        document.documentElement.style.getPropertyValue('--marklyra-content-trailing'),
      ),
    )
    .toBe('0px');
  await page.evaluate(async () => {
    (window as TestWindow).__desktopMock.emitMenu('view:outline');
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    (window as TestWindow).__desktopMock.emitMenu('view:outline');
    await new Promise(requestAnimationFrame);
    (window as TestWindow).__desktopMock.emitMenu('view:outline');
  });
  await expectAligned(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emitLayoutMenu(page, 'view:outline');
  await expect(details(page)).toBeHidden();
  await expect(page.locator('.document-details-panel')).toHaveCSS('flex-basis', '0px');
  await emitLayoutMenu(page, 'view:outline');
  await expectAligned(page);
  await expect(page.locator('.document-details-panel')).toHaveCSS('transition-duration', '0s');
  await saveLayoutSource(page, info, 'animated-outline-preserves-source', source);
});

test('rapid outline reversals keep the real document scrollbar at the window edge even with delayed layout replies', async ({
  page,
}, info) => {
  const layoutErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (error.message.includes('ResizeObserver')) layoutErrors.push(error.message);
  });
  await page.addInitScript(() => {
    if (window === window.top) {
      Reflect.set(window, '__layoutErrors', []);
      window.addEventListener('message', (event) => {
        if (
          event.data?.kind === 'runtime-error' &&
          String(event.data.payload).includes('ResizeObserver')
        )
          Reflect.get(window, '__layoutErrors').push(event.data.payload);
      });
      return;
    }
    const delayed = new Set<string>();
    window.addEventListener('message', (event) => {
      const packet = event.data;
      if (packet?.kind !== 'request' || packet.operation !== 'content-inset') return;
      if (delayed.delete(packet.id)) return;
      event.stopImmediatePropagation();
      delayed.add(packet.id);
      setTimeout(() => {
        window.dispatchEvent(
          new MessageEvent('message', { data: packet, origin: event.origin, source: event.source }),
        );
      }, 48);
    });
  });
  await installLayout(page);
  await readyLayout(page, 'github');
  const longSource = `# Stable scrollbar\n\n${'## Section\n\nLong paragraph.\n\n'.repeat(80)}`;
  await openLayoutDocument(page, longSource);
  // Even a platform that temporarily paints an overlay scrollbar must be clipped by the mask.
  await page.addStyleTag({
    content:
      '.document-details-content{scrollbar-width:auto!important}' +
      '.document-details-content::-webkit-scrollbar{display:block!important;width:12px!important}',
  });
  await emitLayoutMenu(page, 'view:outline');
  await expectAligned(page);
  const history = await layoutHistory(page);
  for (const sourceMode of [false, true]) {
    if (sourceMode) {
      await page.setViewportSize({ width: 700, height: 800 });
      await expectAligned(page);
      await emitLayoutMenu(page, 'view:source');
      await expect(
        page.frameLocator('.runtime-area iframe').locator('#typora-source .CodeMirror-scroll'),
      ).toBeVisible();
    }
    const portProbe = content(page).evaluate(async (_, sourceMode) => {
      const samples: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 900) {
        await new Promise(requestAnimationFrame);
        const port = document.querySelector(
          sourceMode ? '#typora-source .CodeMirror-scroll' : 'content',
        );
        if (port) samples.push(port.getBoundingClientRect().right - innerWidth);
      }
      return samples;
    }, sourceMode);
    const positions = await page.evaluate(async (sourceMode) => {
      const iframe = document.querySelector<HTMLIFrameElement>('.runtime-area iframe');
      if (!iframe) throw Error('Missing editor frame');
      const positions: number[] = [];
      const hiddenScrollbars: number[] = [];
      const start = performance.now();
      let nextToggle = 0;
      // Sample after layout observers, in the same rendering opportunity that will be painted.
      const observer = new ResizeObserver(() => {
        const frame = iframe.getBoundingClientRect();
        positions.push(frame.right - innerWidth);
        const scroller = document.querySelector<HTMLElement>('.document-details-content');
        const mask = document.querySelector('.document-details-scroll-mask');
        if (scroller && mask)
          hiddenScrollbars.push(
            scroller.getBoundingClientRect().left +
              scroller.clientWidth -
              mask.getBoundingClientRect().right,
          );
      });
      const panel = document.querySelector('.document-details-panel');
      if (!panel) throw Error('Missing outline panel');
      observer.observe(panel);
      while (performance.now() - start < 900) {
        await new Promise(requestAnimationFrame);
        const elapsed = performance.now() - start;
        if (elapsed >= nextToggle && nextToggle < 500) {
          (window as TestWindow).__desktopMock.emitMenu('view:outline');
          nextToggle += 70;
        }
      }
      observer.disconnect();
      return { sourceMode, positions, hiddenScrollbars };
    }, sourceMode);
    await info.attach(`scrollbar-edge-${sourceMode ? 'source' : 'document'}`, {
      contentType: 'application/json',
      body: JSON.stringify(positions),
    });
    expect(positions.positions.length).toBeGreaterThan(5);
    expect(Math.max(...positions.positions.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.min(...positions.hiddenScrollbars)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...(await portProbe).map(Math.abs))).toBeLessThanOrEqual(1);
  }
  await emitLayoutMenu(page, 'view:source');
  expect(layoutErrors).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(window, '__layoutErrors'))).toEqual([]);
  expect(await layoutHistory(page)).toBe(history);
  await saveLayoutSource(page, info, 'rapid-outline-preserves-source', longSource);
});

test('outline layout changes during composition preserve editable nodes and history', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await layoutCaret(page);
  const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
  const root = frame.locator('#write');
  const history = await layoutHistory(page);
  const node = await root.elementHandle();
  await root.evaluate((element) => {
    Reflect.set(window, '__detailsCompositionNodes', [...element.childNodes]);
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' }));
  });
  await emitLayoutMenu(page, 'view:outline');
  await expect(details(page)).toBeVisible();
  await expectAligned(page);
  await emitLayoutMenu(page, 'view:outline');
  await expect(details(page)).toBeHidden();
  expect(
    await root.evaluate((element) =>
      Reflect.get(window, '__detailsCompositionNodes').every(
        (node: Node, index: number) => element.childNodes[index] === node,
      ),
    ),
  ).toBe(true);
  expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
  expect(await layoutHistory(page)).toBe(history);
  await root.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'ni' })),
  );
  await saveLayoutSource(page, info, 'composition-layout-preserves-source', source);
});

test('an open outline follows the next document without retaining old headings', async ({
  page,
}, info) => {
  await installLayout(page);
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'view:outline');
  await expect(details(page).getByRole('treeitem', { name: 'Guide', exact: true })).toBeVisible();
  const next = '\uFEFF# Replacement\r\n\r\n## Current\n\nDifferent document.\r\n';
  await page.evaluate((text) => {
    (window as TestWindow).__desktopMock.nextDocument = {
      id: 'replacement-document',
      path: '/mock/Replacement.md',
      text,
      encoding: 'UTF-8',
    };
  }, next);
  await emitLayoutMenu(page, 'recent-open:00000000-0000-4000-8000-000000000001');
  await expect(details(page)).toBeVisible();
  await expect(details(page).getByRole('treeitem', { name: 'Guide', exact: true })).toHaveCount(0);
  await expect(details(page).getByRole('treeitem')).toHaveCount(2);
  await expect(details(page).getByRole('treeitem', { name: 'Current', exact: true })).toBeVisible();
  await saveLayoutSource(page, info, 'new-document-outline', next);
});

for (const theme of ['github', 'night']) {
  test(`${theme}: only the document scrollbar occupies the window edge while outline scrolling stays independent`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await readyLayout(page, theme);
    const longSource =
      '\uFEFF# Long document\r\n\r\n' +
      Array.from(
        { length: 80 },
        (_, index) =>
          `## Section ${index + 1}\r\n\r\n${'Long paragraph with ordinary text. '.repeat(8)}\r\n\r\n`,
      ).join('');
    await openLayoutDocument(page, longSource);
    const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
    // Exercise real native scrollbar hit testing even when the test OS uses overlay bars.
    await frame.locator('head').evaluate((head) => {
      const style = document.createElement('style');
      style.textContent =
        'content,#typora-source .CodeMirror-scroll{scrollbar-width:auto!important;overflow-y:scroll!important}' +
        'content::-webkit-scrollbar,#typora-source .CodeMirror-scroll::-webkit-scrollbar{width:12px!important;display:block!important;background:transparent}' +
        'content::-webkit-scrollbar-thumb,#typora-source .CodeMirror-scroll::-webkit-scrollbar-thumb{background:#999!important;border-radius:6px}';
      head.append(style);
    });
    const history = await layoutHistory(page);
    await emitLayoutMenu(page, 'view:outline');
    await expectAligned(page);
    await expect
      .poll(async () => {
        const panel = await details(page).evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        const body = await frame
          .locator('body')
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        return panel === body;
      })
      .toBe(true);
    const outlineScroll = details(page).locator('.document-details-content');
    await expect(outlineScroll).toHaveCSS('scrollbar-width', 'none');
    expect(
      await outlineScroll.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    await content(page).evaluate((element) => {
      element.scrollTop = 0;
    });
    const before = await content(page).evaluate((element) => element.scrollTop);
    await outlineScroll.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => outlineScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await content(page).evaluate((element) => element.scrollTop)).toBe(before);
    const portBounds = await content(page).boundingBox();
    expect(
      portBounds && Math.abs(portBounds.x + portBounds.width - (page.viewportSize()?.width ?? 0)),
    ).toBeLessThanOrEqual(1);
    const panelBounds = await details(page).boundingBox();
    expect(
      await page.evaluate(() =>
        document.elementFromPoint(innerWidth - 2, 160)?.classList.contains('marklyra-editor-frame'),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        (x) => document.elementFromPoint(x, 160)?.closest('.document-details-panel') !== null,
        (panelBounds?.x ?? 0) + 30,
      ),
    ).toBe(true);
    await page.mouse.move((panelBounds?.x ?? 0) - 60, 200);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => content(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before);
    await content(page).evaluate((element) => {
      element.scrollTop = 0;
    });
    const scroll = await content(page).evaluate((element) => ({
      nativeWidth: (element as HTMLElement).offsetWidth - element.clientWidth,
      height: element.clientHeight,
      total: element.scrollHeight,
    }));
    await info.attach('native-scrollbar-metrics', {
      body: JSON.stringify(scroll),
      contentType: 'application/json',
    });
    if (!portBounds) throw Error('Missing document scrollport');
    const thumbCenter =
      portBounds.y + Math.max(12, (scroll.height * scroll.height) / scroll.total / 2);
    await page.mouse.move((page.viewportSize()?.width ?? 0) - 6, thumbCenter);
    await page.mouse.down();
    await page.mouse.move((page.viewportSize()?.width ?? 0) - 6, thumbCenter + 180, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() => content(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('single-window-edge-scrollbar.png') });
    await emitLayoutMenu(page, 'view:source');
    const sourceScroll = frame.locator('#typora-source .CodeMirror-scroll');
    await expect(sourceScroll).toBeVisible();
    await expect(frame.locator('#typora-source textarea')).toBeFocused();
    await expect
      .poll(() => sourceScroll.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(600);
    await expect
      .poll(async () => {
        const area = await editingArea(page, '#typora-source .CodeMirror-scroll');
        const panel = await details(page).boundingBox();
        return panel && Math.abs(area.x + area.width - panel.x);
      })
      .toBeLessThanOrEqual(2);
    const sourceBounds = await sourceScroll.boundingBox();
    expect(
      sourceBounds &&
        Math.abs(sourceBounds.x + sourceBounds.width - (page.viewportSize()?.width ?? 0)),
    ).toBeLessThanOrEqual(1);
    await sourceScroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    await sourceScroll.hover({ position: { x: 100, y: 160 } });
    await page.mouse.wheel(0, 600);
    // A legacy viewport-resize callback runs after 300ms. Scrolling must survive it.
    const settledScroll = await sourceScroll.evaluate(async (element) => {
      const start = performance.now();
      while (performance.now() - start < 380) await new Promise(requestAnimationFrame);
      return element.scrollTop;
    });
    expect(settledScroll).toBeGreaterThan(0);
    await sourceScroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    const sourceMetric = await sourceScroll.evaluate((element) => ({
      height: element.clientHeight,
      total: element.scrollHeight,
    }));
    if (!sourceBounds) throw Error('Missing source scrollport');
    const sourceThumb =
      sourceBounds.y +
      Math.max(12, (sourceMetric.height * sourceMetric.height) / sourceMetric.total / 2);
    await page.mouse.move((page.viewportSize()?.width ?? 0) - 6, sourceThumb);
    await page.mouse.down();
    await page.mouse.move((page.viewportSize()?.width ?? 0) - 6, sourceThumb + 150, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() => sourceScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await emitLayoutMenu(page, 'view:source');
    expect(await layoutHistory(page)).toBe(history);
    await saveLayoutSource(page, info, 'scrollbar-layout-preserves-source', longSource);
  });
}
