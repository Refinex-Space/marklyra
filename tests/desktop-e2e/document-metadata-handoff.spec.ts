import { expect, type Page, test } from '@playwright/test';
import type {
  DocumentChange,
  DocumentFile,
  DocumentMetadata,
} from '../../apps/desktop/src/services/documents.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock, type RecoveryMockWindow } from './recovery.helpers.js';

interface HandoffProbe {
  metadata: DocumentMetadata;
  change: DocumentChange;
  accepted: string[];
  holdAccept: boolean;
  pendingAccept: boolean;
  holdLoadAck: boolean;
  pendingLoadAck: boolean;
  heldLoadCanonical: string | null;
  leases: { id: string; watchId: string }[];
  releaseAccept(): void;
  releaseLoadAck(): void;
  rename(path: string): void;
  signal(): void;
}
type HandoffWindow = RecoveryMockWindow & { metadataHandoff: HandoffProbe };

/** The actual App/SDK run normally. Only Native IO and exact transport replies
 * are controlled here; this is not filesystem, NSDocument, WK or system-IME proof. */
function installHandoff() {
  if (window !== window.top) return;
  const host = window as unknown as HandoffWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const invoke = internals.invoke;
  let releaseAccept: (() => void) | undefined;
  let loadEvent: MessageEvent<unknown> | undefined;
  let leaseSerial = 0;
  host.__desktopMock.nextDocument = {
    id: 'handoff-doc',
    path: '/mock/A.md',
    text: 'Alpha',
    encoding: 'UTF-8',
  };
  const probe: HandoffProbe = {
    metadata: { id: 'handoff-doc', path: '/mock/A.md', encoding: 'UTF-8', metadataRevision: 0 },
    change: { status: 'unchanged' },
    accepted: [],
    holdAccept: false,
    pendingAccept: false,
    holdLoadAck: false,
    pendingLoadAck: false,
    heldLoadCanonical: null,
    leases: [],
    releaseAccept() {
      this.holdAccept = false;
      releaseAccept?.();
      releaseAccept = undefined;
    },
    releaseLoadAck() {
      if (!loadEvent) throw new Error('No actual SDK load acknowledgement is held');
      const original = loadEvent;
      loadEvent = undefined;
      this.holdLoadAck = false;
      this.pendingLoadAck = false;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: original.data,
          source: original.source,
          origin: original.origin,
        }),
      );
    },
    rename(path) {
      this.metadata = {
        ...this.metadata,
        path,
        metadataRevision: this.metadata.metadataRevision + 1,
      };
      // Native rename tears down old leases. The real hook must subscribe again.
      this.leases = [];
      host.__desktopMock.emitTarget('main', 'document-metadata-changed', [{ ...this.metadata }]);
    },
    signal() {
      for (const lease of this.leases)
        host.__desktopMock.emitTarget('main', 'document-disk-change', { ...lease });
    },
  };
  host.metadataHandoff = probe;
  window.addEventListener(
    'message',
    (event: MessageEvent<unknown>) => {
      if (!probe.holdLoadAck || !event.data || typeof event.data !== 'object') return;
      const frame = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
      if (
        !frame ||
        event.source !== frame.contentWindow ||
        event.origin !== new URL(frame.src).origin
      )
        return;
      const packet = event.data as {
        protocol?: unknown;
        channel?: unknown;
        kind?: unknown;
        payload?: { applied?: unknown; state?: { canonical?: unknown } };
      };
      if (
        packet.protocol !== 'marklyra/editor/v1' ||
        packet.kind !== 'response' ||
        typeof packet.channel !== 'string' ||
        packet.payload?.applied !== true ||
        typeof packet.payload.state?.canonical !== 'string'
      )
        return;
      if (loadEvent) throw new Error('Unexpected second SDK load acknowledgement');
      // This is the nested load result, not a flush/changed/dirty notification.
      loadEvent = event;
      probe.heldLoadCanonical = packet.payload.state.canonical;
      probe.pendingLoadAck = true;
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  internals.invoke = async (command, args = {}) => {
    if (command === 'open_document') {
      const opened = (await invoke(command, args)) as DocumentFile;
      return { ...opened, metadataRevision: 0 };
    }
    if (command === 'save_document') {
      const saved = (await invoke(command, args)) as DocumentFile;
      return { ...saved, ...probe.metadata, text: String(args.text) };
    }
    if (command === 'get_document_metadata') {
      host.__desktopMock.calls.push({ command, args });
      if (args.id !== probe.metadata.id) throw new Error('Unknown metadata document');
      return { ...probe.metadata };
    }
    if (command === 'check_document_change') {
      host.__desktopMock.calls.push({ command, args });
      return structuredClone(probe.change);
    }
    if (command === 'accept_document_change') {
      host.__desktopMock.calls.push({ command, args });
      const change = probe.change;
      if (
        change.status !== 'changed' ||
        change.version !== args.version ||
        change.document.id !== args.id
      )
        throw new Error('Disk candidate is stale');
      const result = { ...change.document, ...probe.metadata, text: change.document.text };
      // Accept has already committed its baseline before this ACK is held.
      probe.accepted.push(change.version);
      probe.change = { status: 'unchanged' };
      if (probe.holdAccept) {
        probe.pendingAccept = true;
        await new Promise<void>((resolve) => {
          releaseAccept = resolve;
        });
        probe.pendingAccept = false;
      }
      return result;
    }
    if (command === 'start_document_watch') {
      host.__desktopMock.calls.push({ command, args });
      const lease = { id: String(args.id), watchId: `handoff-watch-${++leaseSerial}` };
      probe.leases.push(lease);
      return { status: 'watching', watchId: lease.watchId };
    }
    if (command === 'stop_document_watch') {
      host.__desktopMock.calls.push({ command, args });
      probe.leases = probe.leases.filter(
        (lease) => lease.id !== args.id || lease.watchId !== args.watchId,
      );
      return true;
    }
    return invoke(command, args);
  };
}

const child = (page: Page) => page.frameLocator('.marklyra-editor-frame');
const menu = (page: Page, action: string) =>
  page.evaluate((value) => (window as unknown as TestWindow).__desktopMock.emitMenu(value), action);
async function boot(page: Page, opened: boolean) {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installHandoff);
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  if (opened) {
    await menu(page, 'open');
    await expect(page.locator('.document-title')).toHaveText('A.md');
    await expect(child(page).locator('#write')).toHaveText('Alpha');
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.leases.length),
      )
      .toBe(1);
  }
}
async function assertRawSave(page: Page, source: string, title: string) {
  await menu(page, 'save');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'save_document')
          .map((call) => call.args.text),
      ),
    )
    .toEqual([source]);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-title')).toHaveText(title);
}

test('held external acceptance ACK cannot restore the old path after a rename', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page, true);
  const source = '\ufeff# Note\n\nBeta\r\n';
  const iframeSrc = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await page.evaluate((source) => {
    const probe = (window as unknown as HandoffWindow).metadataHandoff;
    probe.holdAccept = true;
    probe.change = {
      status: 'changed',
      version: 'disk-v1',
      document: {
        id: probe.metadata.id,
        path: '/mock/A.md',
        encoding: 'UTF-8',
        metadataRevision: 0,
        text: source,
      },
    };
    probe.signal();
  }, source);
  await expect(child(page).locator('#write > p').last()).toHaveText('Beta');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.pendingAccept),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.accepted),
  ).toEqual(['disk-v1']);
  await page.evaluate(() =>
    (window as unknown as HandoffWindow).metadataHandoff.rename('/mock/Renamed.md'),
  );
  await expect(page.locator('.document-title')).toContainText('Renamed.md');
  await page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.releaseAccept());
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.document-title')).toHaveText('Renamed.md');
  await menu(page, 'undo');
  await expect(child(page).locator('#write')).toHaveText('Alpha');
  await expect(page.locator('.document-title')).toHaveText('Renamed.md •');
  await menu(page, 'redo');
  await expect(child(page).locator('#write > p').last()).toHaveText('Beta');
  await expect(page.locator('.document-title')).toHaveText('Renamed.md');
  await expect(page.locator('.marklyra-editor-frame')).toHaveAttribute('src', iframeSrc ?? '');
  expect(
    await page.evaluate(() =>
      (window as unknown as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'save_document',
      ),
    ),
  ).toEqual([]);
  await assertRawSave(page, source, 'Renamed.md');
  expect(errors).toEqual([]);
});

test('associated recovery caches target rename during the actual SDK load ACK and preserves its replacement checkpoint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page, false);
  const source = 'Runtime edits\r\n\r\n保留原稿😀\n';
  const seed = await page.evaluate((source) => {
    const host = window as unknown as HandoffWindow;
    return host.__recoveryMock.seed({
      text: source,
      savedText: 'Alpha',
      document: { path: '/mock/A.md', encoding: 'UTF-8' },
      selection: null,
    });
  }, source);
  await page.evaluate(() => {
    const host = window as unknown as HandoffWindow;
    host.metadataHandoff.holdLoadAck = true;
    host.__recoveryMock.defer.checkpoint_recovery = true;
  });
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '恢复未保存的文档' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '选择原文件并恢复', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.pendingLoadAck),
    )
    .toBe(true);
  await expect(child(page).locator('#write > p').first()).toHaveText('Runtime edits');
  await expect(child(page).locator('#write > p').last()).toHaveText('保留原稿😀');
  expect(
    await page.evaluate(
      () => (window as unknown as HandoffWindow).metadataHandoff.heldLoadCanonical,
    ),
  ).toContain('保留原稿😀');
  // The child already loaded, while the parent has not activated this target ID.
  await expect(page.locator('.document-title')).toHaveText('未命名');
  await page.evaluate(() =>
    (window as unknown as HandoffWindow).metadataHandoff.rename('/mock/Runtime Renamed.md'),
  );
  await expect(page.locator('.document-title')).toHaveText('未命名');
  expect(
    await page.evaluate(
      (id) => !!(window as unknown as RecoveryMockWindow).__recoveryMock.records[id],
      seed,
    ),
  ).toBe(true);
  await page.evaluate(() => (window as unknown as HandoffWindow).metadataHandoff.releaseLoadAck());
  await expect(page.locator('.document-title')).toHaveText('Runtime Renamed.md •');
  await expect
    .poll(() =>
      page.evaluate(
        (source) =>
          (window as unknown as RecoveryMockWindow).__recoveryMock.pending.filter(
            (call) =>
              call.command === 'checkpoint_recovery' &&
              (call.args.checkpoint as { text?: unknown }).text === source,
          ).length,
        source,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      (id) => !!(window as unknown as RecoveryMockWindow).__recoveryMock.records[id],
      seed,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      (id) =>
        (window as unknown as RecoveryMockWindow).__recoveryMock.calls.filter(
          (call) => call.command === 'consume_recovery_draft' && call.args.id === id,
        ),
      seed,
    ),
  ).toEqual([]);
  const replacement = await page.evaluate((source) => {
    const host = window as unknown as RecoveryMockWindow;
    const checkpoints = host.__recoveryMock.pending.filter(
      (call) => call.command === 'checkpoint_recovery',
    );
    const index = checkpoints.findIndex(
      (call) => (call.args.checkpoint as { text?: unknown }).text === source,
    );
    if (index < 0) throw new Error('Missing replacement checkpoint');
    const content = structuredClone(checkpoints[index]?.args.checkpoint);
    host.__recoveryMock.defer.checkpoint_recovery = false;
    host.__recoveryMock.release('checkpoint_recovery', index);
    return content;
  }, source);
  expect(replacement).toMatchObject({
    text: source,
    savedText: 'Alpha',
    document: { path: '/mock/Runtime Renamed.md', encoding: 'UTF-8' },
  });
  await expect
    .poll(() =>
      page.evaluate(
        (id) => !!(window as unknown as RecoveryMockWindow).__recoveryMock.records[id],
        seed,
      ),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        ({ source, seed }) =>
          Object.values((window as unknown as RecoveryMockWindow).__recoveryMock.records).filter(
            (record) =>
              record.id !== seed &&
              record.active &&
              record.text === source &&
              record.savedText === 'Alpha' &&
              record.document?.path === '/mock/Runtime Renamed.md',
          ).length,
        { source, seed },
      ),
    )
    .toBe(1);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  expect(
    await page.evaluate(() =>
      (window as unknown as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'save_document' || call.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
  await assertRawSave(page, source, 'Runtime Renamed.md');
  expect(errors).toEqual([]);
});
