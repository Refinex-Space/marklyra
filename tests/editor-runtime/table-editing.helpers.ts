import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, type Page } from '@playwright/test';
import type {
  LegacyGlobals,
  LegacyNode,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

type TableWindow = Window &
  typeof globalThis & { marklyraEditor: MarkLyraEditor; tableErrors: string[] };
const pageErrors = new WeakMap<Page, string[]>();
export async function mountTableEditor(page: Page, source: string) {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/runtime.html');
  await page.waitForFunction(() => Boolean((window as TableWindow).marklyraEditor));
  await page.evaluate(async (source) => {
    const host = window as TableWindow,
      old = host.marklyraEditor;
    await old.ready;
    const Constructor = old.constructor as typeof MarkLyraEditor;
    old.destroy();
    const root = document.querySelector<HTMLElement>('#editor');
    if (!root) throw Error('Missing table SDK host');
    host.tableErrors = [];
    host.marklyraEditor = new Constructor(root, {
      runtimeUrl: 'http://127.0.0.1:4174/index.html',
      markdown: source,
      onError: (error) => host.tableErrors.push(error.message),
    });
    await host.marklyraEditor.ready;
  }, source);
}
export const tableFrame = (page: Page) => page.frameLocator('.marklyra-editor-frame');
export const tableSource = (page: Page) =>
  page.evaluate(() => (window as TableWindow).marklyraEditor.flush());
export async function tableErrors(page: Page) {
  return [
    ...(await page.evaluate(() => (window as TableWindow).tableErrors)),
    ...(pageErrors.get(page) ?? []),
  ];
}
export async function tableHistory(page: Page, type: 'undo' | 'redo') {
  await page.evaluate((type) => (window as TableWindow).marklyraEditor.execute({ type }), type);
}
export async function tableMenu(page: Page, selector: string, label: string) {
  await tableFrame(page).locator(selector).first().click({ button: 'right' });
  const submenu = page.getByRole('menuitem', { name: /^表格\s+›$/u });
  await expect(submenu).toBeVisible();
  await submenu.hover();
  const item = page.getByRole('menuitem', { name: label, exact: true });
  await expect(item).toBeVisible();
  return item;
}
export async function tableModel(page: Page) {
  return tableFrame(page)
    .locator('#write')
    .evaluate((area) => {
      const editor = (window as unknown as LegacyGlobals).editor;
      if (!editor) throw Error('Missing table native model');
      const table = area.querySelector('[mdtype="table"][cid]'),
        model = editor.getNode(table?.getAttribute('cid') ?? '');
      if (!model) throw Error('Missing authored table');
      const path: unknown[] = [],
        seen = new Set<LegacyNode>();
      for (
        let parent = model.get('parent') as LegacyNode | undefined;
        parent;
        parent = parent.get('parent') as LegacyNode | undefined
      ) {
        if (seen.has(parent) || editor.getNode(parent.cid) !== parent)
          throw Error('Invalid authored table ancestry');
        seen.add(parent);
        const grand = parent.get('parent') as LegacyNode | undefined;
        let ordinal = 0;
        if (grand)
          for (
            let child = grand.getFirstChild();
            child && child !== parent;
            child = child.get('after')
          )
            ordinal++;
        path.unshift([
          parent.get('type'),
          Reflect.apply(parent.get, parent, ['style']) ?? null,
          Reflect.apply(parent.get, parent, ['checked']) ?? null,
          parent.get('type') === 'list_item' ? ordinal : null,
        ]);
      }
      const rows: { id: string; cells: { id: string; text: unknown }[] }[] = [];
      for (let row = model.getFirstChild(); row; row = row.get('after')) {
        const cells: { id: string; text: unknown }[] = [];
        for (let cell = row.getFirstChild(); cell; cell = cell.get('after'))
          cells.push({ id: cell.cid, text: cell.get('text') });
        rows.push({ id: row.cid, cells });
      }
      return {
        id: model.cid,
        align: Reflect.apply(model.get, model, ['align']) as unknown,
        path,
        rows,
        domRows: [...area.querySelectorAll('table tr')].map((row) =>
          [...row.querySelectorAll('th,td')].map((cell) => {
            const field = cell.matches('[mdtype="table_cell"][cid]')
              ? cell
              : cell.querySelector('[mdtype="table_cell"][cid]');
            if (!field) throw Error('Missing native DOM table cell');
            const raw: unknown = Reflect.get(field, 'rawText');
            if (typeof raw !== 'function') throw Error('Missing native DOM source text');
            return {
              tag: cell.tagName,
              id: field.getAttribute('cid'),
              text: Reflect.apply(raw, field, [true]) as unknown,
            };
          }),
        ),
      };
    });
}
export async function tableMeaning(page: Page) {
  const state = await tableModel(page);
  return {
    cells: state.rows.map((row) => row.cells.map((cell) => cell.text)),
    align: state.align,
    path: state.path,
  };
}
