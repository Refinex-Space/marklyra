import { expect, test } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { draftSource, installRecoveryMock } from './recovery-test-util.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMock);
  await page.addInitScript(installRecoveryMock);
  // Isolate export writes from the independently enabled background-save policy.
  await page.addInitScript(() => localStorage.setItem('marklyra-autosave', 'false'));
});

test('image and plain HTML snapshots consume confirmed options and preserve draft/history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument.text = '\uFEFF# Image\r\n\n中文 tail';
    mock.exportPreferences.image = {
      imageWidth: 800,
      quality: 2,
      useThemeFontSize: 0,
      imageFontSize: 24,
      exportTheme: 'marklyra-dark',
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  const frame = page.frameLocator('.marklyra-editor-frame');
  await frame.locator('#write > p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  const dirty = '\uFEFF# Image\r\n\n中文 tailX';
  await expect.poll(() => draftSource(page)).toBe(dirty);
  const identity = await page.locator('.marklyra-editor-frame').getAttribute('src');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-image'));
  await expect(page.locator('.notice-host')).toContainText('已导出 图片', { timeout: 20000 });
  const call = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((c) => c.command === 'save_export_image')
      .at(-1),
  );
  expect(call?.args.options).toEqual({
    imageWidth: 800,
    quality: 2,
    useThemeFontSize: 0,
    imageFontSize: 24,
    exportTheme: 'marklyra-dark',
  });
  expect(call?.args.sourceId).toBe('doc-a');
  expect(String(call?.args.html)).toContain('tailX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-html-plain'));
  await expect(page.locator('.notice-host')).toContainText('已导出 HTML', { timeout: 20000 });
  await expect.poll(() => draftSource(page)).toBe(dirty);
  expect(await page.locator('.marklyra-editor-frame').getAttribute('src')).toBe(identity);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (c) => c.command === 'save_document' || c.command === 'save_document_as',
      ),
    ),
  ).toEqual([]);
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(() => draftSource(page)).toBeNull();
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('redo'));
  await expect.poll(() => draftSource(page)).toBe(dirty);
});

test('missing converter and cancelled raster output preserve source and history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.frameLocator('.marklyra-editor-frame').locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-docx'));
  await expect(page.locator('.notice-host')).toContainText('未检测到Pandoc');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_format'),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.exportError = '已取消导出';
    mock.emitMenu('export-image');
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'save_export_image',
          ).length,
      ),
    )
    .toBe(1);
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('undo'));
  await expect.poll(() => draftSource(page)).toBeNull();
});

test('all nine confirmed converter actions use finite typed consumers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as TestWindow).__desktopMock.formatCapabilities = {
      pandoc: {
        status: 'available',
        path: '/mock/pandoc',
        version: '3.0',
        message: 'Mock capability only',
      },
      formats: ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml'],
      importExtensions: [],
      image: true,
    };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'Alpha',
  );
  await expect(page.getByRole('button', { name: '导出 HTML', exact: true })).toBeEnabled();
  const names: Record<string, string> = {
    docx: 'Word',
    odt: 'OpenOffice',
    rtf: 'RTF',
    epub: 'EPUB',
    latex: 'LaTeX',
    wiki: 'Media Wiki',
    rst: 'reStructuredText',
    textile: 'Textile',
    opml: 'OPML',
  };
  for (const format of Object.keys(names)) {
    await page.evaluate(
      (format) => (window as TestWindow).__desktopMock.emitMenu(`export-${format}`),
      format,
    );
    await expect(page.locator('.notice-host')).toContainText(`已导出 ${names[format]}`, {
      timeout: 20000,
    });
  }
  const calls = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_format'),
  );
  expect(calls.map((c) => c.args.target)).toEqual([
    'docx',
    'odt',
    'rtf',
    'epub',
    'latex',
    'wiki',
    'rst',
    'textile',
    'opml',
  ]);
  for (const call of calls) {
    // Converters read Markdown, never the HTML snapshot, and nothing else crosses the boundary.
    expect(Object.keys(call.args).sort()).toEqual([
      'markdown',
      'sourceId',
      'suggestedName',
      'target',
    ]);
    expect(String(call.args.markdown)).toContain('Alpha');
    expect(String(call.args.markdown)).not.toContain('<');
  }
  expect(await draftSource(page)).toBeNull();
});

test('imported candidate uses existing dirty confirmation and closes on cancel', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.frameLocator('.marklyra-editor-frame').locator('#write > p').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('import-document'));
  const dialog = page.getByRole('dialog', { name: '保存当前更改？' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => draftSource(page)).toBe('AlphaX');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls
          .filter((c) => c.command === 'close_document')
          .map((c) => c.args.id),
      ),
    )
    .toContain('imported');
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write > p')).toHaveText(
    'AlphaX',
  );
});

const pandoc = {
  status: 'available',
  path: '/mock/pandoc',
  version: '3.0',
  message: 'Mock capability only',
} as const;

test('PDF goes straight to a file with the document variables, and the notice can reveal it', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.nextDocument.text = '---\ntitle: 季度报告\nauthor: 李\n---\n\n# 正文\n';
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a header variable, not a template.
    mock.exportPreferences.pdf = { landscape: true, header: '${title}', splitPages: true };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText('正文');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-pdf'));
  const notice = page.locator('.notice-host');
  await expect(notice).toContainText('已导出 PDF · /mock/A.pdf', { timeout: 20000 });
  const call = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_pdf').at(-1),
  );
  // The front matter wins over the file name; nothing else crosses the boundary.
  expect(call?.args.context).toEqual({ title: '季度报告', author: '李' });
  expect(Object.keys(call?.args ?? {}).sort()).toEqual([
    'context',
    'html',
    'sourceId',
    'suggestedName',
  ]);
  expect(String(call?.args.html)).toContain('typora-print');
  await notice.getByRole('button', { name: '在文件夹中显示' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as TestWindow).__desktopMock.calls.filter(
            (c) => c.command === 'reveal_export_file',
          ).length,
      ),
    )
    .toBe(1);
  await expect(notice.getByRole('button', { name: '在文件夹中显示' })).toBeHidden();
});

test('without direct PDF the same menu item opens the system print panel with the page setup', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const mock = (window as TestWindow).__desktopMock;
    mock.formatCapabilities = {
      pandoc: { status: 'missing', path: null, version: null, message: '' },
      formats: [],
      importExtensions: [],
      image: true,
      pdf: 'dialog',
      headerFooter: false,
    };
    mock.exportPreferences.pdf = { paper: 'A4', landscape: true };
  });
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-pdf'));
  await expect(page.locator('.notice-host')).toContainText('系统打印面板');
  const call = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((c) => c.command === 'open_print_preview')
      .at(-1),
  );
  expect(call?.args.options).toEqual({ paperSize: 'A4', landscape: true });
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_pdf'),
    ),
  ).toEqual([]);
});

test('a custom export is routed by id, resolved against the writers Pandoc offers', async ({
  page,
}) => {
  const id = '0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11';
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate(
    ({ id, pandoc }) => {
      const mock = (window as TestWindow).__desktopMock;
      mock.formatCapabilities = {
        pandoc,
        formats: ['docx'],
        writers: ['docx', 'asciidoc'],
        importExtensions: [],
        image: true,
        pdf: 'direct',
        headerFooter: true,
      };
      mock.exportPreferences.custom = [
        { id, name: 'AsciiDoc', writer: 'asciidoc', extension: 'adoc', options: {} },
      ];
    },
    { id, pandoc },
  );
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText('Alpha');
  await page.evaluate((id) => (window as TestWindow).__desktopMock.emitMenu(`export-custom:${id}`), id);
  await expect(page.locator('.notice-host')).toContainText('已导出 AsciiDoc', { timeout: 20000 });
  const call = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((c) => c.command === 'save_export_format')
      .at(-1),
  );
  expect(call?.args.target).toBe(`custom:${id}`);
  // A writer the installed Pandoc lacks is refused before anything is converted.
  await page.evaluate((id) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.calls.length = 0;
    mock.formatCapabilities = { ...mock.formatCapabilities, writers: ['docx'] } as never;
    mock.emitMenu(`export-custom:${id}`);
  }, id);
  await expect(page.locator('.notice-host')).toContainText('当前Pandoc未提供所选格式');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'save_export_format'),
    ),
  ).toEqual([]);
});

test('warnings from a written file get their own notice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeEnabled();
  await page.evaluate((pandoc) => {
    const mock = (window as TestWindow).__desktopMock;
    mock.formatCapabilities = {
      pandoc,
      formats: ['docx'],
      writers: ['docx'],
      importExtensions: [],
      image: true,
      pdf: 'direct',
      headerFooter: true,
    };
    mock.exportWarnings = ['Could not fetch resource https://example.invalid/a.png'];
  }, pandoc);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.frameLocator('.marklyra-editor-frame').locator('#write')).toContainText('Alpha');
  await page.evaluate(() => (window as TestWindow).__desktopMock.emitMenu('export-docx'));
  await expect(page.locator('.notice-host')).toContainText('已导出 Word');
  await expect(page.locator('.notice-host')).toContainText('导出时的提示');
  await expect(page.locator('.notice-host')).toContainText('Could not fetch resource');
});
