import { expect, type Page, test } from '@playwright/test';
import {
  installMock,
  type MockExportPreferences,
  type MockFormatCapabilities,
  type TestWindow,
} from './desktop.helpers.js';
import { emitLayoutMenu, installLayout, readyLayout } from './layout.helpers.js';

const nine = ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml'];
const ID = '0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11';
const available: MockFormatCapabilities = {
  pandoc: {
    status: 'available',
    path: 'C:\\Program Files\\Pandoc\\pandoc.exe',
    version: '3.9',
    message: '',
  },
  formats: nine,
  writers: ['asciidoc', 'docx', 'gfm', 'markdown', 'pptx', 'html5', 'latex'],
  importExtensions: [],
  image: true,
  pdf: 'direct',
  headerFooter: true,
};
const mac: MockFormatCapabilities = { ...available, pdf: 'dialog', headerFooter: false };

interface Setup {
  capabilities?: MockFormatCapabilities;
  preferences?: MockExportPreferences;
  /** Commands that always fail, to model a host that cannot answer. */
  failing?: string[];
}

/** The settings window of the product, with only the host IPC replaced. */
async function open(page: Page, setup: Setup = {}) {
  await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
  await page.addInitScript((value: Setup) => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      };
    };
    if (value.capabilities) host.__desktopMock.formatCapabilities = value.capabilities;
    if (value.preferences && !localStorage.getItem('mock-export-preferences'))
      host.__desktopMock.exportPreferences = value.preferences;
    const previous = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (value.failing?.includes(command)) {
        host.__desktopMock.calls.push({ command, args: args ?? {} });
        return Promise.reject(new Error('宿主没有响应'));
      }
      return previous(command, args);
    };
  }, setup);
  await page.goto('/?view=preferences');
  const original = page.frameLocator('.runtime-preferences-frame');
  await original.locator('.nav-group-item[data-index="4"]').click();
  await expect(page.locator('.es')).toBeVisible();
  await expect(page.getByRole('tab', { name: '通用', exact: true })).toBeVisible();
}

/** The record the host holds; every group is present because the mock completes them. */
const stored = (page: Page) =>
  page.evaluate(() => (window as TestWindow).__desktopMock.exportPreferences) as Promise<
    Required<MockExportPreferences>
  >;
const calls = (page: Page, command: string) =>
  page.evaluate(
    (name) =>
      (window as TestWindow).__desktopMock.calls.filter((call) => call.command === name).length,
    command,
  );
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const select = async (page: Page, name: string) => {
  await tab(page, name).click();
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
};

test.describe('通用', () => {
  test('default folder comes only from the dialog; after-export switches persist across reloads', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    await expect(page.getByRole('radio', { name: '与原文件同一目录' })).toBeChecked();
    await page.getByRole('radio', { name: '指定文件夹' }).check();
    await expect(page.locator('.es-path', { hasText: '/mock/exports' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '指定文件夹' })).toBeChecked();
    await page.getByRole('switch', { name: '导出后打开所在位置' }).check();
    await page.getByRole('switch', { name: '导出后打开文件' }).check();
    await expect
      .poll(async () => (await stored(page)).general)
      .toEqual({
        folder: '/mock/exports',
        folderMode: 'custom',
        openLocation: true,
        openFile: true,
      });
    // Switching back keeps the chosen folder for later; clearing removes it.
    await page.getByRole('radio', { name: '与原文件同一目录' }).check();
    await expect.poll(async () => (await stored(page)).general.folderMode).toBe('document');
    expect((await stored(page)).general.folder).toBe('/mock/exports');
    await page.getByRole('radio', { name: '指定文件夹' }).check();
    await expect(page.locator('.es-path', { hasText: '/mock/exports' })).toBeVisible();
    await page.getByRole('button', { name: '清除指定文件夹' }).click();
    await expect.poll(async () => (await stored(page)).general.folder).toBeUndefined();
    await expect(page.locator('.es-folder')).toHaveCount(0);
    expect(await calls(page, 'choose_export_path')).toBe(1);
    await page.reload();
    await page
      .frameLocator('.runtime-preferences-frame')
      .locator('.nav-group-item[data-index="4"]')
      .click();
    await expect(page.getByRole('switch', { name: '导出后打开文件' })).toBeChecked();
    await expect(page.getByRole('switch', { name: '导出后打开所在位置' })).toBeChecked();
  });

  test('cancelling the folder dialog changes nothing', async ({ page }) => {
    await open(page, { capabilities: available });
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.chosenPath = null;
    });
    // The dialog answers "cancel", so the radio must not stay selected.
    await page.getByRole('radio', { name: '指定文件夹' }).click();
    await expect.poll(() => calls(page, 'choose_export_path')).toBe(1);
    await expect(page.getByRole('radio', { name: '与原文件同一目录' })).toBeChecked();
    expect((await stored(page)).revision).toBe(0);
  });

  test('Pandoc: ready, missing, unusable and unreachable are each shown', async ({ page }) => {
    await open(page, { capabilities: available });
    await expect(page.getByText('已就绪 · Pandoc 3.9')).toBeVisible();
    await expect(page.locator('.es-path', { hasText: 'Pandoc\\pandoc.exe' })).toBeVisible();
    await expect(page.getByText('自动检测到已安装的程序。')).toBeVisible();
    await expect(page.getByRole('button', { name: '恢复自动检测' })).toHaveCount(0);
    // A manually chosen program is stored through the dialog and can be given up again.
    await page.getByRole('button', { name: '选择程序…' }).click();
    await expect(page.getByRole('button', { name: '恢复自动检测' })).toBeVisible();
    expect((await stored(page)).pandocPath).toBe('/mock/pandoc');
    await page.getByRole('button', { name: '恢复自动检测' }).click();
    await expect.poll(async () => (await stored(page)).pandocPath).toBe('');
    expect(await calls(page, 'get_format_capabilities')).toBeGreaterThan(1);
  });

  test('a missing Pandoc explains the install path', async ({ page }) => {
    await open(page);
    await expect(page.getByText('未找到 Pandoc')).toBeVisible();
    await expect(page.getByRole('link', { name: '安装 Pandoc' })).toBeVisible();
    const before = await calls(page, 'get_format_capabilities');
    await page.getByRole('button', { name: '重新检测' }).click();
    await expect.poll(() => calls(page, 'get_format_capabilities')).toBe(before + 1);
  });

  test('an unusable Pandoc shows the host reason', async ({ page }) => {
    await open(page, {
      capabilities: {
        ...available,
        pandoc: {
          status: 'invalid',
          path: 'D:\\old\\pandoc.exe',
          version: null,
          message: 'Pandoc版本无效或低于原版>=2.0门槛',
        },
        formats: [],
      },
    });
    await expect(page.getByText('Pandoc 无法使用')).toBeVisible();
    await expect(page.getByText('Pandoc版本无效或低于原版>=2.0门槛')).toBeVisible();
  });

  test('an unreachable host is reported without hiding the settings', async ({ page }) => {
    await open(page, { failing: ['get_format_capabilities'] });
    await expect(page.getByText('无法检查 Pandoc：宿主没有响应')).toBeVisible();
    await expect(page.getByRole('switch', { name: '导出后打开文件' })).toBeVisible();
  });

  test('the Pandoc page links stay on the page when the host refuses to open them', async ({
    page,
  }) => {
    await open(page, { failing: ['open_external_link'] });
    await page.getByRole('link', { name: '安装 Pandoc' }).click();
    await expect(page.getByText('https://pandoc.org/installing.html')).toBeVisible();
  });
});

test.describe('PDF', () => {
  test('page geometry persists, previews live, and survives a reload', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    const figure = page.getByRole('figure', { name: '页面预览' });
    await expect(figure).toContainText('210 × 297 毫米 · 纵向');
    await page.getByRole('combobox', { name: '纸张大小' }).selectOption('A5');
    await expect(figure).toContainText('148 × 210 毫米');
    await page.getByRole('radio', { name: '横向' }).check();
    await expect(figure).toContainText('210 × 148 毫米 · 横向');
    await page.getByRole('combobox', { name: '纸张大小' }).selectOption('custom');
    await page.getByRole('spinbutton', { name: '纸张宽度' }).fill('200');
    await page.getByRole('spinbutton', { name: '纸张高度' }).fill('250');
    await page.getByRole('radio', { name: '自定义' }).check();
    for (const [name, value] of [
      ['上边距', '11'],
      ['下边距', '12'],
      ['左边距', '13'],
      ['右边距', '14.5'],
    ] as const)
      await page.getByRole('spinbutton', { name }).fill(value);
    await page.getByRole('combobox', { name: '导出主题' }).selectOption('marklyra-dark');
    await page.getByRole('switch', { name: '按一级标题分页' }).check();
    await page.getByRole('switch', { name: '生成书签' }).uncheck();
    await expect
      .poll(async () => (await stored(page)).pdf)
      .toEqual({
        paper: 'custom',
        landscape: true,
        'paper.custom': [200, 250],
        'paper.margin': 'custom',
        'paper.marginTop': 11,
        'paper.marginBottom': 12,
        'paper.marginLeft': 13,
        'paper.marginRight': 14.5,
        exportTheme: 'marklyra-dark',
        splitPages: true,
        bookmarks: false,
      });
    await expect(figure).toContainText('250 × 200 毫米 · 横向');
    await page.reload();
    await page
      .frameLocator('.runtime-preferences-frame')
      .locator('.nav-group-item[data-index="4"]')
      .click();
    await select(page, 'PDF');
    await expect(page.getByRole('combobox', { name: '纸张大小' })).toHaveValue('custom');
    await expect(page.getByRole('spinbutton', { name: '纸张宽度' })).toHaveValue('200');
    await expect(page.getByRole('spinbutton', { name: '右边距' })).toHaveValue('14.5');
    await expect(page.getByRole('switch', { name: '生成书签' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: '按一级标题分页' })).toBeChecked();
  });

  test('out-of-range numbers explain themselves and are never saved', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    await page.getByRole('combobox', { name: '纸张大小' }).selectOption('custom');
    await expect.poll(() => calls(page, 'put_export_preferences')).toBe(1);
    const width = page.getByRole('spinbutton', { name: '纸张宽度' });
    await width.fill('5');
    await expect(
      page.getByRole('alert').filter({ hasText: '请输入 10 到 2000 之间的数值' }),
    ).toBeVisible();
    await expect(width).toHaveAttribute('aria-invalid', 'true');
    await width.blur();
    await expect(width).toHaveValue('210');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await calls(page, 'put_export_preferences')).toBe(1);
  });

  test('header and footer: variables insert at the caret, preview resolves them, margins widen', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    const center = page.getByRole('textbox', { name: '页眉 · 中' });
    await center.click();
    await center.fill('第  页');
    await center.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 2));
    await page.getByRole('button', { name: '页码' }).click();
    await expect(center).toHaveValue('第 ${pageNo} 页');
    await page.getByRole('textbox', { name: '页脚 · 右' }).fill('${title} · ${totalPages}');
    await page.getByRole('textbox', { name: '作者' }).fill('李雅');
    await expect
      .poll(async () => (await stored(page)).pdf)
      .toEqual({
        header: '第 ${pageNo} 页',
        footerRight: '${title} · ${totalPages}',
        author: '李雅',
      });
    const preview = page.getByRole('figure', { name: '页面预览' });
    await expect(preview.locator('.es-page-band-top')).toContainText('第 1 页');
    await expect(preview.locator('.es-page-band-bottom')).toContainText('示例文稿 · 8');
    // Clearing a field removes it from the stored record.
    await center.fill('');
    await expect.poll(async () => (await stored(page)).pdf.header).toBeUndefined();
    await expect(preview.locator('.es-page-band-top')).toHaveCount(0);
  });

  test('a host without header/footer support shows only what it applies', async ({ page }) => {
    await open(page, { capabilities: mac });
    await select(page, 'PDF');
    await expect(page.getByText('macOS 通过系统打印面板导出 PDF')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '页眉 · 中' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: '生成书签' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: '打印背景色' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '作者' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '纸张大小' })).toContainText('跟随系统');
    await expect(page.getByRole('radio', { name: '横向' })).toBeVisible();
    await expect(page.getByRole('switch', { name: '按一级标题分页' })).toBeVisible();
  });

  test('custom CSS is saved while acceptable and refused with a reason otherwise', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    await page.getByText('自定义样式', { exact: true }).click();
    const css = page.getByRole('textbox', { name: '自定义样式' });
    await css.fill('#write { max-width: 860px; }');
    await expect
      .poll(async () => (await stored(page)).pdf.extraCss)
      .toBe('#write { max-width: 860px; }');
    await css.fill('</style><script>alert(1)</script>');
    await expect(page.getByRole('alert').filter({ hasText: '未保存：不能包含 <' })).toBeVisible();
    await page.waitForTimeout(900);
    expect((await stored(page)).pdf.extraCss).toBe('#write { max-width: 860px; }');
    await css.fill('');
    await expect.poll(async () => (await stored(page)).pdf.extraCss).toBeUndefined();
  });
});

test.describe('HTML 与图像', () => {
  test('HTML keeps its own theme and style', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'HTML');
    await page.getByRole('combobox', { name: '导出主题' }).selectOption('marklyra-light');
    await page.getByText('自定义样式', { exact: true }).click();
    await page.getByRole('textbox', { name: '自定义样式' }).fill('h1{color:#c00}');
    await expect
      .poll(async () => (await stored(page)).html)
      .toEqual({ exportTheme: 'marklyra-light', extraCss: 'h1{color:#c00}' });
    expect((await stored(page)).pdf).toEqual({});
  });

  test('HTML without styles has no controls to fake', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'HTML（无样式）');
    await expect(page.getByText('没有可调选项')).toBeVisible();
    await expect(page.locator('.es-panel input, .es-panel select, .es-panel textarea')).toHaveCount(
      0,
    );
  });

  test('image size, quality and font follow the host limits', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, '图像');
    await expect(page.getByText('输出宽度 640 像素。')).toBeVisible();
    await page.getByRole('spinbutton', { name: '图片宽度' }).fill('800');
    await page.getByRole('combobox', { name: '图片质量' }).selectOption('2');
    await expect(page.getByText('输出宽度 1600 像素。')).toBeVisible();
    await expect(page.getByText('32,768')).toBeVisible();
    await page.getByRole('spinbutton', { name: '自定义字号' }).fill('18');
    await expect
      .poll(async () => (await stored(page)).image)
      .toEqual({ imageWidth: 800, quality: 2, imageFontSize: 18 });
    await page.getByRole('radio', { name: '使用主题字号' }).check();
    await expect(page.getByRole('spinbutton', { name: '自定义字号' })).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).image.useThemeFontSize).toBe(1);
    await page.getByRole('spinbutton', { name: '图片宽度' }).fill('5000');
    await expect(page.getByRole('alert').filter({ hasText: '4096' })).toBeVisible();
  });

  test('a host without image export says so instead of showing controls', async ({ page }) => {
    await open(page, { capabilities: { ...available, image: false } });
    await select(page, '图像');
    await expect(page.getByText('当前平台暂不支持导出图像')).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: '图片宽度' })).toHaveCount(0);
  });
});

test.describe('Pandoc 格式', () => {
  test('contents, numbering, reference document and arguments are saved per format', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    await select(page, 'Word (.docx)');
    await expect(page.getByRole('combobox', { name: '目录层级' })).toBeDisabled();
    await page.getByRole('switch', { name: '生成目录' }).check();
    await expect(page.getByRole('combobox', { name: '目录层级' })).toBeEnabled();
    await page.getByRole('combobox', { name: '目录层级' }).selectOption('2');
    await page.getByRole('switch', { name: '章节编号' }).check();
    await page.getByRole('button', { name: '选择…' }).click();
    await expect(page.locator('.es-path', { hasText: 'ref.docx' })).toBeVisible();
    await page.getByRole('textbox', { name: '额外参数' }).fill('-V lang:zh-CN --toc-depth 2');
    await expect(
      page.getByText('已通过检查 · 将传给 Pandoc：--variable=lang:zh-CN --toc-depth=2'),
    ).toBeVisible();
    await expect
      .poll(async () => (await stored(page)).formats.docx)
      .toEqual({
        toc: true,
        tocDepth: 2,
        numberSections: true,
        referenceDoc: '/mock/ref.docx',
        extraArguments: '-V lang:zh-CN --toc-depth 2',
      });
    await expect(page.getByText('模板文件')).toHaveCount(0);
    // Another format is independent.
    await select(page, 'LaTeX');
    await expect(page.getByRole('switch', { name: '生成目录' })).not.toBeChecked();
    await expect(page.getByText('参考文档')).toHaveCount(0);
    await page.getByRole('button', { name: '选择…' }).click();
    await expect(page.locator('.es-path', { hasText: 'template.tex' })).toBeVisible();
    expect((await stored(page)).formats.latex).toEqual({ template: '/mock/template.tex' });
    await page.getByRole('button', { name: '清除模板文件' }).click();
    await expect.poll(async () => (await stored(page)).formats.latex).toEqual({});
    // The reference document of Word stayed put while other edits were saved.
    await select(page, 'Word (.docx)');
    await page.getByRole('button', { name: '清除参考文档' }).click();
    await expect.poll(async () => (await stored(page)).formats.docx?.referenceDoc).toBeUndefined();
    expect((await stored(page)).formats.docx?.toc).toBe(true);
  });

  test('arguments the host refuses are explained and not saved', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'EPUB');
    const field = page.getByRole('textbox', { name: '额外参数' });
    for (const text of ['--lua-filter=x.lua', '-o out.epub', '--toc-depth=9', 'toc']) {
      await field.fill(text);
      await expect(page.getByRole('alert').filter({ hasText: '未保存：' })).toBeVisible();
    }
    await page.waitForTimeout(700);
    expect((await stored(page)).formats.epub).toBeUndefined();
    await field.fill('');
    await page.getByRole('button', { name: '--number-sections' }).click();
    await expect(field).toHaveValue('--number-sections');
    await expect
      .poll(async () => (await stored(page)).formats.epub)
      .toEqual({
        extraArguments: '--number-sections',
      });
    await field.fill('');
    await expect.poll(async () => (await stored(page)).formats.epub).toEqual({});
  });

  test('a format Pandoc cannot write is flagged, and a missing Pandoc leads to 通用', async ({
    page,
  }) => {
    await open(page, {
      capabilities: { ...available, formats: nine.filter((name) => name !== 'opml') },
    });
    await select(page, 'OPML');
    await expect(page.getByText('当前 Pandoc 没有提供这个输出格式')).toBeVisible();
    await select(page, 'RTF');
    await expect(page.getByText('当前 Pandoc 没有提供这个输出格式')).toHaveCount(0);
  });

  test('without Pandoc every converted format offers the way out', async ({ page }) => {
    await open(page);
    await select(page, 'Media Wiki');
    await expect(page.getByText('尚未安装 Pandoc')).toBeVisible();
    await page.getByRole('button', { name: '前往通用' }).click();
    await expect(page.getByRole('tab', { name: '通用', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('未找到 Pandoc')).toBeVisible();
  });
});

test.describe('自定义导出', () => {
  test('create, edit, order and delete', async ({ page }) => {
    await open(page, { capabilities: available });
    await tab(page, '+ 自定义导出').click();
    await page.getByRole('button', { name: '创建' }).click();
    await expect(page.getByText('请输入名称')).toBeVisible();
    await expect(page.getByText('请选择或输入 Pandoc 输出格式')).toBeVisible();
    await page.getByRole('textbox', { name: '名称' }).fill('AsciiDoc');
    await page.getByRole('combobox', { name: '输出格式' }).fill('pdf');
    await expect(page.getByText('此输出格式需要外部引擎')).toBeVisible();
    await page.getByRole('combobox', { name: '输出格式' }).fill('asciidoc');
    await expect(page.getByRole('textbox', { name: '文件扩展名' })).toHaveValue('adoc');
    await page.getByRole('button', { name: '创建' }).click();
    await expect(tab(page, 'AsciiDoc')).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => (await stored(page)).custom)
      .toEqual([
        expect.objectContaining({
          name: 'AsciiDoc',
          writer: 'asciidoc',
          extension: 'adoc',
          options: {},
        }),
      ]);
    // A second one, so ordering has something to do.
    await tab(page, '+ 自定义导出').click();
    await page.getByRole('textbox', { name: '名称' }).fill('幻灯片');
    await page.getByRole('combobox', { name: '输出格式' }).fill('pptx');
    await page.getByRole('textbox', { name: '文件扩展名' }).fill('pptx');
    await page.getByRole('button', { name: '创建' }).click();
    await expect(tab(page, '幻灯片')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '下移' })).toBeDisabled();
    await page.getByRole('button', { name: '上移' }).click();
    await expect
      .poll(async () => (await stored(page)).custom.map((item) => item.name))
      .toEqual(['幻灯片', 'AsciiDoc']);
    const names = await page.getByRole('tab').allTextContents();
    expect(names.indexOf('幻灯片')).toBeLessThan(names.indexOf('AsciiDoc'));
    // Editing: bad values are explained and never saved.
    await page.getByRole('textbox', { name: '文件扩展名' }).fill('exe');
    await expect(page.getByText('不能使用可执行文件或脚本的扩展名')).toBeVisible();
    await page.getByRole('textbox', { name: '名称' }).fill('课件');
    await expect.poll(async () => (await stored(page)).custom[0]?.name).toBe('课件');
    expect((await stored(page)).custom[0]?.extension).toBe('pptx');
    // Options behave like a built-in format's, including the reference document dialog.
    await page.getByRole('switch', { name: '生成目录' }).check();
    await page.getByRole('combobox', { name: '输出格式' }).fill('docx');
    await page.getByRole('button', { name: '选择…' }).click();
    await expect(page.locator('.es-path', { hasText: 'ref.docx' })).toBeVisible();
    // Delete asks first and selects the neighbour.
    await page.getByRole('button', { name: '删除此自定义导出…' }).click();
    await expect(page.getByText('删除“课件”？')).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    await expect.poll(async () => (await stored(page)).custom.length).toBe(2);
    await page.getByRole('button', { name: '删除此自定义导出…' }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await expect
      .poll(async () => (await stored(page)).custom.map((item) => item.name))
      .toEqual(['AsciiDoc']);
    await expect(tab(page, 'AsciiDoc')).toHaveAttribute('aria-selected', 'true');
  });

  test('the list is capped at twelve', async ({ page }) => {
    const custom = Array.from({ length: 12 }, (_, index) => ({
      id: `0b1f6c1e-6a4e-4f0a-9d53-${String(index).padStart(12, '0')}`,
      name: `导出 ${index + 1}`,
      writer: 'gfm',
      extension: 'md',
      options: {},
    }));
    await open(page, {
      capabilities: available,
      preferences: {
        schemaVersion: 1,
        revision: 4,
        html: {},
        pdf: {},
        custom,
      },
    });
    await tab(page, '+ 自定义导出').click();
    await expect(page.getByText('最多创建 12 项自定义导出。')).toBeVisible();
    await expect(page.getByRole('button', { name: '创建' })).toBeDisabled();
  });

  test('a custom export removed in another window falls back to the overview', async ({ page }) => {
    await open(page, {
      capabilities: available,
      preferences: {
        schemaVersion: 1,
        revision: 1,
        html: {},
        pdf: {},
        custom: [{ id: ID, name: '远程项', writer: 'gfm', extension: 'md', options: {} }],
      },
    });
    await tab(page, '远程项').click();
    await expect(page.getByRole('textbox', { name: '名称' })).toHaveValue('远程项');
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.emitEvent('export-preferences-changed', {
        schemaVersion: 1,
        revision: 2,
        general: {},
        html: {},
        pdf: {},
        image: {},
        formats: {},
        custom: [],
        pandocPath: '',
      });
    });
    await expect(tab(page, '通用')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, '远程项')).toHaveCount(0);
  });
});

test.describe('保存的可靠性', () => {
  test('a version conflict keeps the edit visible, then retry or discard resolves it', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    const open_ = page.getByRole('switch', { name: '导出后打开文件' });
    await open_.check();
    await expect(page.getByText('已保存')).toBeVisible();
    await page.evaluate(() => {
      const mock = (window as TestWindow).__desktopMock;
      localStorage.setItem(
        'mock-export-preferences',
        JSON.stringify({
          ...mock.exportPreferences,
          revision: mock.exportPreferences.revision + 5,
        }),
      );
    });
    const location = page.getByRole('switch', { name: '导出后打开所在位置' });
    await location.check();
    await expect(page.getByRole('alert').filter({ hasText: '已由其它窗口修改' })).toBeVisible();
    await expect(location).toBeChecked();
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(async () => (await stored(page)).general.openLocation).toBe(true);
    expect((await stored(page)).general.openFile).toBe(true);
    // Discarding shows the saved record again.
    await page.evaluate(() => {
      const mock = (window as TestWindow).__desktopMock;
      localStorage.setItem(
        'mock-export-preferences',
        JSON.stringify({
          ...mock.exportPreferences,
          revision: mock.exportPreferences.revision + 3,
        }),
      );
    });
    await open_.uncheck();
    await expect(page.getByRole('alert').filter({ hasText: '已由其它窗口修改' })).toBeVisible();
    await page.getByRole('button', { name: '放弃修改' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(open_).toBeChecked();
  });

  test('a failing host never loses the typed value and is retried on request', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.exportPutError = '磁盘已满';
    });
    await page.getByRole('switch', { name: '按一级标题分页' }).check();
    await expect(page.getByRole('alert').filter({ hasText: '未保存：磁盘已满' })).toBeVisible();
    await expect(page.getByRole('switch', { name: '按一级标题分页' })).toBeChecked();
    expect((await stored(page)).pdf.splitPages).toBeUndefined();
    await page.getByRole('button', { name: '重试' }).click();
    await expect.poll(async () => (await stored(page)).pdf.splitPages).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('edits made while a save is in flight arrive in order, once each', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    await page.getByRole('switch', { name: '按一级标题分页' }).check();
    await page.getByRole('radio', { name: '横向' }).check();
    await page.getByRole('combobox', { name: '纸张大小' }).selectOption('A3');
    await expect
      .poll(async () => (await stored(page)).pdf)
      .toEqual({ splitPages: true, landscape: true, paper: 'A3' });
    expect(await calls(page, 'put_export_preferences')).toBe(3);
  });

  test('a change from another window shows up without a reload', async ({ page }) => {
    await open(page, { capabilities: available });
    await select(page, 'PDF');
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.emitEvent('export-preferences-changed', {
        schemaVersion: 1,
        revision: 9,
        general: {},
        html: {},
        pdf: { paper: 'Legal', landscape: true },
        image: {},
        formats: {},
        custom: [],
        pandocPath: '',
      });
    });
    await expect(page.getByRole('combobox', { name: '纸张大小' })).toHaveValue('Legal');
    await expect(page.getByRole('radio', { name: '横向' })).toBeChecked();
  });

  test('settings that cannot be read are reported with a retry', async ({ page }) => {
    await page.addInitScript(installMock, { label: 'preferences', nativeChrome: true });
    await page.addInitScript(() => {
      if (window === window.top) {
        (window as TestWindow).__desktopMock.exportPreferencesError = '导出偏好损坏';
      }
    });
    await page.goto('/?view=preferences');
    const original = page.frameLocator('.runtime-preferences-frame');
    await original.locator('.nav-group-item[data-index="4"]').click();
    await expect(
      page.getByRole('alert').filter({ hasText: '无法读取导出设置：导出偏好损坏' }),
    ).toBeVisible();
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.exportPreferencesError = null;
    });
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('switch', { name: '导出后打开文件' })).toBeVisible();
  });
});

test.describe('操作方式', () => {
  test('the format list is a keyboard-navigable tab list', async ({ page }) => {
    await open(page, { capabilities: available });
    const list = page.getByRole('tablist', { name: '导出格式' });
    await expect(list.getByRole('tab')).toHaveCount(15);
    await tab(page, '通用').focus();
    await page.keyboard.press('ArrowDown');
    await expect(tab(page, 'PDF')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'PDF')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, '+ 自定义导出')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(tab(page, '通用')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(tab(page, '+ 自定义导出')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'es-tab-general');
    // Only the selected tab is a Tab stop; the form follows it, and Space flips a switch.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: '与原文件同一目录' })).toBeFocused();
    await page.getByRole('switch', { name: '导出后打开文件' }).focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await stored(page)).general.openFile).toBe(true);
  });

  test('the page remembers the selected format for the next visit in this session', async ({
    page,
  }) => {
    await open(page, { capabilities: available });
    await select(page, 'EPUB');
    await page.reload();
    await page
      .frameLocator('.runtime-preferences-frame')
      .locator('.nav-group-item[data-index="4"]')
      .click();
    await expect(tab(page, 'EPUB')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('设置窗口中的导出页', () => {
  for (const theme of ['marklyra-light', 'marklyra-dark']) {
    test(`${theme}: replaces the original export panel and fits at every width`, async ({
      page,
    }, info) => {
      await installLayout(page);
      await readyLayout(page, theme);
      await emitLayoutMenu(page, 'preferences');
      const ui = page.frameLocator('.runtime-preferences-frame');
      await ui.getByRole('button', { name: '导出', exact: true }).click();
      await expect(page.locator('.es')).toBeVisible();
      // The isolated page keeps its heading but nothing of the original export controls shows.
      await expect(ui.locator('.export-config')).toBeHidden();
      await expect(ui.locator('.pane')).toHaveCSS('visibility', 'hidden');
      await expect(ui.getByRole('button', { name: '导出', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      for (const width of [1280, 960, 700]) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of ['通用', 'PDF', 'HTML', '图像', 'Word (.docx)', '+ 自定义导出']) {
          await tab(page, name).click();
          await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
          const overflow = await page
            .locator('.es-scroll')
            .evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(overflow, `${name} at ${width}`).toBeLessThanOrEqual(0);
        }
        await tab(page, 'PDF').click();
        await page.screenshot({ path: info.outputPath(`export-${theme}-${width}.png`) });
      }
      // Leaving for another category shows that category again.
      await ui.getByRole('button', { name: '文件', exact: true }).click();
      await expect(page.locator('.es')).toHaveCount(0);
      await expect(ui.locator('.pane')).toHaveCSS('visibility', 'visible');
      await ui.getByRole('button', { name: '导出', exact: true }).click();
      await expect(page.locator('.es')).toBeVisible();
    });
  }

  test('searching settings never brings back the original export controls', async ({ page }) => {
    await installLayout(page);
    await readyLayout(page, 'marklyra-light');
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.es')).toBeVisible();
    for (const query of ['Pandoc', '导出', 'PDF']) {
      await ui.getByLabel('搜索设置').fill(query);
      await expect(page.locator('.es')).toHaveCount(0);
      await expect(ui.locator('.export-config')).toBeHidden();
      await expect(ui.locator('.pane .content[data-index="4"]')).toBeHidden();
    }
  });

  test('the agent page still opens beside it without the export page', async ({ page }) => {
    await installLayout(page);
    await readyLayout(page, 'marklyra-light');
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    await ui.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.es')).toBeVisible();
    await ui.getByRole('button', { name: '智能体', exact: true }).click();
    await expect(page.locator('.es')).toHaveCount(0);
    await expect(page.locator('.preferences-native-overlay .ai-settings')).toBeVisible();
    await ui.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.preferences-native-overlay .es')).toBeVisible();
    await expect(page.locator('.ai-settings')).toHaveCount(0);
  });
});
