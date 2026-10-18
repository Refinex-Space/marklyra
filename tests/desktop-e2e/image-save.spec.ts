import { expect, test } from '@playwright/test';
import type { SaveOwnershipWindow } from '../../apps/desktop/src/features/documents/test/save-ownership.fixture.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

type ImageWindow = SaveOwnershipWindow &
  TestWindow & {
    __marklyraSave: { fail: boolean; hold: boolean; noCopy: boolean; release?: () => void };
  };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(() => {
    const target = window as unknown as ImageWindow & {
      __TAURI_INTERNALS__: {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
    };
    const invoke = target.__TAURI_INTERNALS__.invoke;
    let serial = 0;
    target.__marklyraSave = { fail: false, hold: false, noCopy: false };
    target.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (
        ![
          'create_image_draft',
          'close_image_draft',
          'set_document_image_context',
          'prepare_document_image_save',
          'commit_document_image_save',
          'cancel_document_image_save',
        ].includes(command)
      )
        return invoke(command, args);
      target.__desktopMock.calls.push({ command, args });
      if (command === 'create_image_draft') return `draft-${++serial}`;
      if (command === 'prepare_document_image_save')
        return {
          kind: 'prepared',
          operationId: 'image-save',
          mappings: target.__marklyraSave.noCopy
            ? []
            : [
                {
                  source: 'file:///owned/a.png',
                  target: { source: 'assets/a.png', url: 'blob:owned-target' },
                },
              ],
        };
      if (command === 'commit_document_image_save') {
        if (target.__marklyraSave.hold)
          await new Promise<void>((resolve) => {
            target.__marklyraSave.release = resolve;
          });
        if (target.__marklyraSave.fail) throw new Error('controlled disk failure');
        return { id: 'saved-image', path: '/mock/Saved.md', text: args.text, encoding: 'UTF-8' };
      }
      return null;
    };
  });
  await page.route('**/save-fixture.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="root"></div><script type="module" src="/src/features/documents/test/save-ownership.fixture.tsx"></script>',
    }),
  );
  await page.goto('/save-fixture.html');
  await expect(page.locator('output')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() =>
    (window as unknown as ImageWindow).__saveOwnershipFixture.initializeImages(),
  );
});

for (const fails of [false, true])
  test(`new untitled image ownership changes only after load succeeds: failure=${fails}`, async ({
    page,
  }) => {
    await page.evaluate((fails) => {
      const fixture = (window as unknown as ImageWindow).__saveOwnershipFixture;
      fixture.first.holdLoad = true;
      fixture.first.failLoad = fails;
      void fixture.newDocument();
    }, fails);
    await expect
      .poll(() =>
        page.evaluate(
          () => !!(window as unknown as ImageWindow).__saveOwnershipFixture.first.releaseLoad,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(() =>
        (window as unknown as ImageWindow).__desktopMock.calls.filter(
          (call) => call.command === 'close_image_draft',
        ),
      ),
    ).toEqual([]);
    await page.evaluate(() =>
      (window as unknown as ImageWindow).__saveOwnershipFixture.first.releaseLoad?.(),
    );
    await expect(page.locator('output')).toHaveText('idle');
    const result = await page.evaluate(() => {
      const w = window as unknown as ImageWindow;
      return {
        context: w.__saveOwnershipFixture.first.context,
        closed: w.__desktopMock.calls
          .filter((call) => call.command === 'close_image_draft')
          .map((call) => call.args.id),
        active: w.__desktopMock.calls
          .filter((call) => call.command === 'set_document_image_context')
          .at(-1)?.args.id,
      };
    });
    expect(result).toEqual({
      context: fails ? 'draft-1' : 'draft-2',
      closed: [fails ? 'draft-2' : 'draft-1'],
      active: fails ? 'draft-1' : 'draft-2',
    });
  });

for (const branch of ['copy', 'no-copy', 'disk-failure', 'late-input', 'unproven'] as const)
  test(`image Save As preserves exact body and history across ${branch}`, async ({ page }) => {
    await page.evaluate((branch) => {
      const w = window as unknown as ImageWindow,
        fixture = w.__saveOwnershipFixture;
      fixture.first.references = ['file:///owned/a.png'];
      fixture.first.unproven = branch === 'unproven';
      fixture.edit('before\n![image](file:///owned/a.png)\nafter\n');
      w.__marklyraSave.fail = branch === 'disk-failure';
      w.__marklyraSave.hold = branch === 'late-input';
      w.__marklyraSave.noCopy = branch === 'no-copy' || branch === 'unproven';
      fixture.save(true);
    }, branch);
    if (branch === 'late-input') {
      await expect
        .poll(() =>
          page.evaluate(() => !!(window as unknown as ImageWindow).__marklyraSave.release),
        )
        .toBe(true);
      await page.evaluate(() => {
        const w = window as unknown as ImageWindow;
        w.__saveOwnershipFixture.edit('new input\n![image](file:///owned/a.png)\n');
        w.__marklyraSave.release?.();
      });
    }
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as ImageWindow).__saveOwnershipFixture.outcome),
      )
      .toBeDefined();
    const result = await page.evaluate(() => {
      const w = window as unknown as ImageWindow,
        fixture = w.__saveOwnershipFixture;
      return {
        outcome: fixture.outcome,
        raw: fixture.first.raw,
        patches: fixture.first.patches,
        context: fixture.first.context,
        dirty: fixture.dirty,
        writes: w.__desktopMock.calls
          .filter((call) => call.command === 'commit_document_image_save')
          .map((call) => call.args.text),
        cancelled: w.__desktopMock.calls.some(
          (call) => call.command === 'cancel_document_image_save',
        ),
        request: w.__desktopMock.calls.find(
          (call) => call.command === 'prepare_document_image_save',
        )?.args.request,
      };
    });
    const original = 'before\n![image](file:///owned/a.png)\nafter\n';
    const mapped = original.replace('file:///owned/a.png', 'assets/a.png');
    expect(result.writes).toEqual([
      branch === 'no-copy' || branch === 'unproven' ? original : mapped,
    ]);
    expect(result.patches).toBe(branch === 'copy' ? 1 : 0);
    expect(result.raw).toBe(
      branch === 'late-input'
        ? 'new input\n![image](file:///owned/a.png)\n'
        : branch === 'copy'
          ? mapped
          : original,
    );
    expect(result.outcome).toBe(branch !== 'disk-failure');
    expect(result.context).toBe(branch === 'disk-failure' ? 'draft-1' : 'saved-image');
    expect(result.cancelled).toBe(branch === 'disk-failure');
    expect(result.dirty).toBe(branch === 'disk-failure' || branch === 'late-input');
    expect(result.request).toMatchObject({
      sourceOwner: 'draft-1',
      preserveReferences: branch === 'unproven',
    });
  });

for (const failure of ['context', 'saved-marker'] as const)
  test(`a committed image save stays acknowledged after ${failure} failure and can retry`, async ({
    page,
  }) => {
    await page.evaluate((failure) => {
      const w = window as unknown as ImageWindow,
        fixture = w.__saveOwnershipFixture;
      fixture.first.references = ['file:///owned/a.png'];
      fixture.edit('![image](file:///owned/a.png)\n');
      fixture.first.failContext = failure === 'context';
      fixture.first.failMarkSaved = failure === 'saved-marker';
      fixture.save(true);
    }, failure);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as ImageWindow).__saveOwnershipFixture.outcome),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as ImageWindow).__saveOwnershipFixture.message),
      )
      .toContain('已保存');
    const before = await page.evaluate(() => {
      const w = window as unknown as ImageWindow,
        fixture = w.__saveOwnershipFixture;
      return {
        context: fixture.first.context,
        id: fixture.file?.id,
        closes: w.__desktopMock.calls.filter((call) => call.command === 'close_image_draft').length,
      };
    });
    expect(before).toEqual({
      context: failure === 'context' ? 'draft-1' : 'saved-image',
      id: 'saved-image',
      closes: failure === 'context' ? 0 : 1,
    });
    await page.evaluate(() => (window as unknown as ImageWindow).__saveOwnershipFixture.save());
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as ImageWindow).__saveOwnershipFixture.first.context,
        ),
      )
      .toBe('saved-image');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as ImageWindow).__saveOwnershipFixture.dirty),
      )
      .toBe(false);
    expect(
      await page.evaluate(
        () => (window as unknown as ImageWindow).__saveOwnershipFixture.first.raw,
      ),
    ).toBe('![image](assets/a.png)\n');
  });
