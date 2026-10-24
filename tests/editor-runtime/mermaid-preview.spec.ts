import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { expect, test } from '@playwright/test';
import {
  advancedErrors,
  advancedFrame,
  advancedSource,
  mountAdvanced,
} from './advanced-lifecycle.helpers.js';

const source =
  '\uFEFFBefore\r\n\r\n```mermaid\r\nflowchart LR\r\n A[业务文档] -->|解析与建立索引| B[知识索引]\r\n B --> C[应用编排]\r\n```\r\n\r\nTail  \n';
test('Mermaid hover preview preserves source, history and the original click-to-edit interaction', async ({
  page,
}, info) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    block = frame.locator('#write [mdtype="fences"][lang="mermaid"]');
  const svg = block.locator('.md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  const history = () =>
    frame.locator('#write').evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        undo: { commandStack: unknown; index: number };
      };
      return JSON.stringify([editor.undo.commandStack, editor.undo.index]);
    });
  const before = await history(),
    originalSVG = await svg.evaluate((element) => element.outerHTML);
  await svg.hover();
  const trigger = frame.getByRole('button', { name: '查看大图', exact: true });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览', exact: true });
  await expect(viewer).toBeVisible();
  await expect
    .poll(() => viewer.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(100);
  await expect(block.locator('.CodeMirror')).toBeHidden();
  expect(await history()).toBe(before);
  expect(await advancedSource(page)).toBe(source);
  expect(await svg.evaluate((element) => element.outerHTML)).toBe(originalSVG);
  await viewer.getByRole('button', { name: '原始尺寸', exact: true }).click();
  await viewer.getByRole('button', { name: '放大', exact: true }).click();
  await expect(viewer.locator('[data-preview-scale]')).toHaveText('125%');
  await page.screenshot({ path: info.outputPath('mermaid-preview.png') });
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  expect(await history()).toBe(before);
  expect(await advancedSource(page)).toBe(source);
  await block.locator('.md-diagram-panel').click();
  await expect(block.locator('.CodeMirror')).toBeVisible();
  expect(await advancedErrors(page)).toEqual([]);
});

test('ordinary graph clicks edit Mermaid and preview closure restores the code selection', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    block = frame.locator('#write [mdtype="fences"]');
  await expect(block.locator('svg')).toBeVisible();
  await block.locator('.md-diagram-panel').click();
  const code = block.locator('.CodeMirror');
  await expect(code).toBeVisible();
  await code.evaluate((element) => {
    const cm = Reflect.get(element, 'CodeMirror') as {
      focus(): void;
      setSelections(value: unknown): void;
    };
    cm.focus();
    cm.setSelections([{ anchor: { line: 1, ch: 7 }, head: { line: 1, ch: 3 } }]);
  });
  await block.locator('.md-diagram-panel-preview svg').hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览', exact: true });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: '关闭图表预览', exact: true }).click();
  await expect
    .poll(() =>
      code.evaluate((element) => {
        const cm = Reflect.get(element, 'CodeMirror') as {
          getCursor(edge: string): { line: number; ch: number };
        };
        const anchor = cm.getCursor('anchor'),
          head = cm.getCursor('head');
        return {
          anchor: { line: anchor.line, ch: anchor.ch },
          head: { line: head.line, ch: head.ch },
        };
      }),
    )
    .toEqual({ anchor: { line: 1, ch: 7 }, head: { line: 1, ch: 3 } });
  expect(await advancedSource(page)).toBe(source);
  await expect(code).toBeVisible();
  await page.keyboard.insertText('文档输入');
  await expect.poll(() => advancedSource(page)).toBe(source.replace('业务文档', '文档输入'));
  await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.load('Replacement'),
  );
  await expect(frame.locator('.ml-image-preview-trigger')).toBeHidden();
});

for (const theme of ['marklyra-light', 'marklyra-dark'] as const) {
  for (const [kind, graph] of [
    ['flowchart', 'flowchart LR\n A["**中文标题**<br/>第二行"] -->|结果| B[完成]'],
    [
      'sequence',
      'sequenceDiagram\n participant A as 用户\n participant B as 应用服务\n A->>B: 请求\n B-->>A: 响应',
    ],
    ['state', 'stateDiagram-v2\n [*] --> Ready\n Ready --> Done: 完成\n Done --> [*]'],
  ]) {
    test(`${theme}: ${kind} vector snapshot retains readable labels and fits narrow windows`, async ({
      page,
    }, info) => {
      const text = `Before\n\n\`\`\`mermaid\n${graph}\n\`\`\`\n\nTail\n`;
      await mountAdvanced(page, text);
      await page.evaluate(async (theme) => {
        await (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
          type: 'setTheme',
          theme,
        });
      }, theme);
      const svg = advancedFrame(page).locator('#write .md-diagram-panel-preview > svg');
      await expect(svg).toBeVisible();
      await svg.hover();
      await advancedFrame(page).getByRole('button', { name: '查看大图', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览', exact: true });
      await expect(viewer.locator('img')).toBeVisible();
      await expect
        .poll(() =>
          viewer.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      await expect(viewer).toHaveAttribute(
        'data-theme',
        theme === 'marklyra-dark' ? 'dark' : 'light',
      );
      const snapshot = await viewer.locator('img').evaluate((image) => {
        const url = (image as HTMLImageElement).src;
        const doc = new DOMParser().parseFromString(
          decodeURIComponent(url.slice(url.indexOf(',') + 1)),
          'image/svg+xml',
        );
        return {
          error: !!doc.querySelector('parsererror'),
          text: doc.documentElement.textContent,
          styles: doc.querySelectorAll('[style]').length,
          width: doc.documentElement.getAttribute('width'),
          viewBox: doc.documentElement.getAttribute('viewBox'),
        };
      });
      expect(snapshot.error).toBe(false);
      expect(snapshot.text).toContain(
        kind === 'flowchart' ? '第二行' : kind === 'sequence' ? '应用服务' : '完成',
      );
      expect(snapshot.styles).toBeGreaterThan(5);
      expect(snapshot.viewBox).toBeTruthy();
      await viewer.getByRole('button', { name: '适应宽度', exact: true }).click();
      await page.screenshot({ path: info.outputPath('mermaid-vector.png') });
      await page.setViewportSize({ width: 480, height: 400 });
      await viewer.getByRole('button', { name: '适应窗口', exact: true }).click();
      await expect
        .poll(async () => (await viewer.locator('img').boundingBox())?.width)
        .toBeLessThan(480);
      await viewer.getByRole('button', { name: '关闭图表预览', exact: true }).click();
      expect(await advancedSource(page)).toBe(text);
      expect(await advancedErrors(page)).toEqual([]);
    });
  }
}

test('Mermaid editing, rendering and Undo/Redo continue after preview', async ({ page }) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    block = frame.locator('#write [mdtype="fences"]');
  const svg = block.locator('.md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  await svg.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mermaid 图预览' })).toBeVisible();
  await page.keyboard.press('Escape');
  await block.locator('.md-diagram-panel').click();
  await block.locator('.CodeMirror').evaluate((element) => {
    const cm = Reflect.get(element, 'CodeMirror') as {
      getValue(): string;
      focus(): void;
      setSelections(value: unknown): void;
    };
    const lines = cm.getValue().split('\n'),
      line = lines.findIndex((value) => value.includes('应用编排'));
    const ch = lines[line]?.indexOf('应用编排') ?? -1;
    if (ch < 0) throw Error('Missing label');
    cm.focus();
    cm.setSelections([{ anchor: { line, ch }, head: { line, ch: ch + 4 } }]);
  });
  await page.keyboard.insertText('审核');
  await expect(svg).toContainText('审核');
  await frame.locator('#write > p').last().click();
  await expect.poll(() => advancedSource(page)).toBe(source.replace('应用编排', '审核'));
  await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
      type: 'undo',
    }),
  );
  await expect.poll(() => advancedSource(page)).toBe(source);
  await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.execute({
      type: 'redo',
    }),
  );
  await expect.poll(() => advancedSource(page)).toBe(source.replace('应用编排', '审核'));
  await expect(svg).toContainText('审核');
  await svg.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mermaid 图预览' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await advancedErrors(page)).toEqual([]);
});

test('preview SVG removes active content and external resource references from a detached copy', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    svg = frame.locator('#write .md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  await svg.evaluate((element) => {
    const script = document.createElementNS('http://www.w3.org/2000/svg', 'script');
    script.setAttribute('type', 'application/json');
    script.textContent = '{}';
    element.append(script);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', 'https://untrusted.test/icon.svg#icon');
    use.setAttribute('onclick', 'testMarker');
    element.append(use);
  });
  await svg.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览' });
  const snapshot = await viewer.locator('img').evaluate((image) => {
    const url = (image as HTMLImageElement).src,
      text = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    return {
      active: doc.querySelectorAll('script,[onclick],iframe,object').length,
      external: text.includes('untrusted.test'),
    };
  });
  expect(snapshot).toEqual({ active: 0, external: false });
  await expect(svg.locator('script')).toHaveCount(1);
  await page.keyboard.press('Escape');
  expect(await advancedSource(page)).toBe(source);
});

test('pending redraw does not preview stale Mermaid output and the new render remains editable', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    block = frame.locator('#write [mdtype="fences"]');
  await expect(block.locator('svg')).toBeVisible();
  await block.locator('.md-diagram-panel').click();
  await frame.locator('#write').evaluate(() => {
    const api = Reflect.get(window, 'mermaidAPI') as {
      render(...args: unknown[]): Promise<unknown>;
    };
    const facade = Object.create(api) as typeof api;
    Reflect.set(window, '__mermaidPreviewPending', []);
    Object.defineProperty(facade, 'render', {
      value: (...args: unknown[]) => {
        const actual = api.render(...args);
        if (!String(args[1]).includes('Delayed')) return actual;
        return new Promise((resolve) =>
          (Reflect.get(window, '__mermaidPreviewPending') as (() => void)[]).push(
            () => void actual.then(resolve),
          ),
        );
      },
    });
    Reflect.set(window, 'mermaidAPI', facade);
  });
  await block.locator('.CodeMirror').evaluate((element) => {
    const cm = Reflect.get(element, 'CodeMirror') as {
      getValue(): string;
      focus(): void;
      setSelections(value: unknown): void;
    };
    const lines = cm.getValue().split('\n');
    cm.focus();
    cm.setSelections([
      {
        anchor: { line: 0, ch: 0 },
        head: { line: lines.length - 1, ch: lines.at(-1)?.length ?? 0 },
      },
    ]);
  });
  await page.keyboard.insertText('graph TD; A[Delayed] --> B[New];');
  await expect
    .poll(() =>
      frame
        .locator('#write')
        .evaluate(() => (Reflect.get(window, '__mermaidPreviewPending') as unknown[]).length),
    )
    .toBeGreaterThan(0);
  const panel = block.locator('.md-diagram-panel-preview');
  await panel.hover();
  await expect(frame.getByRole('button', { name: '查看大图', exact: true })).toBeHidden();
  await frame.locator('#write').evaluate(() => {
    for (const release of (Reflect.get(window, '__mermaidPreviewPending') as (() => void)[]).splice(
      0,
    ))
      release();
  });
  await expect(panel.locator('svg')).toContainText('Delayed');
  await panel.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览' });
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(block.locator('.CodeMirror')).toBeVisible();
  expect(await advancedErrors(page)).toEqual([]);
});

test('equivalent SVG repaint retains the hover handle before clicking it', async ({ page }) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    svg = frame.locator('#write .md-diagram-panel-preview > svg'),
    trigger = frame.getByRole('button', { name: '查看大图', exact: true });
  await expect(svg).toBeVisible();
  await svg.hover();
  await expect(trigger).toBeVisible();
  await svg.evaluate(async (element) => {
    const parent = element.parentElement;
    element.remove();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const handle = document.querySelector<HTMLButtonElement>('.ml-image-preview-trigger');
    if (!handle || handle.hidden) throw Error('Repaint hid the hover handle');
    parent?.append(element.cloneNode(true));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (handle.hidden) throw Error('Replacement hid the hover handle');
  });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Mermaid 图预览' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await advancedSource(page)).toBe(source);
  expect(await advancedErrors(page)).toEqual([]);
});

test('equivalent SVG repaint survives preview, while a new document revokes it', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    svg = frame.locator('#write .md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  await svg.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览' });
  await expect(viewer).toBeVisible();
  await svg.evaluate((element) => element.replaceWith(element.cloneNode(true)));
  await viewer.getByRole('button', { name: '顺时针旋转' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '90');
  await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.load('Next document'),
  );
  await expect(viewer).toHaveCount(0);
  expect(await advancedSource(page)).toBe('Next document');
});

test('temporary SVG removal and reinsertion during repaint keep a valid snapshot', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    svg = frame.locator('#write .md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  await svg.hover();
  await frame.getByRole('button', { name: '查看大图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Mermaid 图预览' });
  await expect(viewer).toBeVisible();
  await svg.evaluate((element) => {
    Reflect.set(window, '__retainedPreviewSvg', element);
    element.remove();
  });
  await viewer.getByRole('button', { name: '原始尺寸' }).click();
  await expect(viewer.locator('[data-preview-scale]')).toHaveText('100%');
  await frame.locator('#write .md-diagram-panel-preview').evaluate((panel) => {
    const svg = Reflect.get(window, '__retainedPreviewSvg') as Element;
    panel.append(svg);
    Reflect.deleteProperty(window, '__retainedPreviewSvg');
  });
  await viewer.getByRole('button', { name: '关闭图表预览' }).click();
  expect(await advancedSource(page)).toBe(source);
});

test('composition and non-Mermaid fences retain normal input without opening diagram previews', async ({
  page,
}) => {
  await mountAdvanced(page, source);
  const frame = advancedFrame(page),
    svg = frame.locator('#write .md-diagram-panel-preview > svg');
  await expect(svg).toBeVisible();
  await svg.hover();
  await expect(frame.getByRole('button', { name: '查看大图', exact: true })).toBeVisible();
  await frame.locator('#write').dispatchEvent('compositionstart', { data: '中' });
  await frame.locator('.ml-image-preview-trigger').dispatchEvent('click');
  await expect(page.getByRole('dialog', { name: 'Mermaid 图预览' })).toHaveCount(0);
  await frame.locator('#write').dispatchEvent('compositionend', { data: '' });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.isComposing,
      ),
    )
    .toBe(false);
  await page.evaluate(() =>
    (window as unknown as { marklyraEditor: MarkLyraEditor }).marklyraEditor.load(
      '```js\nconst value = 1;\n```\n',
    ),
  );
  await frame.locator('#write .CodeMirror').hover();
  await expect(frame.getByRole('button', { name: '查看大图', exact: true })).toBeHidden();
});
