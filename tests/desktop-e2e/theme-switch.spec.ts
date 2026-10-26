import { expect, type Page, test } from '@playwright/test';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

// Keep the raw document-local rAF observations. A child can keep running rAF
// while a root View Transition holds the old window snapshot on screen.
const sampler = `
(() => {
  window.__cancelThemeSampler?.();
  const flips = {};
  const changes = [];
  const read = () => ({
    sidebar: getComputedStyle(document.querySelector('aside.sidebar') || document.body).backgroundColor,
    shell: document.querySelector('.shell')?.getAttribute('data-theme-name') ?? '',
    palette: document.documentElement.dataset.theme ?? '',
    titlebar: document.querySelector('header.titlebar')
      ? getComputedStyle(document.querySelector('header.titlebar')).color
      : '',
    document: getComputedStyle(document.body).backgroundColor,
  });
  let last = read();
  window.__flips = flips;
  window.__themeChanges = changes;
  let pending;
  window.__cancelThemeSampler = () => cancelAnimationFrame(pending);
  const loop = () => {
    const now = read();
    for (const key of Object.keys(now)) {
      if (now[key] !== last[key]) {
        const at = performance.timeOrigin + performance.now();
        flips[key] = at;
        changes.push({ key, before: last[key], after: now[key], at });
      }
    }
    last = now;
    pending = requestAnimationFrame(loop);
  };
  pending = requestAnimationFrame(loop);
})();
`;

type Flips = Record<string, number>;
interface TransitionWindow {
  number: number;
  from: number | null;
  to: number | null;
  ready: number | null;
  presented: number | null;
}
type ThemeWindow = Window & {
  __viewTransitions: { count: number; windows: TransitionWindow[] };
  __flips: Flips;
  __themeChanges: { key: string; before: string; after: string; at: number }[];
};

function observeViewTransitions() {
  if (window !== window.top) return;
  const host = window as unknown as ThemeWindow;
  const calls = { count: 0, windows: [] as TransitionWindow[] };
  host.__viewTransitions = calls;
  const original = document.startViewTransition?.bind(document);
  if (original)
    document.startViewTransition = ((update: () => Promise<void> | void) => {
      const observation: TransitionWindow = {
        number: ++calls.count,
        from: null,
        to: null,
        ready: null,
        presented: null,
      };
      calls.windows.push(observation);
      const now = () => performance.timeOrigin + performance.now();
      const transition = original(async () => {
        observation.from = now();
        try {
          await update();
        } finally {
          observation.to = now();
        }
      });
      void transition.ready.then(
        () => {
          observation.ready = now();
          requestAnimationFrame(() => {
            observation.presented = now();
          });
        },
        () => {}, // A skipped transition has no verified presentation boundary.
      );
      return transition;
    }) as typeof document.startViewTransition;
}

const flipsOf = (target: Page | ReturnType<Page['frames']>[number]) =>
  target.evaluate(() => (window as unknown as { __flips: Flips }).__flips);

async function observedPresentation(
  page: Page,
  frame: ReturnType<Page['frames']>[number],
  since: number,
  label: string,
) {
  const read = (target: Page | ReturnType<Page['frames']>[number]) =>
    target.evaluate(() => {
      const host = window as unknown as ThemeWindow;
      return { flips: host.__flips, changes: host.__themeChanges };
    });
  const [host, child, windows] = await Promise.all([
    read(page),
    read(frame),
    page.evaluate(
      (number) =>
        (window as unknown as ThemeWindow).__viewTransitions.windows.filter(
          (item) => item.number > number,
        ),
      since,
    ),
  ]);
  const raw = {
    ...host.flips,
    ...Object.fromEntries(
      Object.entries(child.flips).map(([key, value]) => [`frame-${key}`, value]),
    ),
  };
  const presented = Object.fromEntries(
    Object.entries(raw).map(([key, at]) => {
      // Only mutations inside the actual update callback are covered by the
      // old snapshot. Early changes and changes after that callback keep their
      // measured time, even when another part of the window has already changed.
      const covered = windows.find(
        (item) =>
          item.from !== null &&
          item.to !== null &&
          item.ready !== null &&
          item.presented !== null &&
          at >= item.from &&
          at <= item.to,
      );
      return [key, covered?.presented ?? at];
    }),
  );
  await test.info().attach(`${label}-presentation`, {
    contentType: 'application/json',
    body: JSON.stringify({ host, child, windows, raw, presented }, null, 2),
  });
  return presented;
}

async function switchTheme(page: Page, theme: string) {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().startsWith('http://127.0.0.1:4174/'));
  if (!frame) throw Error('Missing editor frame');
  const before = await page.evaluate(
    () => (window as unknown as ThemeWindow).__viewTransitions.count,
  );
  await page.evaluate(sampler);
  await frame.evaluate(sampler);
  await emitLayoutMenu(page, `theme:${theme}`);
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  await page.waitForTimeout(500);
  return observedPresentation(page, frame, before, theme);
}

for (const host of ['windows', 'macos'] as const) {
  for (const reduced of [false, true]) {
    test(`${host}${reduced ? ' with reduced motion' : ''}: the document and the whole shell change theme in one step`, async ({
      page,
    }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(observeViewTransitions);
      await installLayout(page, undefined, host === 'windows' ? 'web' : undefined);
      await readyLayout(page, 'marklyra-light');
      await openLayoutDocument(page);
      await emitLayoutMenu(page, 'open-folder');
      await emitLayoutMenu(page, 'view:outline');
      await expect(page.locator('.document-details-panel')).toBeVisible();
      for (const theme of ['marklyra-dark', 'marklyra-light']) {
        const countOf = () =>
          page.evaluate(
            () =>
              (window as unknown as { __viewTransitions: { count: number } }).__viewTransitions
                .count,
          );
        const before = await countOf();
        const flips = await switchTheme(page, theme);
        // The shell's colours, its palette, its theme name and the document all moved.
        for (const key of ['sidebar', 'shell', 'palette', 'frame-document'])
          expect(flips[key], `${key} did not change`).toBeGreaterThan(0);
        const times = Object.values(flips);
        const spread = Math.max(...times) - Math.min(...times);
        const transitions = (await countOf()) - before;
        if (reduced) {
          // No animation, but still one commit step; the shell used to trail the document by 350ms+.
          expect(transitions).toBe(0);
          expect(spread).toBeLessThanOrEqual(250);
        } else {
          // The old picture is held while the new theme is prepared, then everything fades in together.
          expect(transitions).toBe(1);
          expect(spread).toBeLessThanOrEqual(50);
        }
      }
    });
  }
}

for (const timing of ['before', 'after'] as const) {
  test(`theme sampling rejects a child colour change ${timing} the covered update window`, async ({
    page,
  }) => {
    await page.addInitScript(observeViewTransitions);
    await page.route('http://127.0.0.1:4184/__theme-sampler', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<style>body,aside{background:rgb(255,255,255)}</style>
          <aside class="sidebar">Sidebar</aside><main class="shell" data-theme-name="before">
          <iframe src="http://127.0.0.1:4174/__theme-sampler-frame"></iframe></main>`,
      }),
    );
    await page.route('http://127.0.0.1:4174/__theme-sampler-frame', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<body style="background:rgb(255,255,255)">Independent document</body>',
      }),
    );
    await page.goto('http://127.0.0.1:4184/__theme-sampler');
    const frame = page.frames().find((item) => item.url().includes('/__theme-sampler-frame'));
    if (!frame) throw new Error('Missing cross-origin control frame');
    expect(new URL(frame.url()).origin).not.toBe(new URL(page.url()).origin);
    await page.evaluate(sampler);
    await frame.evaluate(sampler);
    const changeChild = () =>
      frame.evaluate(() => {
        document.body.style.backgroundColor = 'rgb(13, 17, 23)';
      });
    if (timing === 'before') {
      await changeChild();
      await expect.poll(async () => (await flipsOf(frame)).document).toBeGreaterThan(0);
      // Intentional negative control: the child is visibly ahead of the root.
      await page.waitForTimeout(120);
    }
    await page.evaluate(async () => {
      const transition = document.startViewTransition(() => {
        document.body.style.backgroundColor = 'rgb(13, 17, 23)';
        const sidebar = document.querySelector<HTMLElement>('aside');
        if (sidebar) sidebar.style.backgroundColor = 'rgb(13, 17, 23)';
        document.querySelector('.shell')?.setAttribute('data-theme-name', 'after');
      });
      await transition.finished;
    });
    if (timing === 'after') {
      // A late child update is outside both the callback and the completed fade.
      await page.waitForTimeout(120);
      await changeChild();
      await expect.poll(async () => (await flipsOf(frame)).document).toBeGreaterThan(0);
    }
    await expect.poll(async () => (await flipsOf(page)).shell).toBeGreaterThan(0);
    const flips = await observedPresentation(page, frame, 0, `negative-${timing}`);
    expect(flips.shell).toBeGreaterThan(0);
    expect(flips['frame-document']).toBeGreaterThan(0);
    const times = Object.values(flips);
    // These real DOM changes would fail the production scenario's 50 ms bound.
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThan(100);
  });
}

test('a failed theme load leaves the whole window on the old theme', async ({ page }) => {
  await installLayout(page);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await page.evaluate(() => {
    const internal = Reflect.get(window, '__TAURI_INTERNALS__') as {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
    const previous = internal.invoke;
    internal.invoke = async (command, args = {}) => {
      if (command === 'load_theme_styles' && args.themeId === 'marklyra-dark')
        throw new Error('主题文件不可用');
      return previous(command, args);
    };
  });
  const frame = page.frameLocator('.marklyra-editor-frame');
  await emitLayoutMenu(page, 'theme:marklyra-dark');
  await page.waitForTimeout(800);
  // Nothing half-applied: shell name, palette and the document all still belong to the light theme.
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', 'marklyra-light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(frame.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
