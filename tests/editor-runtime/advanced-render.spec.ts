import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
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

type Fixture = { pending: { source: string; release(): Promise<void> }[]; completed: string[] };
const mathOld = '\\text{DelayedOld}',
  mathFresh = '\\text{Fresh}',
  diagramOld = 'graph TD; A[DelayedOld] --> B[Result];',
  diagramFresh = 'graph TD; A[Fresh] --> B[Result];';
test.beforeEach(async ({ page }) => {
  const baselineFrame = process.env.ADVANCED_BASELINE_FRAME;
  if (baselineFrame)
    await page.route('http://127.0.0.1:4174/frame-host.js', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(baselineFrame),
      }),
    );
  const baseline = process.env.ADVANCED_BASELINE_MAIN;
  if (baseline)
    await page.route('http://127.0.0.1:4174/appsrc/main.js', async (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: await readFile(baseline),
      }),
    );
});
async function enter(page: Page, kind: 'math' | 'diagram') {
  const frame = advancedFrame(page),
    selector = kind === 'math' ? '#write [mdtype="math_block"]' : '#write [mdtype="fences"]';
  if (await frame.locator(selector + ' .CodeMirror').isVisible()) return selector;
  if (kind === 'math') {
    await frame.locator(selector).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '编辑块', exact: true }).click();
  } else await frame.locator(selector + ' .md-diagram-panel').click();
  await expect(frame.locator(selector + ' .CodeMirror')).toBeVisible();
  return selector;
}
async function replace(page: Page, selector: string, value: string) {
  await advancedFrame(page)
    .locator(selector + ' .CodeMirror')
    .evaluate((wrapper) => {
      const cm = Reflect.get(wrapper, 'CodeMirror') as NonNullable<
          LegacyEditor['sourceView']['cm']
        >,
        lines = cm.getValue().split('\n');
      cm.focus();
      cm.setSelections([
        {
          anchor: { line: 0, ch: 0 },
          head: { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 },
        },
      ]);
    });
  await page.keyboard.type(value);
}
async function install(page: Page, kind: 'math' | 'diagram', old: string) {
  await advancedFrame(page)
    .locator('#write')
    .evaluate(
      (_, { kind, old }) => {
        type API = {
          tex2svgPromise?: (...args: unknown[]) => Promise<Element>;
          render?: (...args: unknown[]) => Promise<unknown>;
        };
        const host = window as unknown as LegacyGlobals & {
            MathJax: API;
            mermaidAPI: API;
            fixtureRender: Fixture;
          },
          base = kind === 'math' ? host.MathJax : host.mermaidAPI,
          name = kind === 'math' ? 'tex2svgPromise' : 'render',
          method = base[name];
        if (typeof method !== 'function') throw Error('Missing actual renderer');
        host.fixtureRender = { pending: [], completed: [] };
        const facade = Object.create(base) as API;
        Object.defineProperty(facade, name, {
          configurable: true,
          value: (...args: unknown[]) => {
            const source = String(args[kind === 'math' ? 0 : 1]),
              actual = Promise.resolve(Reflect.apply(method, base, args)).then(
                (result: unknown) => {
                  // Mark real MathJax output for controlled commit identity; never fake SVG.
                  if (kind === 'math' && result instanceof Element)
                    result.setAttribute('data-render', source);
                  return { result, error: undefined };
                },
                (error: unknown) => ({ result: undefined, error }),
              );
            if (!source.includes(old))
              return actual.then(({ result, error }) => {
                host.fixtureRender.completed.push(source);
                if (error) throw error;
                return result;
              });
            return new Promise((resolve, reject) =>
              host.fixtureRender.pending.push({
                source,
                release: async () => {
                  const { result, error } = await actual;
                  if (error) reject(error);
                  else resolve(result);
                },
              }),
            );
          },
        });
        if (kind === 'math') host.MathJax = facade;
        else host.mermaidAPI = facade;
      },
      { kind, old },
    );
}
for (const kind of ['math', 'diagram'] as const)
  for (const oldError of kind === 'math' ? [false] : [false, true])
    test(`${kind} old ${oldError ? 'error' : 'success'} cannot overwrite a newer successful preview`, async ({
      page,
    }, info) => {
      const old = kind === 'math' ? mathOld : oldError ? 'graph TD; Broken[' : diagramOld,
        fresh = kind === 'math' ? mathFresh : diagramFresh,
        source =
          kind === 'math'
            ? 'Intro\n\n$$\n\\text{Initial}\n$$\n\nTail\n'
            : 'Intro\n\n```mermaid\ngraph TD; A[Initial] --> B[Result];\n```\n\nTail\n';
      await mountAdvanced(page, source);
      const selector = await enter(page, kind),
        frame = advancedFrame(page),
        preview = frame.locator(
          selector + (kind === 'math' ? ' .md-mathjax-preview' : ' .md-diagram-panel-preview'),
        );
      await install(page, kind, old);
      await replace(page, selector, old);
      await expect
        .poll(() =>
          frame
            .locator('#write')
            .evaluate(() => (Reflect.get(window, 'fixtureRender') as Fixture).pending.length),
        )
        .toBe(1);
      await replace(page, selector, fresh);
      if (kind === 'math')
        await expect(preview.locator('[data-render]').last()).toHaveAttribute('data-render', fresh);
      else await expect(preview.locator('svg')).toContainText('Fresh');
      const snapshot = async () => ({
        preview: await preview.innerHTML(),
        error: await frame.locator(selector + ' .md-diagram-panel-error').allTextContents(),
        class: await frame.locator(selector).getAttribute('class'),
      });
      const current = await snapshot();
      await frame.locator('#write').evaluate(async () => {
        const held = Reflect.get(window, 'fixtureRender') as Fixture;
        for (const pending of held.pending.splice(0)) await pending.release();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      const after = await snapshot();
      await info.attach('actual-preview-commit', {
        body: JSON.stringify({ kind, oldError, current, after }, null, 2),
        contentType: 'application/json',
      });
      expect(after).toEqual(current);
      expect(await advancedSource(page)).toBe(
        source.replace(
          kind === 'math' ? '\\text{Initial}' : 'graph TD; A[Initial] --> B[Result];',
          fresh,
        ),
      );
      expect(await advancedErrors(page)).toEqual([]);
    });

for (const kind of ['math', 'diagram'] as const)
  test(`${kind} invalid syntax can be repaired and committed block edits retain history`, async ({
    page,
  }) => {
    const invalid = kind === 'math' ? '\\frac' : 'graph TD; A --> --> B;',
      repaired = kind === 'math' ? 'y^3' : 'graph TD; A[Repaired] --> B[End];',
      document = (body: string) =>
        kind === 'math'
          ? '$$\n' + body + '\n$$\n\nTail\n'
          : '```mermaid\n' + body + '\n```\n\nTail\n';
    await mountAdvanced(page, document(invalid));
    const selector = await enter(page, kind),
      frame = advancedFrame(page),
      preview = frame.locator(
        selector + (kind === 'math' ? ' .md-mathjax-preview' : ' .md-diagram-panel-preview'),
      );
    expect(await advancedSource(page)).toBe(document(invalid));
    if (kind === 'math')
      await expect(preview.locator('merror,[data-mjx-error]')).not.toHaveCount(0);
    else
      await expect(frame.locator(selector + ' .md-diagram-panel')).toContainText(
        /parse|syntax|error/i,
      );
    await replace(page, selector, repaired);
    await expect.poll(() => advancedSource(page)).toBe(document(repaired));
    await expect(preview.locator('svg')).toHaveCount(1);
    if (kind === 'math') await expect(preview.locator('merror,[data-mjx-error]')).toHaveCount(0);
    else await expect(preview).toContainText('Repaired');
    await frame.locator('#write > p').last().click();
    await advancedHistory(page, 'undo');
    await expect.poll(() => advancedSource(page)).toBe(document(invalid));
    await advancedHistory(page, 'redo');
    await expect.poll(() => advancedSource(page)).toBe(document(repaired));
    await enter(page, kind);
    await replace(page, selector, repaired + (kind === 'math' ? '+z' : '\nB-->C;'));
    await expect
      .poll(() => advancedSource(page))
      .toBe(document(repaired + (kind === 'math' ? '+z' : '\nB-->C;')));
    expect(await advancedErrors(page)).toEqual([]);
  });
