import { expect, type Page, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

async function selectParagraphText(page: Page, start: number, end: number) {
  await page
    .frameLocator('.marklyra-editor-frame')
    .locator('#write > p')
    .first()
    .evaluate(
      (paragraph, { start, end }) => {
        const walker = paragraph.ownerDocument.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
        const points: { node: Node; from: number; to: number }[] = [];
        let offset = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const length = node.textContent?.length ?? 0;
          points.push({ node, from: offset, to: offset + length });
          offset += length;
        }
        const point = (position: number) => {
          const value = points.find((point) => position >= point.from && position <= point.to);
          if (!value) throw new Error('Missing paragraph selection boundary');
          return { node: value.node, offset: position - value.from };
        };
        const anchor = point(start),
          head = point(end);
        paragraph.ownerDocument.querySelector<HTMLElement>('#write')?.focus();
        paragraph.ownerDocument
          .getSelection()
          ?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
      },
      { start, end },
    );
}

test('original preferences controls persist typed values and affect the existing real editor', async ({
  page,
}) => {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toHaveText('Alpha');
  const instance = await page.locator('.marklyra-editor-frame').elementHandle();
  const preferences = await page.context().newPage();
  try {
    await preferences.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
    await preferences.goto('/?view=preferences');
    const original = preferences.frameLocator('.runtime-preferences-frame');
    await expect(preferences.locator('.runtime-preferences-frame')).toHaveAttribute(
      'title',
      'MarkLyra 偏好设置',
    );
    await expect(original.locator('.nav-group-item')).toHaveCount(11);
    await expect(original.getByRole('button', { name: '智能体', exact: true })).toBeVisible();
    await original.locator('.nav-group-item').nth(5).click();
    await original.locator('[data-marklyra-preference="useCustomFontSize"][value="true"]').check();
    await original.locator('[data-marklyra-preference="customFontSize"]').fill('18');
    await original.locator('.nav-group-item').nth(1).click();
    await original.locator('[data-marklyra-preference="no_pairing_match"]').uncheck();
    await original.locator('[data-marklyra-preference="noEmojiAutoComplete"]').uncheck();
    await original.locator('[data-marklyra-preference="auto_expand_block"]').check();
    await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('mock-application-preferences') ?? '{}').values,
        ),
      )
      .toMatchObject({
        useCustomFontSize: true,
        customFontSize: 18,
        no_pairing_match: true,
        noEmojiAutoComplete: true,
        auto_expand_block: true,
      });
    await expect
      .poll(() =>
        write.evaluate((element) => {
          const runtime = element.ownerDocument.defaultView as unknown as {
            File: { option: Record<string, unknown> };
          };
          return {
            font: element.ownerDocument.documentElement.style.fontSize,
            ...runtime.File.option,
          };
        }),
      )
      .toMatchObject({
        font: '18px',
        useCustomFontSize: true,
        noPairingMatch: true,
        noEmojiAutoComplete: true,
        expandSimpleBlock: true,
      });
    expect(await instance?.evaluate((element) => element.isConnected)).toBe(true);
    await expect(write).toHaveText('Alpha');
    await page.bringToFront();
    await write.locator('p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type('(');
    await expect(write).toHaveText('Alpha(');
    for (const [action, expected] of [
      ['save', 'Alpha('],
      ['undo', 'Alpha'],
      ['redo', 'Alpha('],
    ] as const) {
      if (action !== 'save')
        await page.evaluate(
          (action) => (window as TestWindow).__desktopMock.emitMenu(action),
          action,
        );
      await expect(write).toHaveText(expected);
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'save_document')
                .at(-1)?.args.text,
          ),
        )
        .toBe(expected);
    }
  } finally {
    await preferences.close();
  }
});

test('failed font persistence restores the confirmed value instead of retaining an optimistic input draft', async ({
  page,
}) => {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.addInitScript(() => {
    localStorage.setItem(
      'marklyra-preferences-v1',
      JSON.stringify({
        editorPreferences: { useCustomFontSize: true, customFontSize: 14 },
      }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mock-application-preferences')
        throw new DOMException('blocked for regression', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/?view=preferences');
  const original = page.frameLocator('.runtime-preferences-frame');
  await expect(original.locator('.nav-group-item')).toHaveCount(11);
  await original.locator('.nav-group-item').nth(5).click();
  const size = original.locator('[data-marklyra-preference="customFontSize"]');
  await size.fill('20');
  await expect(original.locator('#marklyra-preferences-status')).toContainText('保存结果未确认');
  await expect(size).toHaveValue('14');
  await expect(size).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('marklyra-preferences-v1') ?? '{}').editorPreferences
          .customFontSize,
    ),
  ).toBe(14);
});

test('original Markdown pairing control applies after warm caches and retains one-step saved history', async ({
  page,
}) => {
  await page.addInitScript(installMock, { nativeChrome: true });
  await page.addInitScript(installRecoveryMock);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('open'));
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await expect(write).toHaveText('Alpha');
  await write.locator('p').first().click();
  await selectParagraphText(page, 0, 5);
  await page.keyboard.type('(');
  await expect(write).toHaveText('(Alpha)');
  await selectParagraphText(page, 0, 1);
  await page.keyboard.press('Backspace');
  await expect(write).toHaveText('Alpha)');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write).toHaveText('(Alpha)');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect(write).toHaveText('Alpha');
  const preferences = await page.context().newPage();
  try {
    await preferences.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
    await preferences.goto('/?view=preferences');
    const original = preferences.frameLocator('.runtime-preferences-frame');
    await expect(original.locator('.nav-group-item')).toHaveCount(11);
    await original.locator('.nav-group-item').nth(1).click();
    const pairing = original.locator('[data-marklyra-preference="match_pari_markdown"]');
    await expect(pairing).toBeEnabled();
    await pairing.check();
    await expect(original.locator('#marklyra-preferences-status')).toBeHidden();
    await expect
      .poll(() =>
        write.evaluate(
          (element) =>
            (
              element.ownerDocument.defaultView as unknown as {
                File: { option: { autoPairExtendSymbol: boolean } };
              }
            ).File.option.autoPairExtendSymbol,
        ),
      )
      .toBe(true);
    await page.bringToFront();
    await selectParagraphText(page, 0, 5);
    await page.keyboard.type('*');
    for (const [action, expected] of [
      ['save', '*Alpha*'],
      ['undo', 'Alpha'],
      ['redo', '*Alpha*'],
    ] as const) {
      if (action !== 'save')
        await page.evaluate(
          (action) => (window as TestWindow).__desktopMock.emitMenu(action),
          action,
        );
      await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('save'));
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as TestWindow).__desktopMock.calls
                .filter((call) => call.command === 'save_document')
                .at(-1)?.args.text,
          ),
        )
        .toBe(expected);
    }
    await preferences.bringToFront();
    await original.locator('[data-marklyra-preference="no_pairing_match"]').uncheck();
    await expect(pairing).toBeDisabled();
    await expect(pairing).toHaveAttribute('title', '请先开启“匹配括号和引号”。');
    await original.locator('[data-marklyra-preference="no_pairing_match"]').check();
    await expect(pairing).toBeEnabled();
    await expect(pairing).not.toHaveAttribute('title', /暂不支持|请先开启/);
    await expect(pairing).toBeChecked();
  } finally {
    await preferences.close();
  }
});
