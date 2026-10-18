import { expect, type Page, test } from '@playwright/test';
import type { DocumentFile, DocumentMetadata } from '../../apps/desktop/src/services/documents.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

interface MetadataProbe {
  metadata: DocumentMetadata;
  failQuery: boolean;
  holdSave: boolean;
  pendingSave: boolean;
  releaseSave(): void;
  rename(path: string): void;
}
type MetadataWindow = TestWindow & { metadataProbe: MetadataProbe };

function installMetadata() {
  if (window !== window.top) return;
  const host = window as MetadataWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const invoke = internals.invoke;
  let release: (() => void) | undefined;
  host.__desktopMock.nextDocument = {
    id: 'metadata-doc',
    path: '/mock/A.md',
    text: 'Alpha',
    encoding: 'UTF-8',
  };
  const probe: MetadataProbe = {
    metadata: { id: 'metadata-doc', path: '/mock/A.md', encoding: 'UTF-8', metadataRevision: 0 },
    failQuery: false,
    holdSave: false,
    pendingSave: false,
    releaseSave() {
      release?.();
      release = undefined;
      this.pendingSave = false;
    },
    rename(path) {
      this.metadata = {
        ...this.metadata,
        path,
        metadataRevision: this.metadata.metadataRevision + 1,
      };
      host.__desktopMock.emitTarget('main', 'document-metadata-changed', [{ ...this.metadata }]);
    },
  };
  host.metadataProbe = probe;
  internals.invoke = async (command, args = {}) => {
    if (command === 'get_document_metadata') {
      host.__desktopMock.calls.push({ command, args });
      if (probe.failQuery) throw Error('metadata temporarily unavailable');
      return { ...probe.metadata };
    }
    if (command === 'open_document') {
      const result = (await invoke(command, args)) as DocumentFile;
      return { ...result, metadataRevision: 0 };
    }
    if (command === 'save_document') {
      // IO finishes with A@0; hold only its transport acknowledgement.
      const snapshot = { ...probe.metadata };
      const saved = (await invoke(command, args)) as DocumentFile;
      const result = { ...saved, ...snapshot, text: String(args.text) };
      if (probe.holdSave) {
        probe.pendingSave = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return result;
    }
    return invoke(command, args);
  };
}

async function start(page: Page) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installMetadata);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await menu(page, 'open');
  await expect(page.locator('.document-title')).toHaveText('A.md');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText(
    'Alpha',
  );
}
async function menu(page: Page, action: string) {
  await page.evaluate((action) => (window as TestWindow).__desktopMock.emitMenu(action), action);
}
async function typeX(page: Page) {
  const paragraph = page.frameLocator('.marklyra-editor-frame').locator('#write > p').first();
  await paragraph.evaluate((paragraph) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    if (!text) throw Error('Missing paragraph text');
    paragraph.closest<HTMLElement>('#write')?.focus();
    getSelection()?.setBaseAndExtent(
      text,
      text.textContent?.length ?? 0,
      text,
      text.textContent?.length ?? 0,
    );
  });
  await page.keyboard.type('X');
  await expect(paragraph).toHaveText('AlphaX');
}

test('rename preserves the live DOM, selection and Undo while an old Save ACK is held', async ({
  page,
}) => {
  await start(page);
  await typeX(page);
  const frame = page.frameLocator('.marklyra-editor-frame');
  const source = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await page.evaluate(() => {
    (window as MetadataWindow).metadataProbe.holdSave = true;
  });
  await menu(page, 'save');
  await expect
    .poll(() => page.evaluate(() => (window as MetadataWindow).metadataProbe.pendingSave))
    .toBe(true);
  await frame
    .locator('#write > p')
    .first()
    .evaluate((paragraph) => {
      Reflect.set(window, 'metadataBefore', {
        paragraph,
        anchor: getSelection()?.anchorNode,
        offset: getSelection()?.anchorOffset,
      });
    });
  await page.evaluate(() => (window as MetadataWindow).metadataProbe.rename('/mock/Renamed.md'));
  await expect(page.locator('.document-title')).toContainText('Renamed.md');
  expect(
    await frame
      .locator('#write > p')
      .first()
      .evaluate((paragraph) => {
        const previous = Reflect.get(window, 'metadataBefore') as {
          paragraph: Node;
          anchor: Node;
          offset: number;
        };
        return (
          paragraph === previous.paragraph &&
          getSelection()?.anchorNode === previous.anchor &&
          getSelection()?.anchorOffset === previous.offset
        );
      }),
  ).toBe(true);
  await page.evaluate(() => (window as MetadataWindow).metadataProbe.releaseSave());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-title')).toHaveText('Renamed.md');
  await menu(page, 'undo');
  await expect(frame.locator('#write')).toHaveText('Alpha');
  await menu(page, 'redo');
  await expect(frame.locator('#write')).toHaveText('AlphaX');
  await expect(page.locator('.marklyra-editor-frame')).toHaveAttribute('src', source ?? '');
  expect(
    await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.filter(
          (c) => c.command === 'start_document_watch',
        ).length,
    ),
  ).toBeGreaterThanOrEqual(2);
});

test('foreign-window metadata cannot affect this document even when it names the same ID', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const host = window as MetadataWindow;
    host.__desktopMock.emitTarget('editor-other', 'document-metadata-changed', [
      { ...host.metadataProbe.metadata, path: '/foreign/Leak.md', metadataRevision: 99 },
    ]);
  });
  await typeX(page);
  await menu(page, 'save');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'get_document_metadata',
          ).length,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-title')).toHaveText('A.md');
});

test('a metadata query failure does not deny an already successful source save', async ({
  page,
}) => {
  await start(page);
  await typeX(page);
  await page.evaluate(() => {
    (window as MetadataWindow).metadataProbe.failQuery = true;
  });
  await menu(page, 'save');
  await expect(page.locator('.document-status')).toContainText('正文已保存，但文件路径尚未确认');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-dirty')).toHaveCount(0);
  await menu(page, 'undo');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toHaveText('Alpha');
});
