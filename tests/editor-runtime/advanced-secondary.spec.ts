import { createHash } from 'node:crypto';
import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

type Host = Window & { marklyraEditor: MarkLyraEditor };
const toggle = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.execute({ type: 'toggleSource' }));

test('YAML metadata edits keep their mixed-EOL source and real history through Source mode', async ({
  page,
}) => {
  const source = '\ufeff---\r\ntitle: Old\nauthor: Test\r\n---\r\n\r\nTail  \n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    meta = frame.locator('#write .md-meta-block');
  await expect(meta).toHaveCount(1);
  await meta.click();
  await meta.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let match: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (node.textContent?.includes('Test')) match = node;
    if (!match) throw Error('Missing author text');
    const offset = (match.textContent?.indexOf('Test') ?? 0) + 4;
    (window as unknown as LegacyGlobals).editor?.writingArea.focus();
    getSelection()?.setBaseAndExtent(match, offset, match, offset);
  });
  await page.keyboard.type('X');
  const edited = source.replace('Test', 'TestX');
  await expect.poll(() => advancedSource(page)).toBe(edited);
  await advancedHistory(page, 'undo');
  await expect.poll(() => advancedSource(page)).toBe(source);
  await advancedHistory(page, 'redo');
  await expect.poll(() => advancedSource(page)).toBe(edited);
  await toggle(page);
  await toggle(page);
  expect(await advancedSource(page)).toBe(edited);
  expect(await advancedErrors(page)).toEqual([]);
});

test('TOC real navigation updates headings and late refresh reads only the replacement document', async ({
  page,
}) => {
  const source = '[TOC]\n\n# One\n\n## Two\n\nTail\n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    toc = frame.locator('#write .md-toc');
  await expect(toc).toContainText('Two');
  await toc.getByText('Two', { exact: true }).click();
  await page.keyboard.type('Z');
  const edited = source.replace('Two', 'TwoZ');
  await expect.poll(() => advancedSource(page)).toBe(edited);
  await expect(toc).toContainText('TwoZ');
  await advancedHistory(page, 'undo');
  await expect.poll(() => advancedSource(page)).toBe(source);
  await expect(toc).not.toContainText('TwoZ');
  await advancedHistory(page, 'redo');
  await expect.poll(() => advancedSource(page)).toBe(edited);
  await toggle(page);
  await toggle(page);
  expect(await advancedSource(page)).toBe(edited);
  const next = '[TOC]\r\n\r\n# NEW\r\n\r\nFresh\r\n';
  await page.evaluate((next) => (window as unknown as Host).marklyraEditor.load(next), next);
  await frame
    .locator('#write')
    .evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 700)));
  expect(await advancedSource(page)).toBe(next);
  await expect(toc).toContainText('NEW');
  await expect(toc).not.toContainText('Two');
  expect(await advancedErrors(page)).toEqual([]);
});

test('footnote real navigation edits its definition while preserving both references and Source roundtrip', async ({
  page,
}) => {
  const source = 'First[^n] and second[^n].\n\n[^n]: Footnote **content**.\n';
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    refs = frame.locator('#write .md-footnote');
  await expect(refs).toHaveCount(2);
  await refs.first().click({ modifiers: ['Meta'] });
  const receipt = await frame
    .locator('#write')
    .evaluate(() => (window as unknown as LegacyGlobals).editor?.selection.buildUndo());
  expect(receipt?.type).toBe('cursor');
  await page.keyboard.type('X');
  await expect.poll(() => advancedSource(page)).toBe(source.replace('Footnote ', 'Footnote X'));
  const edited = await advancedSource(page);
  await advancedHistory(page, 'undo');
  await expect.poll(() => advancedSource(page)).toBe(source);
  await advancedHistory(page, 'redo');
  await expect.poll(() => advancedSource(page)).toBe(edited);
  await expect(refs).toHaveCount(2);
  await toggle(page);
  await toggle(page);
  expect(await advancedSource(page)).toBe(edited);
  expect(await advancedErrors(page)).toEqual([]);
});

for (const large of [false, true])
  test(`confirmed advanced constructs render without changing source; large=${large}`, async ({
    page,
  }, info) => {
    const syntax =
        '---\r\ntitle: Lifecycle\n---\r\n\r\n[TOC]\n\n# Advanced\n\nInline $x^2$ and H~2~O, x^2^, ==mark==, <u>under</u>.[^a]\n\n$$\n\\frac{1}{2}\n$$\n\n```math\nx^2+y^2\n```\n\n```mermaid\ngraph TD; A[Start] --> B[Finish];\n```\n\n```javascript\nconst n = 1;\n```\n\n[^a]: A note\n\n',
      padding = large
        ? Array.from(
            { length: 100 },
            (_, i) => `Paragraph ${i} ` + 'large document text '.repeat(50) + '\n\n',
          ).join('')
        : 'Tail\n',
      source = '\ufeff' + syntax + padding,
      digest = (s: string) => createHash('sha256').update(s).digest('hex'),
      start = Date.now();
    await mountAdvanced(page, source);
    const frame = advancedFrame(page);
    await expect(frame.locator('#write .md-math-block svg')).toHaveCount(1);
    const owners = () =>
      frame.locator('#write .md-diagram-panel svg').evaluateAll((nodes) =>
        nodes.map((svg) => {
          const block = svg.closest('[mdtype][cid]'),
            cid = block?.getAttribute('cid') ?? '';
          return {
            cid,
            type: block?.getAttribute('mdtype'),
            lang: (window as unknown as LegacyGlobals).editor?.getNode(cid)?.get('lang'),
          };
        }),
      );
    // The confirmed GitLab math fence and Mermaid both use this panel class.
    // Wait for both real owners, rather than racing against the first SVG.
    await expect
      .poll(async () => (await owners()).map((owner) => owner.lang).sort())
      .toEqual(['math', 'mermaid']);
    await info.attach('diagram-svg-owners', {
      body: JSON.stringify(await owners()),
      contentType: 'application/json',
    });
    await expect(frame.locator('#write .md-toc')).toContainText('Advanced');
    expect(digest(await advancedSource(page))).toBe(digest(source));
    await toggle(page);
    await toggle(page);
    expect(digest(await advancedSource(page))).toBe(digest(source));
    await info.attach('finite-advanced-sample', {
      body: JSON.stringify({
        bytes: Buffer.byteLength(source),
        sha256: digest(source),
        elapsedMs: Date.now() - start,
        comparisonBenchmark: false,
      }),
      contentType: 'application/json',
    });
    expect(await advancedErrors(page)).toEqual([]);
  });
