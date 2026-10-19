import { expect, type Page, type TestInfo } from '@playwright/test';
import { installMock, type TestWindow } from './desktop.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

export const layoutThemes = ['marklyra-light', 'marklyra-dark'] as const;
export const layoutSizes = [
  { width: 960, height: 720 },
  { width: 1280, height: 900 },
  { width: 1484, height: 1021 },
] as const;
export const layoutSource =
  '\uFEFF# Layout Reference\r\n\r\nAlpha **Bravo** 中文 😀\n\n## Second\r\n\r\nTail  \r\n';

/** Only filesystem/menu IPC is doubled. The Shell, iframe, original private
 * runtime and SDK use their actual browser code; this is not Native evidence. */
function installLayoutMock() {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  Reflect.set(window, '__marklyraLayoutFullscreen', false);
  const documents: Record<string, string> = {
    'Layout.md':
      '\uFEFF# Layout Reference\r\n\r\nAlpha **Bravo** 中文 😀\n\n## Second\r\n\r\nTail  \r\n',
    'Notes/Other.md': '# Other\n\nOther document',
  };
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'open_recent_file') {
      host.__desktopMock.calls.push({ command, args });
      return host.__desktopMock.nextDocument;
    }
    if (command === 'plugin:window|is_fullscreen') {
      await previous(command, args);
      return Reflect.get(window, '__marklyraLayoutFullscreen') === true;
    }
    if (command === 'select_workspace')
      return {
        id: 'layout-workspace',
        name: Reflect.get(window, '__marklyraLayoutWorkspaceName') ?? 'Layout Fixtures',
        path: '/mock/layout',
      };
    if (command === 'close_workspace') return null;
    if (command === 'list_directory') {
      return {
        entries: args.relativePath
          ? [{ name: 'Other.md', relativePath: 'Notes/Other.md', kind: 'file', size: 23 }]
          : [
              { name: 'Notes', relativePath: 'Notes', kind: 'directory', size: null },
              { name: 'Layout.md', relativePath: 'Layout.md', kind: 'file', size: 100 },
            ],
        truncated: false,
        skipped: 0,
      };
    }
    if (command === 'list_workspace_documents')
      return {
        entries: Object.entries(documents).map(([relativePath, summary], index) => ({
          name: relativePath.split('/').at(-1),
          relativePath,
          folderName: relativePath.includes('/') ? 'Notes' : 'Layout Fixtures',
          folderRelativePath: relativePath.includes('/') ? 'Notes' : '',
          summary,
          summaryTruncated: false,
          size: summary.length,
          createdAt: 1_700_000_000_000 + index,
          modifiedAt: 1_700_000_000_000 + index,
        })),
        scannedFiles: 2,
        scannedEntries: 3,
        readBytes: 123,
        truncated: false,
        truncationReasons: [],
        skipped: {
          symlinks: 0,
          unsupportedNames: 0,
          unreadable: 0,
          unsupportedEncoding: 0,
          ignored: 0,
        },
      };
    if (command === 'search_workspace')
      return {
        matches: [
          {
            relativePath: 'Layout.md',
            line: 3,
            column: 1,
            matchLength: 5,
            preview: 'Alpha **Bravo** 中文 😀',
          },
        ],
        scannedFiles: 2,
        truncated: false,
        skipped: { nonUtf8: 0, tooLarge: 0, unreadable: 0, symlinks: 0, unsupportedNames: 0 },
      };
    if (command === 'open_workspace_document') {
      const relativePath = String(args.relativePath);
      const result = {
        id: `layout-${relativePath}`,
        path: `/mock/layout/${relativePath}`,
        text: documents[relativePath] ?? '',
        encoding: 'UTF-8',
      };
      host.__desktopMock.nextDocument = result;
      return result;
    }
    return previous(command, args);
  };
}

export async function installLayout(
  page: Page,
  workspaceName?: string,
  titlebar: 'appkit' | 'web' = 'appkit',
) {
  await page.addInitScript(installMock, { nativeChrome: true, titlebar });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installLayoutMock);
  if (workspaceName)
    await page.addInitScript((name) => {
      if (window === window.top) Reflect.set(window, '__marklyraLayoutWorkspaceName', name);
    }, workspaceName);
}

export async function emitLayoutMenu(page: Page, action: string) {
  await page.evaluate((value) => (window as TestWindow).__desktopMock.emitMenu(value), action);
}

export async function readyLayout(page: Page, theme: string) {
  await page.goto('/');
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.shell')).toHaveAttribute('data-native-chrome', 'true');
  await emitLayoutMenu(page, `theme:${theme}`);
  await expect(page.locator('.shell')).toHaveAttribute('data-theme-name', theme);
  await expect(page.locator('[data-theme-loading]')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .frameLocator('.runtime-area .marklyra-editor-frame')
        .locator('#theme_css')
        .evaluate((element) => {
          if (!(element instanceof HTMLLinkElement)) throw Error('Missing original theme link');
          return new URL(element.href).pathname;
        }),
    )
    .toBe(`/style/themes/${theme}.css`);
  expect(
    await page
      .frameLocator('.runtime-area .marklyra-editor-frame')
      .locator('#theme_css')
      .evaluate((element) => (element as HTMLLinkElement).sheet?.cssRules.length ?? 0),
  ).toBeGreaterThan(0);
}

export async function openLayoutDocument(page: Page, source = layoutSource) {
  await page.evaluate((text) => {
    (window as TestWindow).__desktopMock.nextDocument = {
      id: 'layout-current',
      path: '/mock/layout/Layout.md',
      text,
      encoding: 'UTF-8',
    };
  }, source);
  await emitLayoutMenu(page, 'recent-open:00000000-0000-4000-8000-000000000001');
  await expect(
    page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write > h1'),
  ).toHaveText(
    source
      .replace(/^\uFEFF/, '')
      .split(/\r\n|\r|\n/)[0]
      ?.replace(/^# /, '') ?? '',
  );
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
}

export async function layoutHistory(page: Page) {
  return page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#write')
    .evaluate(() => {
      const editor = Reflect.get(window, 'editor') as {
        undo: { commandStack: unknown; index: number };
      };
      return JSON.stringify([editor.undo.commandStack, editor.undo.index]);
    });
}

export async function layoutSelection(page: Page) {
  return page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#write')
    .evaluate((write) => {
      const selection = getSelection();
      const path = (node: Node | null) => {
        const result: number[] = [];
        for (let current = node; current && current !== write; current = current.parentNode) {
          if (!current.parentNode) return null;
          result.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
        }
        return result;
      };
      return {
        anchor: path(selection?.anchorNode ?? null),
        anchorOffset: selection?.anchorOffset,
        focus: path(selection?.focusNode ?? null),
        focusOffset: selection?.focusOffset,
        text: selection?.toString(),
        collapsed: selection?.isCollapsed,
        active: document.activeElement?.id,
      };
    });
}

export async function layoutCaret(page: Page) {
  await page
    .frameLocator('.runtime-area .marklyra-editor-frame')
    .locator('#write > p')
    .last()
    .evaluate((paragraph) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text) throw Error('Missing actual MarkLyra tail text');
      paragraph.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(text, 4, text, 4);
    });
}

export async function layoutSaved(page: Page) {
  return page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'save_document')
        .at(-1)?.args.text,
  );
}

export async function saveLayoutSource(
  page: Page,
  testInfo: TestInfo,
  label: string,
  expected: string,
) {
  await emitLayoutMenu(page, 'save');
  await expect.poll(() => layoutSaved(page)).toBe(expected);
  await expect(page.locator('main.document-area')).toHaveAttribute('aria-busy', 'false');
  await testInfo.attach(`${label}-source`, {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        verification: 'mock-ipc-markdown-string-not-filesystem-bytes',
        expected,
        actual: await layoutSaved(page),
        selection: await layoutSelection(page),
        history: await layoutHistory(page),
      },
      null,
      2,
    ),
  });
}

export async function captureLayout(page: Page, testInfo: TestInfo, label: string) {
  const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
  const motion = await frame.locator('#write').evaluate(async () => {
    const query = Reflect.get(window, '$') as (selector: string) => {
      queue(name: string): unknown[];
      promise(name: string): { done(callback: () => void): unknown };
    };
    const targets = query('body,content,#write');
    const queued = targets.queue('fx').length;
    await new Promise<void>((resolve) => targets.promise('fx').done(resolve));
    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.allSettled(animations.map((animation) => animation.finished));
    return {
      originalFXQueued: queued,
      remaining: targets.queue('fx').length,
      finiteAnimations: animations.length,
    };
  });
  await page.evaluate(async () => {
    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === 'running' &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.allSettled(animations.map((animation) => animation.finished));
  });
  const fonts = await frame.locator('#write').evaluate(async (write) => {
    const visible = [write, ...write.querySelectorAll('*')].filter((element) => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.width > 0 && rectangle.height > 0;
    });
    const used = new Map<string, string>();
    for (const element of visible) {
      const style = getComputedStyle(element);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      used.set(
        font,
        `${used.get(font) ?? ''}${element.textContent?.slice(0, 100) || 'Layout'}`.slice(0, 1024),
      );
    }
    const deadline = async <T>(promise: Promise<T>, timeout: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        promise.then((value) => ({ ready: true as const, value })),
        new Promise<{ ready: false }>((resolve) => {
          timer = setTimeout(() => resolve({ ready: false }), timeout);
        }),
      ]);
      clearTimeout(timer);
      return result;
    };
    const loaded = await Promise.all(
      [...used].map(async ([font, text]) => {
        const result = await deadline(document.fonts.load(font, text), 2_000);
        return {
          font,
          sample: text,
          completed: result.ready,
          check: document.fonts.check(font, text),
          faces: result.ready
            ? result.value.map((face) => ({ family: face.family, status: face.status }))
            : [],
        };
      }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const global = await deadline(document.fonts.ready, 500);
    return {
      globalReady: global.ready,
      globalStatus: document.fonts.status,
      used: loaded,
      all: Array.from(document.fonts).map((face) => ({
        family: face.family,
        weight: face.weight,
        style: face.style,
        status: face.status,
      })),
    };
  });
  const shell = await page.evaluate(() => {
    const sample = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return {
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        padding: style.padding,
        border: style.border,
        borderBottom: style.borderBottom,
        borderBottomWidth: style.borderBottomWidth,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomColor: style.borderBottomColor,
        boxSizing: style.boxSizing,
        background: style.backgroundColor,
        color: style.color,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      userAgent: navigator.userAgent,
      theme: document.querySelector('.shell')?.getAttribute('data-theme-name'),
      sidebarMode: document.querySelector('.marklyra-sidebar-header')?.getAttribute('data-mode'),
      projectedHeaderBorder: getComputedStyle(
        document.querySelector('.shell') ?? document.body,
      ).getPropertyValue('--marklyra-sidebar-header-border'),
      active: document.activeElement?.outerHTML.slice(0, 300),
      shell: sample('.shell'),
      sidebar: sample('aside.sidebar'),
      header: sample('.marklyra-sidebar-header'),
      search: sample('.sidebar-search-controls'),
      footer: sample('.workspace-footer'),
      editor: sample('.runtime-area .marklyra-editor-frame'),
      menu: sample('[role="menu"]'),
      modal: sample('[role="dialog"]'),
      documentWidth: document.documentElement.scrollWidth,
      fonts: Array.from(document.fonts).map((font) => ({
        family: font.family,
        weight: font.weight,
        style: font.style,
        status: font.status,
      })),
      chrome: (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'update_editor_chrome')
        .at(-1)?.args.payload,
    };
  });
  const editor = await frame.locator('#write').evaluate(async (write) => {
    const sample = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element),
        rectangle = element.getBoundingClientRect();
      return {
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        padding: style.padding,
        maxWidth: style.maxWidth,
        background: style.backgroundColor,
        color: style.color,
      };
    };
    const theme = document.querySelector<HTMLLinkElement>('#theme_css');
    const bytes = theme ? await fetch(theme.href).then((response) => response.arrayBuffer()) : null;
    const sha256 = bytes
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
      : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      content: sample(document.querySelector('content')),
      body: sample(document.body),
      write: sample(write),
      first: sample(write.firstElementChild),
      dom: write.innerHTML,
      theme: { href: theme?.href, rules: theme?.sheet?.cssRules.length, sha256 },
      fonts: Array.from(document.fonts).map((font) => ({
        family: font.family,
        weight: font.weight,
        style: font.style,
        status: font.status,
      })),
    };
  });
  const evidence = {
    verification: 'browser-real-sdk-mock-ipc',
    label,
    shell,
    editor,
    motion,
    fontReadiness: fonts,
    selection: await layoutSelection(page),
    history: await layoutHistory(page),
    savedSource: await layoutSaved(page),
  };
  await testInfo.attach(`${label}-geometry`, {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath(`${label}.png`) });
  expect(fonts.used.every((font) => font.completed && font.check)).toBe(true);
  expect(shell.documentWidth).toBeLessThanOrEqual(shell.viewport.width);
  expect(shell.editor?.width).toBe(shell.viewport.width);
  expect(editor.viewport.width).toBe(shell.viewport.width);
  const borderedHeader = ['newsprint', 'pixyll', 'whitey'].includes(shell.theme ?? '');
  expect(shell.header?.height).toBe(shell.sidebarMode === 'search' || !borderedHeader ? 40 : 41);
  if (!label.includes('long-document')) expect(editor.write?.height).toBe(editor.content?.height);
  return evidence;
}
