import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page } from '@playwright/test';
import type {
  LegacyEditor,
  LegacyGlobals,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type Host = Window & { marklyraEditor: MarkLyraEditor; advancedErrors: string[] };
const errors = new WeakMap<Page, string[]>();
export const advancedFrame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
export async function mountAdvanced(page: Page, source: string) {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as unknown as Host).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as unknown as Host,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor,
      root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing advanced SDK host');
    old.destroy();
    host.advancedErrors = [];
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.advancedErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
}
export const advancedSource = (page: Page) =>
  page.evaluate(() => (window as unknown as Host).marklyraEditor.flush());
export const advancedHistory = (page: Page, type: 'undo' | 'redo') =>
  page.evaluate((type) => (window as unknown as Host).marklyraEditor.execute({ type }), type);
export async function advancedErrors(page: Page) {
  return [
    ...(errors.get(page) ?? []),
    ...(await page.evaluate(() => (window as unknown as Host).advancedErrors)),
  ];
}
export async function codeState(page: Page) {
  return advancedFrame(page)
    .locator('#write')
    .evaluate((area) => {
      const runtime = window as unknown as LegacyGlobals,
        editor = runtime.editor;
      if (!editor) throw Error('Missing current editor');
      return [...area.querySelectorAll('[mdtype="fences"][cid]')].map((element) => {
        const id = element.getAttribute('cid') ?? '',
          node = editor.getNode(id),
          cm = editor.fences.queue?.[id] as
            | NonNullable<LegacyEditor['sourceView']['cm']>
            | undefined;
        return {
          id,
          type: node?.get('type'),
          language: node?.get('lang'),
          value: cm?.getValue(),
          mode: cm?.getOption('mode'),
          inputs: [...element.querySelectorAll('input')].map((input) => ({
            class: input.className,
            value: input.value,
            placeholder: input.placeholder,
          })),
          languageViews: [...element.querySelectorAll('[class*="lang"]')].map((node) => ({
            tag: node.tagName,
            class: node.className,
            text: node.textContent,
          })),
          highlight: [...element.querySelectorAll('.CodeMirror-code [class^="cm-"]')].map(
            (node) => [node.className, node.textContent],
          ),
        };
      });
    });
}
export async function settledAdvancedSource(page: Page, expected: string) {
  await expect.poll(() => advancedSource(page)).toBe(expected);
}
