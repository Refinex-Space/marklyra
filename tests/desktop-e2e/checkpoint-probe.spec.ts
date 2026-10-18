import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock, type RecoveryMockWindow } from './recovery.helpers.js';

// Full built Shell + default runtime SDK; native persistence/termination is
// mocked here. Actual SIGKILL/relaunch uses a separate isolated macOS candidate.
let directory: string;
const phases = ['before-dispatch', 'after-commit'] as const;
test.beforeAll(async () => {
  await mkdir(resolve('artifacts/validation/checkpoints'), { recursive: true });
  directory = await mkdtemp(resolve('artifacts/validation/checkpoints/browser-owned-'));
  for (const phase of phases) {
    await promisify(execFile)(process.execPath, [
      resolve('scripts/instrument-recovery-checkpoint.mjs'),
      resolve('apps/desktop/dist'),
      join(directory, phase),
      phase,
    ]);
    const frontend = join(directory, phase);
    const html = (await readFile(join(frontend, 'index.html'), 'utf8'))
      .replaceAll('src="/assets/', `src="/@fs${frontend}/assets/`)
      .replaceAll('href="/assets/', `href="/@fs${frontend}/assets/`)
      .replace('src="/checkpoint-probe.js"', `src="/@fs${frontend}/checkpoint-probe.js"`);
    await writeFile(join(frontend, 'browser.html'), html);
  }
});
test.afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
for (const phase of phases)
  test(`diagnostic built Shell with immutable native invoke: ${phase} barrier and reload recovery`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript({
      content: `if(window===window.top){(${installMock.toString()})();(${installRecoveryMock.toString()})();Object.defineProperty(window.__TAURI_INTERNALS__,'invoke',{writable:false});}`,
    });
    const frontend = join(directory, phase);
    await page.goto(`/@fs${frontend}/browser.html`);
    const area = page.frameLocator('.marklyra-editor-frame').locator('#write');
    await expect(area).toBeVisible();
    await area.click();
    const text = `MarkLyra ${phase} owned`;
    await page.keyboard.type(text);
    await expect(page.locator('#checkpoint-probe')).toHaveText(
      `Checkpoint: held ${phase} (${text.length} UTF-16)`,
    );
    const boundary = await page.evaluate(() => ({
      nativeCheckpoints: (window as RecoveryMockWindow).__recoveryMock.calls.filter(
        (call) => call.command === 'checkpoint_recovery',
      ).length,
      nativeDrafts: Object.values((window as RecoveryMockWindow).__recoveryMock.records).length,
      localHeads: Object.keys(localStorage).filter((key) => key.startsWith('marklyra-fallback:v2:'))
        .length,
      writable: Object.getOwnPropertyDescriptor(
        Reflect.get(window, '__TAURI_INTERNALS__'),
        'invoke',
      )?.writable,
    }));
    expect(boundary).toEqual({
      nativeCheckpoints: phase === 'before-dispatch' ? 0 : 1,
      nativeDrafts: phase === 'before-dispatch' ? 0 : 1,
      localHeads: 1,
      writable: false,
    });
    await page.reload();
    const panel = page.getByRole('dialog', { name: '恢复未保存的文档' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '保护此本地副本', exact: true }).click();
    await expect(panel.getByRole('button', { name: '保护此本地副本', exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: '恢复为新文档', exact: true }).first().click();
    await expect(area).toHaveText(text);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as TestWindow).__desktopMock.calls
              .filter((call) => call.command === 'save_document_as')
              .at(-1)?.args.text,
        ),
      )
      .toBe(text);
    expect(errors).toEqual([]);
    // The copied frontend was instrumented; the source index was not rewritten.
    expect(await readFile(resolve('apps/desktop/dist/index.html'), 'utf8')).not.toContain(
      'checkpoint-probe',
    );
  });
