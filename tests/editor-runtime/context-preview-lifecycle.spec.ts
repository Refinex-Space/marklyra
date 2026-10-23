import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';
import {
  advancedErrors,
  advancedFrame,
  advancedHistory,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

type MathRenderer = { tex2svgPromise(...args: unknown[]): Promise<Element> };
type Fixture = {
  pending: (() => Promise<void>)[];
  render: Promise<void>;
  target?: Element;
  block: Element;
  node: object;
  renderer: MathRenderer;
};

test.beforeEach(async ({ page }) => {
  const frame = process.env.CONTEXT_PREVIEW_FRAME;
  if (frame)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({ contentType: 'text/javascript', body: await readFile(frame) }),
    );
});

for (const { formula, action, label } of [
  { formula: 'x^2', action: 'edit', label: '编辑块' },
  { formula: '\\frac', action: 'edit', label: '编辑块' },
  { formula: 'x^2', action: 'before', label: '在前方插入段落' },
  { formula: 'x^2', action: 'after', label: '在后方插入段落' },
  { formula: 'x^2', action: 'delete', label: '删除块' },
])
  test(`math preview replacement preserves the open ${action} menu: ${formula}`, async ({
    page,
  }, info) => {
    const source = `$$\n${formula}\n$$\n\nTail\n`;
    await mountAdvanced(page, source);
    const frame = advancedFrame(page);
    const block = frame.locator('#write [mdtype="math_block"]');
    await expect(block.locator('svg')).toHaveCount(1);
    await block.evaluate((block) => {
      const host = window as unknown as LegacyGlobals & {
        MathJax: MathRenderer;
        contextPreviewFixture: Fixture;
      };
      const math = host.editor?.mathBlock as {
        renderUnder(element: Element, force: boolean): Promise<void>;
      };
      const base = host.MathJax;
      const facade = Object.create(base) as typeof base;
      const fixture: Fixture = {
        pending: [],
        render: Promise.resolve(),
        block,
        node: host.editor?.getNode(block.getAttribute('cid') ?? '') as object,
        renderer: base,
      };
      host.contextPreviewFixture = fixture;
      facade.tex2svgPromise = (...args) => {
        const actual = Reflect.apply(base.tex2svgPromise, base, args);
        return new Promise<Element>((resolve, reject) => {
          fixture.pending.push(async () => {
            try {
              resolve(await actual);
            } catch (error) {
              reject(error);
            }
          });
        });
      };
      host.MathJax = facade;
      // Re-render unchanged source with real MathJax, holding only its completion.
      fixture.render = math.renderUnder(block, true);
    });
    await expect
      .poll(() =>
        block.evaluate(
          () => (Reflect.get(window, 'contextPreviewFixture') as Fixture).pending.length,
        ),
      )
      .toBeGreaterThan(0);
    await block.locator('svg').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    const before = await block.evaluate(() => {
      const runtime = window as unknown as LegacyGlobals;
      const fixture = Reflect.get(window, 'contextPreviewFixture') as Fixture;
      const menu = runtime.editor?.contextMenu as { getContextTarget(): Element };
      fixture.target = menu.getContextTarget();
      return { targetTag: fixture.target.tagName, connected: fixture.target.isConnected };
    });
    const after = await block.evaluate(async () => {
      const runtime = window as unknown as LegacyGlobals & { MathJax: MathRenderer };
      const fixture = Reflect.get(window, 'contextPreviewFixture') as Fixture;
      runtime.MathJax = fixture.renderer;
      for (const release of fixture.pending.splice(0)) await release();
      await fixture.render;
      return {
        targetConnected: fixture.target?.isConnected,
        blockConnected: fixture.block.isConnected,
        sameNode: runtime.editor?.getNode(fixture.block.getAttribute('cid') ?? '') === fixture.node,
      };
    });
    await info.attach('real-math-preview-context', {
      body: JSON.stringify({ before, after }),
      contentType: 'application/json',
    });
    expect(before.connected).toBe(true);
    expect(after).toEqual({ targetConnected: false, blockConnected: true, sameNode: true });
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    if (action !== 'edit') {
      await expect.poll(() => advancedSource(page)).not.toBe(source);
      const changed = await advancedSource(page);
      expect(changed).toContain('Tail');
      await expect(block).toHaveCount(action === 'delete' ? 0 : 1);
      if (action !== 'delete') expect(changed).toContain(`$$\n${formula}\n$$`);
      await advancedHistory(page, 'undo');
      await expect.poll(() => advancedSource(page)).toBe(source);
      await advancedHistory(page, 'redo');
      await expect.poll(() => advancedSource(page)).toBe(changed);
      expect(await advancedErrors(page)).toEqual([]);
      return;
    }
    await expect(block.locator('.CodeMirror')).toBeVisible();
    expect(await advancedSource(page)).toBe(source);
    await block.locator('.CodeMirror').evaluate((wrapper) => {
      const cm = Reflect.get(wrapper, 'CodeMirror') as NonNullable<
        LegacyEditor['sourceView']['cm']
      >;
      const lines = cm.getValue().split('\n');
      cm.focus();
      cm.setSelections([
        {
          anchor: { line: 0, ch: 0 },
          head: { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 },
        },
      ]);
    });
    await page.keyboard.type('y^3');
    const edited = source.replace(formula, 'y^3');
    await expect.poll(() => advancedSource(page)).toBe(edited);
    await frame.locator('#write > p').last().click();
    await advancedHistory(page, 'undo');
    await expect.poll(() => advancedSource(page)).toBe(source);
    await advancedHistory(page, 'redo');
    await expect.poll(() => advancedSource(page)).toBe(edited);
    expect(await advancedErrors(page)).toEqual([]);
  });

test('an open formula menu still rejects replacement of its entire owning block', async ({
  page,
}) => {
  const source = '$$\nx^2\n$$\n\nTail\n';
  await mountAdvanced(page, source);
  const block = advancedFrame(page).locator('#write [mdtype="math_block"]');
  await expect(block.locator('svg')).toHaveCount(1);
  await block.locator('svg').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '编辑块', exact: true })).toBeVisible();
  // Reusing a cid never authorizes a new DOM owner; only descendant redraws qualify.
  await block.evaluate((element) => element.replaceWith(element.cloneNode(true)));
  await page.getByRole('menuitem', { name: '编辑块', exact: true }).click();
  await expect.poll(() => advancedErrors(page)).toContain('菜单上下文已改变，请重新打开菜单');
  await expect(block.locator('.CodeMirror')).toHaveCount(0);
  expect(await advancedSource(page)).toBe(source);
});
