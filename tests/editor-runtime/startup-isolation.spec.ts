import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';

type Host = Window & { marklyraEditor: MarkLyraEditor; runtimeErrors: string[] };
const runtimeUrl = 'http://127.0.0.1:4174/index.html';

async function errorProbe(page: Page, startupFailure = false): Promise<void> {
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(() => (window as unknown as Host).marklyraEditor.ready);
  if (startupFailure)
    await page.route(new URL('./appsrc/main.js', runtimeUrl).href, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'throw new Error("Controlled local engine startup failure");',
      }),
    );
  await page.evaluate(
    async ({ runtimeUrl, startupFailure }) => {
      const host = window as unknown as Host;
      const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
      const root = host.marklyraEditor.element.parentElement;
      if (!root) throw Error('Missing editor mount');
      host.marklyraEditor.destroy();
      host.runtimeErrors = [];
      host.marklyraEditor = new Constructor(root, {
        runtimeUrl,
        markdown: 'Local error probe\r\n',
        onError: (error) => host.runtimeErrors.push(error.message),
      });
      if (startupFailure) void host.marklyraEditor.ready.catch(() => {});
      else await host.marklyraEditor.ready;
    },
    { runtimeUrl, startupFailure },
  );
}

for (const [requested, locale, directory] of [
  ['en', 'en', 'Base'],
  ['zh-Hans', 'zh-Hans', 'zh-Hans'],
  ['retired-language', 'en', 'Base'],
] as const)
  test(`internal startup confines ${requested} to a bundled language without external requests`, async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname))
        external.push(url.origin + url.pathname);
    });
    await page.goto('/runtime.html');
    await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
    await page.evaluate(
      async ({ requested, runtimeUrl }) => {
        const host = window as unknown as Host;
        await host.marklyraEditor.ready;
        const Constructor = host.marklyraEditor.constructor as typeof MarkLyraEditor;
        const root = host.marklyraEditor.element.parentElement;
        if (!root) throw Error('Missing editor mount');
        host.marklyraEditor.destroy();
        host.marklyraEditor = new Constructor(root, {
          runtimeUrl,
          markdown: '# English / 中文\r\n\r\nLocal document\n',
          // Exercise a JavaScript caller's unsupported value as well as typed inputs.
          configuration: { locale: requested as 'en' | 'zh-Hans' },
        });
        await host.marklyraEditor.ready;
      },
      { requested, runtimeUrl },
    );
    const frame = page.frames().find((frame) => frame.url().startsWith(runtimeUrl));
    if (!frame) throw Error('Missing initialized editor frame');
    expect(new URL(frame.url()).searchParams.get('locale')).toBe(locale);
    expect(await frame.evaluate(() => Reflect.get(window, '_options').locale)).toBe(directory);
    expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
      '# English / 中文\r\n\r\nLocal document\n',
    );
    expect(external).toEqual([]);
  });

test('a local engine startup error reaches the host without a remote reporter', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname))
      external.push(url.origin + url.pathname);
  });
  await errorProbe(page, true);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).runtimeErrors.join('\n')))
    .toContain('Controlled local engine startup failure');
  expect(external).toEqual([]);
});

test('an initialized engine keeps runtime error reporting inside the host', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname))
      external.push(url.origin + url.pathname);
  });
  await errorProbe(page);
  const frame = page.frames().find((frame) => frame.url().startsWith(runtimeUrl));
  if (!frame) throw Error('Missing initialized editor frame');
  await frame.evaluate(() => {
    const message = 'Controlled initialized engine failure';
    dispatchEvent(new ErrorEvent('error', { message, error: new Error(message) }));
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Host).runtimeErrors.join('\n')))
    .toContain('Controlled initialized engine failure');
  expect(await page.evaluate(() => (window as unknown as Host).marklyraEditor.flush())).toBe(
    'Local error probe\r\n',
  );
  expect(external).toEqual([]);
});
