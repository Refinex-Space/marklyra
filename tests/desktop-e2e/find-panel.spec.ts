import { readFileSync } from 'node:fs';
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
import { waitForNativeUndo } from './native-menu.helpers.js';

const source = readFileSync(new URL('../fixtures/visual.md', import.meta.url), 'utf8');

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: sidebar search option icons match the original find panel`, async ({
    page,
  }, testInfo) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:workspace-search');
    const input = page.getByRole('searchbox', { name: '搜索文件', exact: true });
    await expect(input).toBeFocused();
    await emitLayoutMenu(page, 'find');
    const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
    for (const [label, name] of [
      ['区分大小写', 'case'],
      ['查找整个单词', 'word'],
      ['正则表达式', 'regexp'],
    ] as const) {
      const button = page.getByRole('button', { name: label, exact: true });
      const icon = button.locator('svg');
      const original = frame.locator(`#searchpanel-${name}-option-btn svg`);
      await expect(icon.locator('use')).toHaveAttribute(
        'href',
        `/__runtime-icons/search-options.svg#find-and-replace-icon-${name}`,
      );
      // Cmd+F covers the sidebar header; compare rendered SVG geometry despite that overlap.
      await expect
        .poll(() => icon.evaluate((element) => (element as SVGGraphicsElement).getBBox().width))
        .toBeGreaterThan(0);
      const geometry = [];
      for (const svg of [icon, original])
        geometry.push(
          await svg.locator('use').evaluate((element) => {
            const { width, height } = element.getBoundingClientRect();
            return { width: Math.round(width * 100), height: Math.round(height * 100) };
          }),
        );
      expect(geometry[0]).toEqual(geometry[1]);
    }
    await frame.locator('#md-searchpanel .close-btn').click();
    await input.focus();
    const caseOption = page.getByRole('button', { name: '区分大小写', exact: true });
    const word = page.getByRole('button', { name: '查找整个单词', exact: true });
    const regexp = page.getByRole('button', { name: '正则表达式', exact: true });
    await caseOption.click();
    await expect(caseOption).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toBeFocused();
    await word.click();
    await expect(word).toHaveAttribute('aria-pressed', 'true');
    await regexp.click();
    await expect(regexp).toHaveAttribute('aria-pressed', 'true');
    await expect(word).toHaveAttribute('aria-pressed', 'false');
    await word.click();
    await expect(word).toHaveAttribute('aria-pressed', 'true');
    await expect(regexp).toHaveAttribute('aria-pressed', 'false');
    await expect(input).toBeFocused();
    await page.locator('.marklyra-sidebar-header').screenshot({
      path: testInfo.outputPath('sidebar-search-options.png'),
    });
  });

  test(`${theme}: find close button shows a hover background`, async ({ page }, testInfo) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'find');
    const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
    const panel = frame.locator('#md-searchpanel');
    const close = panel.locator('.close-btn');
    const expectCentered = async () => {
      const offset = await close.evaluate((element) => {
        const button = element.getBoundingClientRect();
        const glyph = element.querySelector('.ion-close-round')?.getBoundingClientRect();
        if (!glyph) throw Error('Missing close glyph');
        return {
          x: Math.abs(glyph.left + glyph.width / 2 - button.left - button.width / 2),
          y: Math.abs(glyph.top + glyph.height / 2 - button.top - button.height / 2),
          width: button.width,
          height: button.height,
        };
      });
      expect(offset.x).toBeLessThanOrEqual(0.5);
      expect(offset.y).toBeLessThanOrEqual(0.5);
      expect(offset.width).toBe(26);
      expect(offset.height).toBe(26);
    };
    await frame.locator('#search-panel-input').hover();
    await expectCentered();
    const background = await close.evaluate((element) => getComputedStyle(element).backgroundColor);
    const bounds = await close.boundingBox();
    const inputBounds = await frame.locator('#search-panel-input').boundingBox();
    if (!bounds || !inputBounds) throw Error('Missing find controls');
    expect(Math.abs(bounds.y - inputBounds.y)).toBeLessThanOrEqual(2);
    expect(bounds.x).toBeGreaterThan(inputBounds.x + inputBounds.width);
    await close.locator('.ion-close-round').hover();
    await expect
      .poll(() => close.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(background);
    await expect(close).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(close).toHaveCSS('border-radius', '4px');
    await expect(close).toHaveCSS('opacity', '1');
    await expectCentered();
    expect(await close.boundingBox()).toEqual(bounds);
    const hoverBackground = await close.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await panel.screenshot({ path: testInfo.outputPath('find-close-hover.png') });
    await page.mouse.down();
    try {
      expect(await close.evaluate((element) => element.matches(':active'))).toBe(true);
      await expect(close).toHaveCSS('box-shadow', 'none');
      await expect(close).toHaveCSS('background-color', hoverBackground);
      await expect(close).toHaveCSS('border-radius', '4px');
      await expectCentered();
      expect(await close.boundingBox()).toEqual(bounds);
      await panel.screenshot({ path: testInfo.outputPath('find-close-pressed.png') });
      await frame.locator('#search-panel-input').hover();
    } finally {
      await page.mouse.up();
    }
    await expect(panel).toBeVisible();
    await frame.locator('#search-panel-input').hover();
    await expect(close).toHaveCSS('background-color', background);
    await close.click();
    await expect(panel).toBeHidden();
  });
}

async function presentation(page: Page) {
  return page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#md-searchpanel')
    .evaluate((panel) => {
      const input = panel.querySelector('#search-panel-input');
      const content = document.querySelector('content');
      if (!input || !content) throw Error('Missing original find UI');
      const rect = panel.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const style = getComputedStyle(panel);
      const inputStyle = getComputedStyle(input);
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        height: rect.height,
        inputLeft: inputRect.left,
        inputTop: inputRect.top,
        inputHeight: inputRect.height,
        fontSize: inputStyle.fontSize,
        padding: style.padding,
        shadow: style.boxShadow,
        background: style.backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        contentTop: content.getBoundingClientRect().top,
        originalContentTop: Number.parseFloat(getComputedStyle(content).top),
      };
    });
}

// The document pane starts 4px under the 28pt titlebar and has a 1px border.
const FIND_TOP = 33;

async function expectWindowWideFind(page: Page) {
  const panel = page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#md-searchpanel');
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const rect = await panel.boundingBox();
      return rect && { x: rect.x, y: rect.y, width: rect.width };
    })
    .toEqual({ x: 0, y: FIND_TOP, width: page.viewportSize()?.width });
  // A DOM rectangle alone would miss clipping by the host or its sidebar header.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.elementFromPoint(110, 48)?.classList.contains('marklyra-editor-frame'),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => document.elementFromPoint(50, 160)?.closest('.sidebar') !== null),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      document.elementFromPoint(innerWidth - 100, 14)?.classList.contains('native-titlebar-drag'),
    ),
  ).toBe(true);
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: original find UI spans the window above every sidebar mode`, async ({
    page,
  }, testInfo) => {
    await installLayout(page);
    await readyLayout(page, theme);
    await openLayoutDocument(page, source);
    await layoutCaret(page);
    await page.keyboard.type('X');
    await waitForNativeUndo(page);
    await emitLayoutMenu(page, 'undo');
    await expect(
      page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > p').last(),
    ).toHaveText('Tail text.');
    const history = await layoutHistory(page);
    const iframe = await page.locator('.runtime-area .marklyra-editor-frame').elementHandle();
    await emitLayoutMenu(page, 'open-folder');
    const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
    const panel = frame.locator('#md-searchpanel');
    const input = frame.locator('#search-panel-input');
    const captures = [];

    for (const mode of ['files', 'outline', 'workspace-search']) {
      await emitLayoutMenu(page, `view:${mode}`);
      if (mode === 'workspace-search')
        await expect(page.getByRole('searchbox', { name: '搜索文件', exact: true })).toBeFocused();
      // Native CmdOrCtrl+F delivers this menu action even with Shell input focus.
      await emitLayoutMenu(page, 'find');
      await expectWindowWideFind(page);
      await input.click();
      await expect(input).toBeFocused();
      await input.fill('Visual');
      await input.press('Enter');
      const state = await presentation(page);
      expect(state).toMatchObject({
        left: 0,
        // Inside the frame, whose top edge is the document pane's inner top.
        top: 0,
        height: 39,
        inputLeft: 98,
        inputHeight: 26,
        fontSize: '12px',
        padding: '5px 8px 0px 16px',
      });
      // Night's row line-height and browser subpixel rounding differ.
      expect(Math.abs(state.inputTop - 7)).toBeLessThan(2);
      expect(state.background).toBe(state.bodyBackground);
      expect(Math.abs(state.contentTop - state.originalContentTop)).toBeLessThan(1);
      await expect(page.locator('.marklyra-find-panel-shadow').first()).toHaveCSS(
        'box-shadow',
        state.shadow,
      );
      captures.push({ mode, ...state });
      await page.screenshot({ path: testInfo.outputPath(`${mode}.png`) });
      await panel.locator('.close-btn').click();
      await expect(panel).toBeHidden();
      await expect(page.locator('.marklyra-find-panel-shadow:visible')).toHaveCount(0);
    }

    await emitLayoutMenu(page, 'view:files');
    await frame.locator('#write > p').last().click();
    await page.keyboard.press('Control+f');
    await expectWindowWideFind(page);
    await input.press('Escape');
    await page.keyboard.press('Meta+f');
    await expectWindowWideFind(page);

    await emitLayoutMenu(page, 'replace');
    await expect(panel).toHaveClass(/searchpanel-replace-mode/);
    await expect.poll(async () => (await panel.boundingBox())?.height).toBe(74);
    await frame.locator('#search-panel-replace-input').click();
    await expect(frame.locator('#search-panel-replace-input')).toBeFocused();
    await input.press('Escape');
    await expect(panel).toBeHidden();

    await emitLayoutMenu(page, 'find');
    await page.getByRole('separator', { name: '调整侧栏宽度' }).press('Shift+ArrowRight');
    await expectWindowWideFind(page);
    await page.setViewportSize({ width: 960, height: 720 });
    await expectWindowWideFind(page);
    await emitLayoutMenu(page, 'view:sidebar');
    await expect(page.locator('aside.sidebar')).toBeHidden();
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(960);
    await input.click();
    await expect(input).toBeFocused();
    await input.press('Escape');
    await expect(panel).toBeHidden();
    await emitLayoutMenu(page, 'view:source');
    await expect(frame.locator('#marklyra-source')).toBeVisible();
    await emitLayoutMenu(page, 'find');
    await expect.poll(async () => (await panel.boundingBox())?.width).toBe(960);
    await input.click();
    await expect(input).toBeFocused();
    await input.press('Escape');
    await emitLayoutMenu(page, 'view:source');
    await expect(frame.locator('#marklyra-source')).toBeHidden();

    await emitLayoutMenu(page, 'view:files');
    await page.evaluate(() => {
      Reflect.set(window, '__marklyraLayoutFullscreen', true);
      (window as TestWindow).__desktopMock.emitEvent('tauri://resize', { width: 960, height: 720 });
    });
    await expect(page.locator('.shell')).toHaveAttribute('data-fullscreen', 'true');
    await emitLayoutMenu(page, 'find');
    await expect
      .poll(async () => {
        const rect = await panel.boundingBox();
        return rect && { x: rect.x, y: rect.y, width: rect.width };
      })
      // Fullscreen has no titlebar: the document pane sits one gap (8px) plus its border down.
      .toEqual({ x: 0, y: 9, width: 960 });
    await input.click();
    await expect(input).toBeFocused();
    await input.press('Escape');
    await page.evaluate(() => {
      Reflect.set(window, '__marklyraLayoutFullscreen', false);
      (window as TestWindow).__desktopMock.emitEvent('tauri://resize', { width: 960, height: 720 });
    });
    await expect(page.locator('.shell')).toHaveAttribute('data-fullscreen', 'false');
    expect(await layoutHistory(page)).toBe(history);
    expect(await iframe?.evaluate((element) => element.isConnected)).toBe(true);
    await emitLayoutMenu(page, 'redo');
    await expect(frame.locator('#write > p').last()).toHaveText('TailX text.');
    await emitLayoutMenu(page, 'undo');
    await saveLayoutSource(page, testInfo, 'find-preserves-source', source);
    await testInfo.attach('presentation', {
      contentType: 'application/json',
      body: JSON.stringify(captures, null, 2),
    });
  });
}
