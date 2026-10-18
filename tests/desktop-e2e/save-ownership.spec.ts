import { expect, test } from '@playwright/test';
import type { SaveOwnershipWindow } from '../../apps/desktop/src/features/documents/test/save-ownership.fixture.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

test('Trash arriving during the held flush blocks the old write and automatic saving without retiring the editor owner', async ({
  page,
}) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.route('**/save-ownership-fixture.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="root"></div><script type="module" src="/src/features/documents/test/save-ownership.fixture.tsx"></script>',
    }),
  );
  await page.goto('/save-ownership-fixture.html');
  await expect(page.locator('output')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(async () => {
    const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
    await fixture.initialize();
    fixture.checkpointOwner();
    fixture.edit('AlphaX');
    fixture.first.hold = true;
    fixture.save();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.release,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.emitTarget('main', 'document-metadata-changed', [
      {
        id: 'doc-a',
        path: '/mock/A.md',
        encoding: 'UTF-8',
        metadataRevision: 1,
        locationState: 'trashed',
      },
    ]);
    (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.release?.();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.outcome,
      ),
    )
    .toBe(false);
  await page.evaluate(() =>
    (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.autoSave(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.automaticOutcome,
      ),
    )
    .toBe('skipped');
  const result = await page.evaluate(() => ({
    sameOwner: (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.sameOwner(),
    raw: (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.raw,
    writes: (window as TestWindow).__desktopMock.calls.filter(
      (call) => call.command === 'save_document' || call.command === 'save_document_as',
    ),
  }));
  expect(result).toEqual({ sameOwner: true, raw: 'AlphaX', writes: [] });
});

for (const retirement of ['replace', 'unmount'] as const)
  test(`queued save cannot continue after its owner is retired during flush: ${retirement}`, async ({
    page,
  }) => {
    await page.addInitScript(installMock);
    await page.addInitScript(installRecoveryMock);
    await page.route('**/save-ownership-fixture.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="root"></div><script type="module" src="/src/features/documents/test/save-ownership.fixture.tsx"></script>',
      }),
    );
    await page.goto('/save-ownership-fixture.html');
    await expect(page.locator('output')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(async () =>
      (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.initialize(),
    );
    await page.evaluate(() => {
      const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
      fixture.edit('AlphaX');
      (window as TestWindow).__desktopMock.deferSave = true;
      fixture.save();
    });
    await expect
      .poll(() => page.evaluate(() => (window as TestWindow).__desktopMock.pendingSaves))
      .toBe(1);
    await page.evaluate(() => {
      const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
      fixture.edit('AlphaY');
      fixture.first.hold = true;
      fixture.save();
      const mock = (window as TestWindow).__desktopMock;
      mock.deferSave = false;
      mock.finishSave();
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean((window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.release),
        ),
      )
      .toBe(true);
    await page.evaluate((retirement) => {
      const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
      fixture[retirement]();
      fixture.first.release?.();
    }, retirement);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.outcome,
        ),
      )
      .toBeDefined();
    const writes = await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'save_document')
        .map((call) => ({ id: call.args.id, text: call.args.text })),
    );
    expect(writes).toEqual([{ id: 'doc-a', text: 'AlphaX' }]);
    expect(
      await page.evaluate(
        () => (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.outcome,
      ),
    ).toBe(false);
  });

for (const fails of [false, true])
  test(`same editor document owner changes only after a successful load: failure=${fails}`, async ({
    page,
  }) => {
    await page.addInitScript(installMock);
    await page.addInitScript(installRecoveryMock);
    await page.route('**/save-ownership-fixture.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="root"></div><script type="module" src="/src/features/documents/test/save-ownership.fixture.tsx"></script>',
      }),
    );
    await page.goto('/save-ownership-fixture.html');
    await expect(page.locator('output')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(async () =>
      (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.initialize(),
    );
    await page.evaluate((fails) => {
      const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
      fixture.checkpointOwner();
      fixture.first.holdLoad = true;
      fixture.first.failLoad = fails;
      void fixture.newDocument();
    }, fails);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.releaseLoad,
          ),
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => {
        const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
        return { same: fixture.sameOwner(), accepts: fixture.acceptsEditorCommands() };
      }),
    ).toEqual({ same: true, accepts: false });
    await page.evaluate(() =>
      (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture.first.releaseLoad?.(),
    );
    await expect(page.locator('output')).toHaveText('idle');
    expect(
      await page.evaluate(() => {
        const fixture = (window as unknown as SaveOwnershipWindow).__saveOwnershipFixture;
        return { same: fixture.sameOwner(), accepts: fixture.acceptsEditorCommands() };
      }),
    ).toEqual({ same: fails, accepts: true });
  });
