import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

const scopedCSS = await readFile(
  new URL('../../packages/editor-runtime/vendor/diagram/css/mermaid-zenuml.css', import.meta.url),
  'utf8',
);
const scope = ':where(.zenuml,.zenuml *)';
const initializer =
  scopedCSS.slice(scopedCSS.indexOf(`${scope},${scope}:before,${scope}:after{`)).split('}')[0] ??
  '';
const defaults = [...initializer.matchAll(/(--tw-[\w-]+):/g)].map((match) => match[1] as string);
const properties = [...defaults, 'transform', 'opacity', 'filter', 'box-shadow', 'content'];
const pseudoContent = '[data-probe]::before,[data-probe]::after{content:"probe";display:block}';

async function loadStyleFixture(page: Page, css: string, markup: string, before = '', after = '') {
  await page.setContent(markup);
  await page.addStyleTag({ content: pseudoContent + before });
  await page.addStyleTag({ content: css });
  if (after) await page.addStyleTag({ content: after });
}

async function styles(page: Page, ids: string[], pseudos = ['', '::before', '::after']) {
  return page.evaluate(
    ({ ids, pseudos, properties }) =>
      Object.fromEntries(
        ids.flatMap((id) => {
          const element = document.getElementById(id);
          if (!element) throw Error(`Missing CSS probe ${id}`);
          return pseudos.map((pseudo) => [
            id + pseudo,
            Object.fromEntries(
              properties.map((property) => [
                property,
                getComputedStyle(element, pseudo || null)
                  .getPropertyValue(property)
                  .trim(),
              ]),
            ),
          ]);
        }),
      ),
    { ids, pseudos, properties },
  );
}

test('ZenUML scoped defaults preserve root, descendants, pseudo-elements and real utilities', async ({
  page,
}) => {
  expect(defaults).toHaveLength(44);
  const markup = `
    <section id="root" class="zenuml" data-probe>
      <div id="child" data-probe><span id="deep" data-probe>Diagram</span></div>
      <div id="nested-root" class="zenuml" data-probe>
        <span id="nested-child" data-probe>Nested diagram</span>
      </div>
      <div id="utility" class="transform -translate-y-8 opacity-50" data-probe>Utility</div>
      <dialog id="inside-dialog">Diagram dialog</dialog>
    </section>
    <p id="outside" data-probe>Ordinary document text</p>
    <dialog id="outside-dialog">Ordinary dialog</dialog>`;
  await loadStyleFixture(page, scopedCSS, markup);
  const ids = ['root', 'child', 'deep', 'nested-root', 'nested-child', 'utility'];
  const current = await styles(page, ids);
  for (const id of ['root', 'child', 'deep', 'nested-root', 'nested-child'])
    for (const pseudo of ['', '::before', '::after']) {
      expect(current[id + pseudo]?.['--tw-rotate']).toBe('0');
      expect(current[id + pseudo]?.['--tw-scale-x']).toBe('1');
      for (const property of defaults)
        expect(current[id + pseudo]?.[property], `${id}${pseudo} ${property}`).toBe(
          current.root?.[property],
        );
    }
  expect(current.utility?.['--tw-translate-y']).toBe('-2rem');
  expect(current.utility?.opacity).toBe('0.5');
  expect(current.utility?.transform).not.toBe('none');
  const outside = await styles(page, ['outside']);
  for (const snapshot of Object.values(outside))
    for (const property of defaults) expect(snapshot[property], property).toBe('');

  await page.evaluate(() => {
    for (const element of document.querySelectorAll('dialog')) element.showModal();
  });
  const insideBackdrop = await styles(page, ['inside-dialog'], ['::backdrop']);
  for (const property of defaults)
    expect(insideBackdrop['inside-dialog::backdrop']?.[property], property).toBe(
      current.root?.[property],
    );
  const outsideBackdrop = await styles(page, ['outside-dialog'], ['::backdrop']);
  for (const property of defaults)
    expect(outsideBackdrop['outside-dialog::backdrop']?.[property], property).toBe('');
});

test('ZenUML initializer scoping preserves existing cascade and pseudo-element specificity', async ({
  page,
}) => {
  const markup = `
    <section id="root" class="zenuml" data-probe>
      <div id="early" class="host-rule transform" data-probe>Earlier custom rule</div>
      <div id="late" class="late-zero transform" data-probe>Later zero-specificity rule</div>
      <div id="utility" class="opacity-50 custom-opacity" data-probe>Utility override</div>
    </section>`;
  const before = `
    section{--tw-rotate:7deg}
    .host-rule{--tw-rotate:17deg;--tw-scale-x:1.25}
    .host-rule::before{--tw-rotate:23deg}
    :where(.host-rule)::after{--tw-rotate:29deg}`;
  const after = `
    :where(.late-zero){--tw-rotate:37deg}
    :where(.late-zero)::before{--tw-rotate:41deg}
    .zenuml .custom-opacity{opacity:.625}`;
  await loadStyleFixture(page, scopedCSS, markup, before, after);
  const current = await styles(page, ['root', 'early', 'late', 'utility']);
  expect(current.root?.['--tw-rotate']).toBe('7deg');
  expect(current.early?.['--tw-rotate']).toBe('17deg');
  expect(current.early?.['--tw-scale-x']).toBe('1.25');
  expect(current['early::before']?.['--tw-rotate']).toBe('23deg');
  expect(current['early::after']?.['--tw-rotate']).toBe('0');
  expect(current.late?.['--tw-rotate']).toBe('37deg');
  expect(current['late::before']?.['--tw-rotate']).toBe('41deg');
  expect(current.utility?.opacity).toBe('0.625');
});

test('bundled Mermaid renders actual ZenUML and preserves BOM and mixed-EOL source roundtrips', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  // Official Mermaid ZenUML syntax, dispatched by its registered external diagram:
  // https://github.com/mermaid-js/mermaid/blob/v10.7.0/docs/syntax/zenuml.md
  const source =
    '\ufeffBefore  \r\n\r\n```mermaid\r\nzenuml\r\n  title Style regression\r\n  Alice->Bob: Ready\r\n```\n\nTail  \r\n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page);
  const preview = frame.locator('#write [mdtype="fences"] .md-diagram-panel-preview');
  const assertRendered = async () => {
    // Require the actual renderer's SVG/foreignObject/Vue diagram, not just its
    // fenced source, a placeholder or a fake render response.
    await expect(preview.locator('svg:has(foreignObject)')).toHaveCount(1, { timeout: 30_000 });
    const diagram = preview.locator('svg foreignObject .zenuml:not(.zenuml .zenuml)');
    await expect(diagram).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(diagram).toContainText('Alice');
    await expect(diagram).toContainText('Bob');
    await expect(diagram).toContainText('Ready');
  };
  await assertRendered();
  expect(await advancedSource(page)).toBe(source);
  const toggle = () =>
    page.evaluate(() =>
      (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
        type: 'toggleSource',
      }),
    );
  await toggle();
  await expect(frame.locator('#marklyra-source')).toBeVisible();
  expect(await advancedSource(page)).toBe(source);
  await toggle();
  await assertRendered();
  expect(await advancedSource(page)).toBe(source);

  const html = await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.exportHTML({
      title: 'ZenUML offline export',
      theme: 'marklyra-light',
    }),
  );
  const offline = await context.newPage();
  const requests: string[] = [];
  try {
    await offline.route('**/*', (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    await offline.setContent(html);
    await expect(offline.locator('svg:has(foreignObject)')).toHaveCount(1);
    const diagram = offline.locator('svg foreignObject .zenuml:not(.zenuml .zenuml)');
    await expect(diagram).toHaveCount(1);
    await expect(diagram).toContainText('Alice');
    await expect(diagram).toContainText('Bob');
    await expect(diagram).toContainText('Ready');
    await expect(offline.locator('script,link')).toHaveCount(0);
    const resets = await offline.evaluate((defaults) => {
      const selectors = new Set<string>();
      for (const sheet of document.styleSheets)
        for (const rule of sheet.cssRules)
          if (
            rule instanceof CSSStyleRule &&
            defaults.every((property) => Array.from(rule.style).includes(property))
          )
            selectors.add(rule.selectorText);
      return [...selectors];
    }, defaults);
    expect(resets).toHaveLength(2);
    expect(resets.every((selector) => selector.includes('.zenuml'))).toBe(true);
    expect(resets.filter((selector) => selector.includes('::backdrop'))).toHaveLength(1);
    const defaultsInExport = await diagram.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        rotate: style.getPropertyValue('--tw-rotate').trim(),
        scale: style.getPropertyValue('--tw-scale-x').trim(),
      };
    });
    expect(defaultsInExport).toEqual({ rotate: '0', scale: '1' });
    expect(
      await offline
        .locator('#write > p')
        .first()
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--tw-scale-x').trim()),
    ).toBe('');
    expect(requests).toEqual([]);
  } finally {
    await offline.close();
  }
  // This verifies public offline HTML export, not native screenshot/PNG or
  // WKWebView/WebView2 print/PDF behavior.
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});
