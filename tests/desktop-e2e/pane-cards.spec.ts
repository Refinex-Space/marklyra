import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Files, document and outline (and the two settings panes) are one card language on the shell
// canvas: same fill, hairline and radius, with the whole gap between cards acting as the handle.

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
  test(`${theme}: the three panes share one fill, border and radius on the canvas`, async ({
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
    for (const pane of cards.panes) expect(pane).toEqual(cards.panes[0]);
    expect(cards.panes[0]?.radius).toBe('8px');
    expect(cards.panes[0]?.background).not.toBe(cards.canvas);
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
    // The current seam is narrow, but the supported pointer target remains 14px wide.
    expect(hitArea).toEqual({ spansGap: true, width: 14, allPixelsHit: true });
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
  test(`${theme}: settings are two cards with the same fill as the main panes`, async ({
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
    expect(cards.navigation.background).toBe(cards.content.background);
    expect(cards.navigation.background).not.toBe(cards.canvas);
    expect(cards.navigation.radius).toBe('8px');
    expect(cards.content.radius).toBe('8px');
    expect(cards.navigation.border).toBe(cards.content.border);
    // The same 8px window gap and 8px between the cards as the main window.
    expect(cards.navigation.left).toBe(8);
    expect(cards.content.left - cards.navigation.right).toBe(8);
    expect(cards.navigation.bottom).toBe(8);
    expect(cards.content.bottom).toBe(8);
    expect(cards.navigation.top).toBe(4);
  });
}
