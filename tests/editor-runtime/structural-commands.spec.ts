import { expect, type Page, test } from '@playwright/test';
import type { LegacyGlobals } from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import { blockIndentFixtures } from '../fixtures/block-indent-fixtures.js';
import {
  createImageEditor,
  type ImageTestWindow,
  imageFrame,
  imageSource,
  setupImageHost,
} from './image-assets.helpers.js';
import { selectStructure, structuralSemantics } from './structural-commands.helpers.js';

type StructuralCommand =
  | { type: 'indent' | 'outdent' | 'undo' | 'redo' | 'toggleSource' }
  | { type: 'list'; style: 'blockquote' };
async function execute(page: Page, command: StructuralCommand) {
  await page.evaluate(
    (command) => (window as ImageTestWindow).imageHostFixture.editors[0]?.execute(command),
    command,
  );
}
async function policy(page: Page, indentSize: 2 | 3) {
  await page.evaluate(
    (indentSize) =>
      (window as ImageTestWindow).imageHostFixture.editors[0]?.setMarkdownPreferences({
        indentSize,
      }),
    indentSize,
  );
}
test.beforeEach(async ({ page }) => {
  await setupImageHost(page);
});
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as ImageTestWindow).imageHostFixture.errors)).toEqual(
    [],
  );
});

const fixtures = [
  ...blockIndentFixtures,
  ...blockIndentFixtures
    .filter((fixture) => fixture.name.includes('quote') && !fixture.source.includes('\r'))
    .map((fixture) => ({
      ...fixture,
      name: `${fixture.name} CRLF`,
      source: fixture.source.replace(/\n/gu, '\r\n'),
      canonical: fixture.canonical.replace(/\n/gu, '\r\n'),
      edited: fixture.edited.replace(/\n/gu, '\r\n'),
    })),
];
for (const fixture of fixtures)
  for (const backward of fixture.to ? [false, true] : [false])
    test(`SDK ${fixture.name}${backward ? ' backward' : ''}: original command, exact raw, history and reparse`, async ({
      page,
    }) => {
      const raw = `\ufeff${fixture.source}`;
      await createImageEditor(page, { source: raw, context: 'structural-command' });
      const frame = imageFrame(page);
      const channel = await frame.locator('body').evaluate(() => location.href);
      await selectStructure(frame, fixture.from, fixture.to, backward);
      const beforeRevision = await page.evaluate(
        () => (window as ImageTestWindow).imageHostFixture.editors[0]?.revision,
      );
      await execute(
        page,
        fixture.action === 'quote'
          ? { type: 'list', style: 'blockquote' }
          : { type: fixture.action },
      );
      const saved = await imageSource(page);
      expect(saved).toBe(`\ufeff${fixture.edited}`);
      const canonical = await frame.locator('#write').evaluate(() => {
        const editor = (window as unknown as LegacyGlobals).editor;
        if (!editor) throw new Error('Missing canonical editor');
        return {
          text: editor.getMarkdown(),
          crlf: Boolean((window as unknown as LegacyGlobals).File?.useCRLF),
        };
      });
      expect(canonical.text).toBe(
        canonical.crlf
          ? fixture.canonical.replace(/\r?\n/gu, '\r\n')
          : fixture.canonical.replace(/\r\n/gu, '\n'),
      );
      if (fixture.noop) {
        expect(
          await page.evaluate(
            () => (window as ImageTestWindow).imageHostFixture.editors[0]?.revision,
          ),
        ).toBe(beforeRevision);
        return;
      }
      const meaning = await structuralSemantics(frame);
      const second = await createImageEditor(page, {
        source: saved,
        context: 'independent-reparse',
      });
      const reparsed = await structuralSemantics(imageFrame(page, second));
      if (fixture.name === 'outdent-nested-descendant') {
        // -K02: shipped JS also merges these two adjacent nested ULs on its
        // own canonical reparse. Preserve the ownership assertion, and allow
        // only that measured discrepancy to reach the expected failure.
        expect(meaning.filter((leaf) => leaf.text === 'Gamma')).toHaveLength(1);
        const knownReparse = meaning.map((leaf) => {
          if (leaf.text !== 'Gamma') return leaf;
          expect(leaf.path).toHaveLength(2);
          expect(leaf.path[1]).toEqual(['list', 'ul', null, null, 0]);
          return { ...leaf, path: [leaf.path[0], ['list', 'ul', null, null, 1]] };
        });
        expect(reparsed).toEqual(knownReparse);
        test.fail(true, 'original nested outdent loses list-group ownership on reparse');
      }
      expect(reparsed).toEqual(meaning);
      await page.evaluate((index) => {
        (window as ImageTestWindow).imageHostFixture.editors[index]?.destroy();
      }, second);
      await execute(page, { type: 'undo' });
      expect(await imageSource(page)).toBe(raw);
      await execute(page, { type: 'redo' });
      expect(await imageSource(page)).toBe(saved);
      expect(await frame.locator('body').evaluate(() => location.href)).toBe(channel);
    });

test('SDK complete outdent consumes the three-space raw prefix after a two-space live policy change', async ({
  page,
}) => {
  const raw = '\ufeff- Alpha\r\n- Beta\n\nTail  \r\n';
  await createImageEditor(page, { source: raw, context: 'raw-three-space' });
  const frame = imageFrame(page);
  await policy(page, 3);
  await selectStructure(frame, 'Beta');
  await execute(page, { type: 'indent' });
  const nested = raw.replace('- Beta', '   - Beta');
  expect(await imageSource(page)).toBe(nested);
  await policy(page, 2);
  expect(await imageSource(page)).toBe(nested);
  await selectStructure(frame, 'Beta');
  await execute(page, { type: 'outdent' });
  expect(await imageSource(page)).toBe(raw);
  await execute(page, { type: 'undo' });
  expect(await imageSource(page)).toBe(nested);
  await execute(page, { type: 'redo' });
  expect(await imageSource(page)).toBe(raw);
  await execute(page, { type: 'toggleSource' });
  expect(await imageSource(page)).toBe(raw);
  await execute(page, { type: 'toggleSource' });
  expect(await imageSource(page)).toBe(raw);
});

test('SDK physical Tab and Shift+Tab use the same exact prefix proof with mixed physical endings', async ({
  page,
}) => {
  const raw = '\ufeff- Alpha\r\n- Beta\n- Gamma\r\n\r\nTail  \r';
  await createImageEditor(page, { source: raw, context: 'physical-structure' });
  const frame = imageFrame(page);
  await frame
    .locator('#write p')
    .filter({ hasText: /^Beta$/u })
    .click();
  await page.keyboard.press('Tab');
  const nested = raw.replace('- Beta', '  - Beta');
  expect(await imageSource(page)).toBe(nested);
  await page.keyboard.press('Shift+Tab');
  expect(await imageSource(page)).toBe(raw);
  await execute(page, { type: 'undo' });
  expect(await imageSource(page)).toBe(nested);
  await execute(page, { type: 'redo' });
  expect(await imageSource(page)).toBe(raw);
});

test('SDK repeated list text uses the selected model occurrence and preserves the other physical lines', async ({
  page,
}) => {
  const raw = '\ufeff- Same\r\n- Same\n- Same\r\n\r\nTail  \r\n';
  await createImageEditor(page, { source: raw, context: 'repeated-structure' });
  const frame = imageFrame(page);
  await frame.locator('#write li > p').nth(1).click();
  await page.keyboard.press('Tab');
  const edited = '\ufeff- Same\r\n  - Same\n- Same\r\n\r\nTail  \r\n';
  expect(await imageSource(page)).toBe(edited);
  await execute(page, { type: 'undo' });
  expect(await imageSource(page)).toBe(raw);
  await execute(page, { type: 'redo' });
  expect(await imageSource(page)).toBe(edited);
  await frame.locator('#write li > p').nth(1).click();
  await page.keyboard.press('Shift+Tab');
  expect(await imageSource(page)).toBe(raw);
});
