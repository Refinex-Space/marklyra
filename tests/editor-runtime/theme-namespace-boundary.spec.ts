import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { RuntimeThemes } from '../../packages/editor-runtime/src/runtime/themes.js';

type ThemeProbe = Window & {
  namespaceProbe: {
    themes: RuntimeThemes;
    original: CSSStyleSheet;
    done: boolean;
    error: string;
  };
};
const helperUrl = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/runtime/themes.ts', import.meta.url))}`;

test('a stylesheet replaced during verification cannot enter the verified namespace adaptation set', async ({
  page,
}) => {
  let release = () => {};
  let entered = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const verifying = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let unverifiedFetches = 0;
  await page.route('**/namespace-boundary/*.css', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/old.css') && route.request().resourceType() === 'fetch') {
      entered();
      await gate;
    }
    if (path.endsWith('/new.css') && route.request().resourceType() === 'fetch')
      unverifiedFetches++;
    await route.fulfill({
      contentType: 'text/css',
      body: path.endsWith('/old.css')
        ? '#legacy-editor-source{color:rgb(11,22,33)}'
        : path.endsWith('/new.css')
          ? '#unverified-editor-source{color:rgb(99,88,77)}'
          : '/* empty theme override */',
    });
  });
  await page.route('**/__theme_namespace_boundary__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><link id="theme_css" rel="stylesheet" href="/namespace-boundary/old.css"><link id="base_user_css" rel="stylesheet" href="/namespace-boundary/base.css"><link id="theme_user_css" rel="stylesheet" href="/namespace-boundary/user.css"></head><body><aside id="marklyra-sidebar"></aside><main id="marklyra-source"></main></body></html>',
    }),
  );
  await page.goto('/__theme_namespace_boundary__');
  await page.addScriptTag({
    type: 'module',
    content: `import {RuntimeThemes} from ${JSON.stringify(helperUrl)};
      window.namespaceProbe={themes:new RuntimeThemes(()=>{}),original:document.querySelector('#theme_css').sheet,done:false,error:''};
      window.namespaceProbe.themes.read().then(()=>window.namespaceProbe.done=true,error=>window.namespaceProbe.error=String(error));`,
  });
  try {
    await verifying;
    const replaced = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('#theme_css');
      if (!link) throw Error('Missing theme link');
      await new Promise<void>((resolve, reject) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => reject(Error('Replacement stylesheet failed')), {
          once: true,
        });
        link.href = '/namespace-boundary/new.css';
      });
      return link.sheet !== (window as unknown as ThemeProbe).namespaceProbe.original;
    });
    expect(replaced).toBe(true);
    release();
    await page.waitForFunction(() => {
      const probe = (window as unknown as ThemeProbe).namespaceProbe;
      return probe.done || !!probe.error;
    });
    const result = await page.evaluate(() => {
      const probe = (window as unknown as ThemeProbe).namespaceProbe;
      const current = document.querySelector<HTMLLinkElement>('#theme_css')?.sheet;
      if (!current) throw Error('Missing replacement stylesheet');
      return {
        error: probe.error,
        original: (probe.original.cssRules[0] as CSSStyleRule).selectorText,
        current: (current.cssRules[0] as CSSStyleRule).selectorText,
      };
    });
    expect(result.error).toBe('');
    expect(result.current).toBe('#unverified-editor-source');
    expect(result.original).toContain(':is(#legacy-editor-source,');
    expect(unverifiedFetches).toBe(0);
  } finally {
    release();
    await page.evaluate(() => (window as unknown as ThemeProbe).namespaceProbe?.themes.destroy());
  }
});
