import { expect, test } from '@playwright/test';
import { searchFingerprint } from '../../apps/desktop/src/features/documents/search-position.js';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
  saveLayoutSource,
} from './layout.helpers.js';

const source = '\uFEFF# Search\r\n\r\n前🙂 needle\n\nTail  \r\n';

function installSearchPositionProbe(configuration: {
  text: string;
  fingerprint: string;
  other: boolean;
  changedOnOpen: boolean;
}) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'search_workspace')
      return {
        matches: [
          {
            relativePath: configuration.other ? 'Notes/Other.md' : 'Layout.md',
            line: 3,
            column: 5,
            matchLength: 6,
            preview: '前🙂 needle',
            previewMatchStart: 4,
            previewMatchLength: 6,
            expectedText: 'needle',
            sourceFingerprint: configuration.fingerprint,
          },
        ],
        scannedFiles: 1,
        skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
        truncated: false,
      };
    const result = await previous(command, args);
    if (command === 'open_workspace_document')
      return {
        ...(result as Record<string, unknown>),
        text: configuration.changedOnOpen
          ? configuration.text.replace('needle', 'changed')
          : configuration.text,
      };
    return result;
  };
}

for (const other of [false, true]) {
  test(`${other ? 'opened' : 'current'} document search uses exact source UTF-16 location`, async ({
    page,
  }, testInfo) => {
    await installLayout(page);
    await page.addInitScript(installSearchPositionProbe, {
      text: source,
      fingerprint: searchFingerprint(source),
      other,
      changedOnOpen: false,
    });
    await readyLayout(page, 'github');
    await openLayoutDocument(page, source);
    await emitLayoutMenu(page, 'open-folder');
    const history = await layoutHistory(page);
    await emitLayoutMenu(page, 'view:workspace-search');
    await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('needle');
    await page.locator('.workspace-results button').click();
    const frame = page.frameLocator('.marklyra-editor-frame');
    await expect
      .poll(() =>
        frame.locator('#write').evaluate(() => {
          const selection = getSelection();
          return {
            text: selection?.anchorNode?.textContent,
            offset: selection?.anchorOffset,
            collapsed: selection?.isCollapsed,
          };
        }),
      )
      .toEqual({ text: '前🙂 needle', offset: 4, collapsed: true });
    if (!other) expect(await layoutHistory(page)).toBe(history);
    await saveLayoutSource(page, testInfo, 'UTF16-location-preserves-source', source);
  });
}

test('stale current document search retains the live caret and dirty source', async ({
  page,
}, testInfo) => {
  await installLayout(page);
  await page.addInitScript(installSearchPositionProbe, {
    text: source,
    fingerprint: searchFingerprint(source),
    other: false,
    changedOnOpen: false,
  });
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:workspace-search');
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('needle');
  await expect(page.locator('.workspace-results button')).toHaveCount(1);
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect(frame.locator('#write > p').first()).toHaveText('前🙂 needleX');
  const history = await layoutHistory(page);
  await page.locator('.workspace-results button').click();
  await expect(page.locator('.native-document-notice')).toContainText('未跳转到旧位置');
  expect(await layoutHistory(page)).toBe(history);
  expect(
    await frame.locator('#write').evaluate(() => ({
      text: getSelection()?.anchorNode?.textContent,
      offset: getSelection()?.anchorOffset,
    })),
  ).toEqual({ text: '前🙂 needleX', offset: 11 });
  await saveLayoutSource(
    page,
    testInfo,
    'stale-search-preserves-dirty-source',
    source.replace('needle', 'needleX'),
  );
});

test('disk change between search and open does not jump to stale coordinates', async ({
  page,
}, testInfo) => {
  await installLayout(page);
  await page.addInitScript(installSearchPositionProbe, {
    text: source,
    fingerprint: searchFingerprint(source),
    other: true,
    changedOnOpen: true,
  });
  await readyLayout(page, 'github');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:workspace-search');
  await page.getByRole('searchbox', { name: '搜索文件', exact: true }).fill('needle');
  await page.locator('.workspace-results button').click();
  await expect(page.locator('.native-document-notice')).toContainText('未跳转到旧位置');
  await expect(
    page.frameLocator('.marklyra-editor-frame').locator('#write > p').first(),
  ).toHaveText('前🙂 changed');
  await saveLayoutSource(
    page,
    testInfo,
    'changed-open-preserves-actual-source',
    source.replace('needle', 'changed'),
  );
});
