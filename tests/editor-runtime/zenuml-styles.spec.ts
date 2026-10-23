import { readFile } from 'node:fs/promises';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

const rawCSS = await readFile(
  new URL('../../resources/editor/lib/diagram/css/mermaid-zenuml.css', import.meta.url),
  'utf8',
);
const transformUrl = new URL('../../scripts/lib/runtime-zenuml-styles.mjs', import.meta.url).href;
const { transformRuntimeZenUMLStyles } = (await import(transformUrl)) as {
  transformRuntimeZenUMLStyles(source: string): { code: string };
};
const scopedCSS = transformRuntimeZenUMLStyles(rawCSS).code;
const initializer = rawCSS.slice(rawCSS.indexOf('*,:before,:after{')).split('}')[0] ?? '';
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
  context,
}) => {
  expect(defaults).toHaveLength(44);
  const reference = await context.newPage();
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
  try {
    await loadStyleFixture(reference, rawCSS, markup);
    await loadStyleFixture(page, scopedCSS, markup);
    const ids = ['root', 'child', 'deep', 'nested-root', 'nested-child', 'utility'];
    const original = await styles(reference, ids);
    const transformed = await styles(page, ids);
    expect(transformed).toEqual(original);
    for (const id of ['root', 'child', 'deep', 'nested-root', 'nested-child'])
      for (const pseudo of ['', '::before', '::after']) {
        expect(transformed[id + pseudo]?.['--tw-rotate']).toBe('0');
        expect(transformed[id + pseudo]?.['--tw-scale-x']).toBe('1');
      }
    expect(transformed.utility?.['--tw-translate-y']).toBe('-2rem');
    expect(transformed.utility?.opacity).toBe('0.5');
    expect(transformed.utility?.transform).not.toBe('none');

    const outsideBefore = await styles(reference, ['outside']);
    const outsideAfter = await styles(page, ['outside']);
    expect(outsideBefore.outside?.['--tw-scale-x']).toBe('1');
    for (const snapshot of Object.values(outsideAfter))
      for (const property of defaults) expect(snapshot[property], property).toBe('');

    for (const target of [reference, page])
      await target.evaluate(() => {
        for (const element of document.querySelectorAll('dialog')) element.showModal();
      });
    expect(await styles(page, ['inside-dialog'], ['::backdrop'])).toEqual(
      await styles(reference, ['inside-dialog'], ['::backdrop']),
    );
    const outsideBackdrop = await styles(page, ['outside-dialog'], ['::backdrop']);
    for (const property of defaults)
      expect(outsideBackdrop['outside-dialog::backdrop']?.[property], property).toBe('');
  } finally {
    await reference.close();
  }
});

test('ZenUML initializer scoping preserves existing cascade and pseudo-element specificity', async ({
  page,
  context,
}) => {
  const reference = await context.newPage();
  const markup = `
    <section id="root" class="zenuml" data-probe>
      <div id="early" class="host-rule transform" data-probe>Earlier custom rule</div>
      <div id="late" class="late-zero transform" data-probe>Later zero-specificity rule</div>
      <div id="utility" class="opacity-50 custom-opacity" data-probe>Utility override</div>
    </section>`;
  // These are ordinary host overrides, not invented bundled rotate utilities.
  // They catch both a raised element specificity and a lost pseudo specificity.
  const before = `
    section{--tw-rotate:7deg}
    .host-rule{--tw-rotate:17deg;--tw-scale-x:1.25}
    .host-rule::before{--tw-rotate:23deg}
    :where(.host-rule)::after{--tw-rotate:29deg}`;
  const after = `
    :where(.late-zero){--tw-rotate:37deg}
    :where(.late-zero)::before{--tw-rotate:41deg}
    .zenuml .custom-opacity{opacity:.625}`;
  try {
    await loadStyleFixture(reference, rawCSS, markup, before, after);
    await loadStyleFixture(page, scopedCSS, markup, before, after);
    const ids = ['root', 'early', 'late', 'utility'];
    const transformed = await styles(page, ids);
    expect(transformed).toEqual(await styles(reference, ids));
    expect(transformed.root?.['--tw-rotate']).toBe('7deg');
    expect(transformed.early?.['--tw-rotate']).toBe('17deg');
    expect(transformed.early?.['--tw-scale-x']).toBe('1.25');
    expect(transformed['early::before']?.['--tw-rotate']).toBe('23deg');
    expect(transformed['early::after']?.['--tw-rotate']).toBe('0');
    expect(transformed.late?.['--tw-rotate']).toBe('37deg');
    expect(transformed['late::before']?.['--tw-rotate']).toBe('41deg');
    expect(transformed.utility?.opacity).toBe('0.625');
  } finally {
    await reference.close();
  }
});

test('bundled Mermaid renders actual ZenUML and preserves BOM and mixed-EOL source roundtrips', async ({
  page,
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
  await expect(frame.locator('#typora-source')).toBeVisible();
  expect(await advancedSource(page)).toBe(source);
  await toggle();
  await assertRendered();
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});
