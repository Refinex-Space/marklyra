import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Files, document and outline (and the two settings panes) share one geometry on the shell
// canvas: same hairline and concentric radius, with the whole gap between cards acting as the
// handle. Materials follow the Liquid Glass layers (docs/DESIGN.md): the side panes are
// navigation glass, the document is the opaque content layer.

async function openPanes(page: Page, theme: string) {
  await installLayout(page, undefined, 'web');
  await page.setViewportSize({ width: 1280, height: 600 });
  await readyLayout(page, theme);
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:outline');
  await expect(page.locator('.document-details-resize')).toHaveAttribute('data-open', 'true');
  await expect
    .poll(async () => (await page.locator('.document-details-panel').boundingBox())?.width)
    .toBe(280);
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: side panes are glass, the document is opaque content, all on one geometry`, async ({
    page,
  }) => {
    await openPanes(page, theme);
    const cards = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw Error(`Missing ${selector}`);
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          border: `${style.borderTopWidth} ${style.borderTopColor}`,
        };
      };
      return {
        panes: ['.sidebar', 'main.document-area', '.document-details-body'].map(read),
        canvas: getComputedStyle(document.querySelector('.shell') as Element).backgroundColor,
        mount: getComputedStyle(document.querySelector('.runtime-editor-mount') as Element)
          .backgroundColor,
      };
    });
    const [files, content, details] = cards.panes;
    // Navigation glass: the two side panes share one translucent fill.
    expect(details).toEqual(files);
    expect(files?.background).toMatch(/^rgba\(.+, 0\.\d+\)$/);
    // Content layer: the document is opaque and differs from the glass and the canvas.
    expect(content?.background).toMatch(/^rgb\(/);
    expect(content?.background).not.toBe(files?.background);
    expect(content?.background).not.toBe(cards.canvas);
    for (const pane of cards.panes)
      expect({ radius: pane.radius, border: pane.border }).toEqual({
        radius: '12px',
        border: files?.border,
      });
    // A square fill under the editor would hide the document pane's rounded corners.
    expect(cards.mount).toBe('rgba(0, 0, 0, 0)');
  });
}

test('the whole gap between panes is the drag handle and shows a short centred grip', async ({
  page,
}) => {
  await openPanes(page, 'marklyra-light');
  const gaps = await page.evaluate(() => {
    const at = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.classList.contains('pane-resize-handle') ?? false;
    const side = document.querySelector('aside.sidebar')?.getBoundingClientRect();
    const main = document.querySelector('main.document-area')?.getBoundingClientRect();
    const details = document.querySelector('.document-details-panel')?.getBoundingClientRect();
    if (!side || !main || !details) throw Error('Missing panes');
    const sampleGap = (left: number, right: number) =>
      [0.25, 0.5, 0.75].map((part) => at(left + (right - left) * part, 300));
    const leftCenter = (side.right + main.left) / 2;
    return {
      left: sampleGap(side.right, main.left),
      right: sampleGap(main.right, details.left),
      leftTop: at(leftCenter, side.top + 2),
      leftBottom: at(leftCenter, side.bottom - 2),
    };
  });
  expect(gaps).toEqual({
    left: [true, true, true],
    right: [true, true, true],
    leftTop: true,
    leftBottom: true,
  });
  for (const name of ['调整侧栏宽度', '调整目录宽度']) {
    const handle = page.getByRole('separator', { name });
    const box = await handle.boundingBox();
    if (!box) throw Error('Missing handle');
    const hitArea = await handle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const previous = element.previousElementSibling?.getBoundingClientRect();
      const next = element.nextElementSibling?.getBoundingClientRect();
      const reach = getComputedStyle(element, '::after');
      const left = rect.left + Number.parseFloat(reach.left);
      const right = rect.right - Number.parseFloat(reach.right);
      const hit = (x: number) =>
        document.elementFromPoint(x, rect.top + rect.height / 2) === element;
      return {
        spansGap: !!previous && !!next && rect.left === previous.right && rect.right === next.left,
        width: right - left,
        allPixelsHit: Array.from({ length: Math.round(right - left) }, (_, index) =>
          hit(left + index + 0.5),
        ).every(Boolean),
      };
    });
    // The seam is 4px, but the supported pointer target is 16px wide.
    expect(hitArea).toEqual({ spansGap: true, width: 16, allPixelsHit: true });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => handle.evaluate((element) => getComputedStyle(element, '::before').opacity))
      .not.toBe('0');
    const grip = await handle.evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return {
        width: style.width,
        height: style.height,
        radius: style.borderTopLeftRadius,
        centred:
          Math.abs(
            Number.parseFloat(style.top) +
              Number.parseFloat(style.marginTop) +
              Number.parseFloat(style.height) / 2 -
              element.getBoundingClientRect().height / 2,
          ) < 1,
        cursor: getComputedStyle(element).cursor,
      };
    });
    // A short pill in the vertical middle, never a full-height rule.
    expect(grip).toMatchObject({
      width: '3px',
      height: '36px',
      centred: true,
      cursor: 'col-resize',
    });
    expect(Number.parseFloat(grip.radius)).toBeGreaterThan(1);
    await page.mouse.move(640, 300);
    await expect
      .poll(() => handle.evaluate((element) => getComputedStyle(element, '::before').opacity))
      .toBe('0');
  }
});

test('dragging moves the panes without re-rendering per frame and commits once on release', async ({
  page,
}) => {
  await openPanes(page, 'marklyra-light');
  const handle = page.getByRole('separator', { name: '调整侧栏宽度' });
  const box = await handle.boundingBox();
  if (!box) throw Error('Missing handle');
  const x = box.x + box.width / 2;
  await page.mouse.move(x, 300);
  await page.mouse.down();
  await page.mouse.move(x + 50, 300, { steps: 5 });
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  expect((await page.locator('aside.sidebar').boundingBox())?.width).toBe(320);
  await page.mouse.move(x + 20, 300, { steps: 3 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
  expect((await page.locator('aside.sidebar').boundingBox())?.width).toBe(290);
  // Dragging back to where it started must still leave the committed width in place.
  const again = await handle.boundingBox();
  if (!again) throw Error('Missing handle');
  await page.mouse.move(again.x + again.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width / 2 - 20, 300, { steps: 4 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '270');
  expect((await page.locator('aside.sidebar').boundingBox())?.width).toBe(270);
});

test('a short hairline separates the document actions from the system caption buttons', async ({
  page,
}) => {
  await openPanes(page, 'marklyra-light');
  const divider = await page.evaluate(() => {
    const actions = document.querySelector('.titlebar-actions');
    const caption = document.querySelector('.titlebar-caption');
    const bar = document.querySelector('header.titlebar');
    if (!actions || !caption || !bar) throw Error('Missing titlebar');
    const style = getComputedStyle(actions, '::after');
    return {
      width: style.width,
      height: Number.parseFloat(style.height),
      band: bar.getBoundingClientRect().height,
      captionX: caption.getBoundingClientRect().left,
      actionsRight: actions.getBoundingClientRect().right,
    };
  });
  expect(divider.width).toBe('1px');
  // Clear of the band's top and bottom edges by a comfortable margin.
  expect(divider.height).toBe(16);
  expect(divider.band - divider.height).toBeGreaterThanOrEqual(12);
  expect(divider.captionX).toBeGreaterThanOrEqual(divider.actionsRight - 1);
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: settings are a glass navigation card and an opaque content card`, async ({
    page,
  }) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await expect(ui.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
    const cards = await ui.locator('html').evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw Error(`Missing ${selector}`);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          background: style.backgroundColor,
          radius: style.borderTopLeftRadius,
          border: `${style.borderTopWidth} ${style.borderTopColor}`,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: innerHeight - rect.bottom,
        };
      };
      return {
        navigation: read('.pane-sm.sidebar'),
        content: read('.pane-group > .pane'),
        canvas: getComputedStyle(document.documentElement).backgroundColor,
      };
    });
    // Same layers as the main window: glass navigation, opaque content, one concentric radius.
    expect(cards.navigation.background).toMatch(/^rgba\(.+, 0\.\d+\)$/);
    expect(cards.content.background).toMatch(/^rgb\(/);
    expect(cards.content.background).not.toBe(cards.canvas);
    expect(cards.navigation.radius).toBe('12px');
    expect(cards.content.radius).toBe('12px');
    // The same 8px window gap and 4px seam between the cards as the main window.
    expect(cards.navigation.left).toBe(8);
    expect(cards.content.left - cards.navigation.right).toBe(4);
    expect(cards.navigation.bottom).toBe(8);
    expect(cards.content.bottom).toBe(8);
    expect(cards.navigation.top).toBe(4);
  });
}

// Some categories are React pages laid over the frame (export, agents, Git, calendar…). Every
// category's content card must sit exactly where the frame's own card does, with the same seam.
test('every settings category shows its content card in the same place and material', async ({
  page,
}) => {
  await installLayout(page);
  await page.setViewportSize({ width: 1280, height: 760 });
  await readyLayout(page, 'marklyra-dark');
  await emitLayoutMenu(page, 'preferences');
  const ui = page.frameLocator('.runtime-preferences-frame');
  await expect(ui.getByRole('button', { name: '返回应用', exact: true })).toBeVisible();
  const measure = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      radius: style.borderTopLeftRadius,
      border: style.borderTopColor,
    };
  };
  const card = async () => {
    const overlay = page.locator('.preferences-native-overlay');
    if (await overlay.count()) return { kind: 'overlay', ...(await overlay.evaluate(measure)) };
    // The frame is cross-origin: measure inside it, then add the frame's own offset.
    const frame = await page.locator('.runtime-preferences-frame').evaluate(measure);
    const inner = await ui.locator('.pane-group > .pane').evaluate(measure);
    return {
      kind: 'frame',
      ...inner,
      left: inner.left + frame.left,
      right: inner.right + frame.left,
      top: inner.top + frame.top,
      bottom: inner.bottom + frame.top,
    };
  };
  const { kind: referenceKind, ...reference } = await card();
  expect(referenceKind).toBe('frame');
  const kinds = new Set<string>();
  for (const name of ['导出', '外观', '智能体', 'Git 同步', '日历', '赞助', '文件']) {
    await ui.getByRole('button', { name, exact: true }).click();
    await expect(ui.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect
      .poll(async () => {
        const { kind, ...geometry } = await card();
        kinds.add(kind);
        return geometry;
      }, name)
      .toEqual(reference);
  }
  // Both kinds of page were measured.
  expect([...kinds].sort()).toEqual(['frame', 'overlay']);
});
