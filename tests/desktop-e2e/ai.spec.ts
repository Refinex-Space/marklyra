import { expect, type Locator, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

function mockAgents({
  installed = true,
  enabled = true,
  includeBrandIcons = false,
  imageSupport = true,
  embeddedSupport = true,
  failInstall = false,
} = {}) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  const profile = {
    id: 'test-codex',
    agentId: 'codex-acp',
    name: 'Codex',
    executable: '/test/codex',
    args: [],
    env: {},
    secretKeys: [] as string[],
    version: '2.1.1',
    managedPath: '/test/install',
    mcpEnabled: true,
    enabled,
  };
  const records = new Map<string, Record<string, unknown>>();
  let connection = 0;
  let attentionEnabled = true;
  const attachmentData = new Map<string, Record<string, unknown>>();
  host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
    if (!name.startsWith('agent_')) return previous(name, args);
    host.__desktopMock.calls.push({ command: name, args });
    if (name === 'agent_set_attention_enabled') {
      attentionEnabled = args.enabled === true;
      return null;
    }
    if (name === 'agent_catalog')
      return {
        attentionEnabled,
        agents: [
          {
            id: 'codex-acp',
            name: 'Codex',
            version: '2.1.1',
            description: 'ACP',
            license: 'Apache-2.0',
            license_url: 'https://example.com',
            distribution: { npx: { package: 'codex@2.1.1' } },
          },
          {
            id: 'opencode',
            name: 'OpenCode',
            version: '1.18.35',
            description: 'ACP',
            license: 'MIT',
            license_url: 'https://example.com',
            distribution: { npx: { package: 'opencode@1.18.35' } },
          },
          ...(includeBrandIcons
            ? [
                { id: 'github-copilot-cli', name: 'Copilot' },
                { id: 'grok-build', name: 'Grok Build' },
              ].map((agent) => ({
                ...agent,
                version: 'fixture',
                description: 'ACP',
                license: 'proprietary',
                distribution: { npx: { package: 'fixture' } },
              }))
            : []),
        ],
        profiles: installed ? [profile] : [],
        localAgents: [],
        digest: 'fixture',
        platform: 'darwin-aarch64',
        defaultProfileId: installed ? profile.id : null,
      };
    if (name === 'agent_install' && failInstall)
      throw new Error('智能体安装失败，请检查网络或运行时要求');
    if (name === 'agent_connect')
      return { connectionId: `connection-${++connection}`, mcpServers: [] };
    if (name === 'agent_context') return args.context;
    if (name === 'agent_store_attachments') {
      return Promise.all(
        (args.uploads as { name: string; mimeType: string; data: string }[]).map(async (upload) => {
          const bytes = Uint8Array.from(atob(upload.data), (char) => char.charCodeAt(0));
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
          const ref = {
            id: crypto.randomUUID(),
            name: upload.name,
            mimeType: upload.mimeType,
            size: bytes.length,
            digest,
          };
          attachmentData.set(`${args.recordId}:${ref.id}`, { ...ref, data: upload.data });
          return ref;
        }),
      );
    }
    if (name === 'agent_read_attachment')
      return attachmentData.get(`${args.recordId}:${args.attachmentId}`);
    if (name === 'agent_import_dropped_attachments')
      return Reflect.get(window, '__dropPayload') ?? { files: [] };
    if (name === 'agent_clipboard_attachments')
      return Reflect.get(window, '__clipboardPayload') ?? null;
    if (name === 'agent_history')
      return [...records.values()].map((r) => ({ ...r, messages: undefined }));
    if (name === 'agent_read_session') return records.get(String(args.id));
    if (name === 'agent_save_session') {
      const record = args.record as Record<string, unknown>;
      records.set(String(record.id), record);
      return null;
    }
    if (name === 'agent_manage_session') {
      const record = records.get(String(args.id));
      if (record) {
        if (args.action === 'delete') records.delete(String(args.id));
        else if (args.action === 'rename') record.title = args.title;
        else record.archived = args.action === 'archive';
      }
      return null;
    }
    if (name === 'agent_save_profile') {
      const keys = [...profile.secretKeys];
      Object.assign(profile, args.value);
      profile.secretKeys = keys;
      return profile;
    }
    if (name === 'agent_set_secret') {
      if (Reflect.get(window, '__credentialHold'))
        await new Promise<void>((resolve) =>
          Reflect.set(window, '__releaseCredentialOperation', resolve),
        );
      if (Reflect.get(window, '__credentialFailure')) throw Error('测试：系统凭据存储暂不可用');
      const key = String(args.name);
      if (args.value === null)
        profile.secretKeys = profile.secretKeys.filter((name) => name !== key);
      else if (!profile.secretKeys.includes(key)) profile.secretKeys.push(key);
      return null;
    }
    if (name === 'agent_send') {
      const message = args.message as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      const emit = (message: unknown) =>
        host.__desktopMock.emitEvent('marklyra:agent-event', {
          connectionId: args.connectionId,
          kind: 'message',
          message,
        });
      const result =
        message.method === 'initialize'
          ? {
              protocolVersion: 1,
              agentCapabilities: {
                loadSession: true,
                promptCapabilities: { image: imageSupport, embeddedContext: embeddedSupport },
              },
              authMethods: [],
            }
          : message.method === 'session/new'
            ? { sessionId: 'provider-session' }
            : {};
      setTimeout(() => {
        if (message.method === 'session/prompt') {
          emit({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'provider-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: {
                  type: 'text',
                  text: '已阅读 [其他文档](Notes/Other.md)，可以继续完善。',
                },
              },
            },
          });
          emit({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } });
        } else if (message.id) emit({ jsonrpc: '2.0', id: message.id, result });
      }, 20);
      return null;
    }
    return null;
  };
}

async function startConversation(page: Page, name = 'Codex') {
  await page.getByRole('button', { name: '新建 AI 会话' }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
async function manageFromSessionMenu(page: Page) {
  await page.getByRole('button', { name: '新建 AI 会话' }).click();
  await page.getByRole('menuitem', { name: '管理智能体…', exact: true }).click();
}

async function buttonAppearance(button: Locator) {
  return button.evaluate((element) => {
    const owner = element.closest('.ai-panel, .ai-settings');
    if (!owner) throw Error('Missing agent button container');
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Missing canvas context');
    context.fillStyle = getComputedStyle(owner).getPropertyValue('--ai-bg');
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const luminance = (channels: number[]) => {
      const [r = 0, g = 0, b = 0] = channels.map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const bg = luminance(background);
    const fg = luminance(foreground);
    return {
      background,
      foreground,
      opacity: style.opacity,
      contrast: (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05),
    };
  });
}

async function expectFilledButtonStates(page: Page, button: Locator, blue = false) {
  await page.mouse.move(1, 1);
  const normal = await buttonAppearance(button);
  await button.hover();
  const hover = await buttonAppearance(button);
  await page.mouse.down();
  const active = await buttonAppearance(button);
  // Release outside the button: inspect :active without installing, sending or approving.
  await page.mouse.move(1, 1);
  await page.mouse.up();
  for (const [state, appearance] of Object.entries({ normal, hover, active })) {
    expect(appearance.contrast, `${state} text/background contrast`).toBeGreaterThanOrEqual(4.5);
    if (blue)
      expect(
        (appearance.background[2] ?? 0) - (appearance.background[0] ?? 0),
        state,
      ).toBeGreaterThan(30);
  }
  expect(hover.background).not.toEqual(normal.background);
  expect(active.background).not.toEqual(hover.background);
}

for (const theme of ['marklyra-light', 'marklyra-dark'])
  test(`${theme}: AI context, mentions, links, history and settings`, async ({ page }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'view:ai');
    await expect(page.getByRole('complementary', { name: 'AI 助手侧栏' })).toBeVisible();
    await page.getByRole('button', { name: '打开文件夹', exact: true }).click();
    await startConversation(page);
    await expect(page.locator('.ai-workspace-name')).toHaveText('Layout Fixtures');
    await openLayoutDocument(page);
    await expect(page.getByRole('button', { name: '移除上下文 Layout.md' })).toBeVisible();
    await expect(page.locator('.ai-composer .ai-context')).toHaveCount(0);
    const contextBounds = await page.locator('.ai-composer-area > .ai-context').boundingBox();
    const composerBounds = await page.locator('.ai-composer').boundingBox();
    expect(contextBounds).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect((contextBounds?.y ?? 0) + (contextBounds?.height ?? 0)).toBeLessThan(
      composerBounds?.y ?? 0,
    );
    await page.getByRole('button', { name: '移除上下文 Layout.md' }).click();
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await input.fill('@Other');
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(input.locator('a[data-reference="Notes/Other.md"]')).toBeVisible();
    await expect(page.getByRole('button', { name: '移除上下文 Notes/Other.md' })).toHaveCount(0);
    await input.press('End');
    await page.keyboard.type(' 概括文档');
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    await expect(page.getByRole('log')).toContainText('已阅读');
    const contexts = await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'agent_context'),
    );
    expect(contexts.at(-1)?.args.context).toMatchObject({
      active: null,
      references: ['Notes/Other.md'],
    });
    await page.getByRole('log').getByRole('link', { name: '其他文档' }).click();
    await expect(
      page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write h1'),
    ).toHaveText('Other');
    await page.screenshot({ path: info.outputPath(`${theme}-ai-panel.png`) });
    await page.getByRole('button', { name: 'AI 历史会话' }).click();
    await expect(page.locator('.ai-history-open')).toContainText('概括文档');
    await page.getByRole('button', { name: '重命名', exact: true }).click();
    await page.getByLabel('会话名称').fill('文档讨论');
    await page.locator('.ai-confirm').getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.ai-history-open')).toContainText('文档讨论');
    await page.getByRole('button', { name: '归档', exact: true }).click();
    await page.getByRole('button', { name: '已归档', exact: true }).click();
    await expect(page.locator('.ai-history-open')).toContainText('文档讨论');
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.getByRole('button', { name: '会话', exact: true }).click();
    await expect(page.locator('.ai-history-open')).toContainText('文档讨论');
    await page.getByRole('button', { name: '归档', exact: true }).click();
    await page.getByRole('button', { name: '已归档', exact: true }).click();
    await page.getByRole('button', { name: '彻底移除', exact: true }).click();
    await page
      .getByRole('dialog', { name: '彻底移除会话' })
      .getByRole('button', { name: '彻底移除', exact: true })
      .click();
    await expect(page.locator('.ai-history-open')).toHaveCount(0);
    await page.getByRole('button', { name: '智能体设置', exact: true }).click();
    await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
    await expect(page.getByRole('switch', { name: '启用 Codex' })).toBeChecked();
    await page.getByRole('switch', { name: '启用 Codex' }).uncheck();
    await expect(page.getByRole('switch', { name: '启用 Codex' })).not.toBeChecked();
    await page.screenshot({ path: info.outputPath(`${theme}-ai-settings.png`) });
    const settings = page.frameLocator('.runtime-preferences-frame');
    await settings.getByRole('button', { name: '编辑器', exact: true }).click();
    await expect(page.getByRole('region', { name: '智能体设置' })).toHaveCount(0);
    await settings.getByRole('button', { name: '智能体', exact: true }).click();
    await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
  });

test('a blank untitled document is not offered as AI context', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expect(page.getByRole('textbox', { name: '发送给 AI 的消息' })).toBeVisible();
  await expect(page.getByRole('button', { name: '移除当前正文上下文' })).toHaveCount(0);
  await expect(page.locator('.ai-composer-area .ai-context')).toHaveCount(0);
});

test('standalone snapshot, narrow layout and IME do not send implicitly', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) =>
      name === 'agent_prepare_scope'
        ? { id: 'ai-drafts', name: 'AI 草稿', path: '/mock/ai-drafts' }
        : previous(name, args);
  });
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expect(page.locator('.ai-workspace-name')).toHaveText('AI 草稿');
  await expect(page.getByRole('button', { name: '移除当前正文上下文' })).toBeVisible();
  await expect(page.locator('.ai-composer .ai-context')).toHaveCount(0);
  await expect(page.locator('.ai-composer-area > .ai-context')).toBeVisible();
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.fill('解释当前内容');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
  });
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.some(
        (c) =>
          c.command === 'agent_send' &&
          (c.args?.message as { method?: string })?.method === 'session/prompt',
      ),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
  const contexts = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'agent_context'),
  );
  expect(contexts.at(-1)?.args.context).toMatchObject({
    references: [],
    snapshot: { documentId: 'layout-current', path: '/mock/layout/Layout.md' },
  });
  for (const width of [700, 960, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const panel = page.getByRole('complementary', { name: 'AI 助手侧栏' });
    await expect(panel).toBeVisible();
    await expect
      .poll(() =>
        panel.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return b.left >= 0 && b.right <= innerWidth + 1;
        }),
      )
      .toBe(true);
    await expect(input).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`ai-${width}.png`) });
  }
  await emitLayoutMenu(page, 'view:ai');
  await expect(page.getByRole('complementary', { name: 'AI 助手侧栏' })).toBeHidden();
  await expect(page.locator('.runtime-area .marklyra-editor-frame')).toBeFocused();
  await emitLayoutMenu(page, 'view:ai');
  await expect(page.getByRole('log')).toContainText('已阅读');
});

for (const theme of ['marklyra-light', 'marklyra-dark'])
  test(`${theme}: file write permission shows content and cancellation never executes it`, async ({
    page,
  }) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const host = window as TestWindow & {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previous = host.__TAURI_INTERNALS__.invoke;
      let pending: { id: number; connectionId: unknown } | null = null;
      host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
        const message = args.message as { id: number; method: string; params: unknown } | undefined;
        if (name === 'agent_send' && message?.method === 'session/prompt') {
          host.__desktopMock.calls.push({ command: name, args });
          pending = { id: message.id, connectionId: args.connectionId };
          setTimeout(
            () =>
              host.__desktopMock.emitEvent('marklyra:agent-event', {
                connectionId: args.connectionId,
                kind: 'message',
                message: {
                  jsonrpc: '2.0',
                  id: 'write',
                  method: 'fs/write_text_file',
                  params: {
                    sessionId: 'provider-session',
                    path: '/mock/layout/Layout.md',
                    content: '# Proposed change',
                  },
                },
              }),
            20,
          );
          return null;
        }
        if (name === 'agent_send' && message?.method === 'session/cancel') {
          setTimeout(
            () =>
              host.__desktopMock.emitEvent('marklyra:agent-event', {
                connectionId: pending?.connectionId,
                kind: 'message',
                message: { jsonrpc: '2.0', id: pending?.id, result: { stopReason: 'cancelled' } },
              }),
            20,
          );
          return null;
        }
        return previous(name, args);
      };
    });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'view:ai');
    await page.getByRole('button', { name: '打开文件夹', exact: true }).click();
    await startConversation(page);
    await openLayoutDocument(page);
    await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('改写文档');
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    await expect(page.locator('.ai-permission')).toContainText('写入文档');
    await page.getByText('查看写入内容（最多 12,000 字符）').click();
    await expect(page.locator('.ai-permission')).toContainText('# Proposed change');
    await expectFilledButtonStates(page, page.locator('.ai-permission .ai-primary').first(), true);
    await expectFilledButtonStates(page, page.getByRole('button', { name: '停止 AI 任务' }));
    await page.getByRole('button', { name: '停止 AI 任务' }).click();
    await expect(page.locator('.ai-permission')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (c) => c.command === 'agent_client_operation',
        ),
      ),
    ).toBe(false);
  });

test('first connection failure retains the unsent composer draft', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
      if (name === 'agent_connect') throw new Error('Fixture connection unavailable');
      return previous(name, args);
    };
  });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'view:ai');
  await page.getByRole('button', { name: '打开文件夹', exact: true }).click();
  await startConversation(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.fill('需要保留的待发送草稿');
  await page.getByRole('button', { name: '重新连接智能体' }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture connection unavailable');
  await expect(input).toBeEnabled();
  await expect(input).toHaveText('需要保留的待发送草稿');
  await emitLayoutMenu(page, 'view:ai');
  await expect(page.getByRole('complementary', { name: 'AI 助手侧栏' })).toBeHidden();
  await expect(page.locator('.runtime-area .marklyra-editor-frame')).toBeFocused();
  await emitLayoutMenu(page, 'view:ai');
  await expect(input).toHaveText('需要保留的待发送草稿');
});

async function expectCenteredEmpty(page: Page) {
  await expect
    .poll(() =>
      page.locator('.ai-empty').evaluate((empty) => {
        const area = empty.parentElement?.getBoundingClientRect();
        if (!area) throw Error('Missing empty-state container');
        const content = empty.getBoundingClientRect();
        return Math.max(
          Math.abs(content.x + content.width / 2 - area.x - area.width / 2),
          Math.abs(content.y + content.height / 2 - area.y - area.height / 2),
        );
      }),
    )
    .toBeLessThanOrEqual(1);
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  for (const titlebar of ['appkit', 'web'] as const)
    test(`${theme}/${titlebar}: compact empty state and toolbar stay clear of the document scrollbar`, async ({
      page,
    }, info) => {
      await installLayout(page, '很长的工作区名称用于验证窄侧栏布局与截断', titlebar);
      await page.addInitScript(mockAgents, { installed: false });
      await readyLayout(page, theme);
      await openLayoutDocument(
        page,
        '# Layout Reference\n\n' +
          Array.from(
            { length: 80 },
            (_, i) => `## Section ${i + 1}\n\n${'正文内容。'.repeat(30)}\n\n`,
          ).join(''),
      );
      const frame = page.frameLocator('.runtime-area .marklyra-editor-frame');
      // Keep a real scrollbar visible even on hosts configured to auto-hide it.
      await frame.locator('head').evaluate((head) => {
        const style = document.createElement('style');
        style.textContent =
          'content{scrollbar-width:auto!important;overflow-y:scroll!important}' +
          'content::-webkit-scrollbar{width:12px!important;display:block!important;background:transparent}' +
          'content::-webkit-scrollbar-thumb{background:#999!important;border-radius:6px}';
        head.append(style);
      });
      await emitLayoutMenu(page, 'view:ai');
      await expectCenteredEmpty(page);
      await emitLayoutMenu(page, 'open-folder');
      const panel = page.getByRole('complementary', { name: 'AI 助手侧栏' });
      await expect(panel.getByRole('heading', { name: '尚未启用智能体' })).toBeVisible();
      await expect(page.locator('.ai-session-identity img')).toHaveCount(0);
      await expect(page.locator('.ai-heading-title')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '关闭 AI 面板' })).toHaveCount(0);
      const actions = page.getByRole('group', { name: 'AI 会话操作' });
      await expect(actions.getByRole('button')).toHaveCount(3);
      const paneFrame = panel.locator('.document-details-body');
      await expect(paneFrame).toHaveCSS('border-top-style', 'solid');
      await expect(paneFrame).toHaveCSS('border-top-left-radius', '8px');
      for (const name of ['AI 历史会话', '智能体设置']) {
        await expect(actions.getByRole('button', { name, exact: true })).toHaveCSS(
          'border-top-width',
          '1px',
        );
        await expect(actions.getByRole('button', { name, exact: true })).toHaveCSS(
          'border-top-color',
          await actions
            .getByRole('button', { name: '新建 AI 会话' })
            .evaluate((element) => getComputedStyle(element).borderTopColor),
        );
      }
      await expect(panel.locator('.ai-empty > svg')).toHaveCount(0);
      await expect(panel.locator('.ai-empty')).toHaveCSS('text-align', 'left');
      for (const viewport of [
        { width: 700, height: 500 },
        { width: 960, height: 720 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await expectCenteredEmpty(page);
        // The AI pane is a third column. Wait for its resize animation, then check
        // controls against that pane rather than the retired window-edge overlay.
        await expect
          .poll(async () => {
            const box = await panel.boundingBox();
            const width = Number(
              await page
                .getByRole('separator', { name: '调整 AI 面板宽度' })
                .getAttribute('aria-valuenow'),
            );
            return box && Math.abs(box.width - width) <= 1 && box.x + box.width <= viewport.width;
          })
          .toBe(true);
        await expect
          .poll(() =>
            actions.getByRole('button').evaluateAll((buttons) => {
              const pane = buttons[0]?.closest('.document-details-body')?.getBoundingClientRect();
              if (!pane) return false;
              return buttons.every((button, index) => {
                const bounds = button.getBoundingClientRect();
                const previous = buttons[index - 1]?.getBoundingClientRect();
                const icon = button.querySelector('svg')?.getBoundingClientRect();
                const hit = [
                  bounds.left + 2,
                  bounds.left + bounds.width / 2,
                  bounds.right - 2,
                ].every(
                  (x) =>
                    document
                      .elementFromPoint(x, bounds.y + bounds.height / 2)
                      ?.closest('button') === button,
                );
                return (
                  bounds.left >= pane.left &&
                  bounds.right < pane.right &&
                  bounds.right < innerWidth &&
                  bounds.top >= pane.top &&
                  bounds.bottom <= pane.bottom &&
                  (index === 0 ? bounds.width > 80 : bounds.width === 28) &&
                  bounds.height === 28 &&
                  (!previous ||
                    (bounds.left > previous.right && Math.abs(bounds.top - previous.top) <= 1)) &&
                  icon?.width === 16 &&
                  icon.height === 16 &&
                  hit
                );
              });
            }),
          )
          .toBe(true);
        const toolbar = await actions.boundingBox();
        const documentPort = await frame.locator('content').boundingBox();
        const panelBounds = await panel.boundingBox();
        if (!toolbar || !documentPort || !panelBounds) throw Error('Missing AI/document geometry');
        expect(documentPort.x + documentPort.width).toBeLessThanOrEqual(panelBounds.x);
        expect(
          await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.classList.contains('marklyra-editor-frame'),
            { x: documentPort.x + documentPort.width - 6, y: toolbar.y + toolbar.height / 2 },
          ),
        ).toBe(true);
        expect(
          await panel.locator('.ai-empty-heading').evaluate((heading) => {
            const title = heading.querySelector('h2')?.getBoundingClientRect();
            const button = heading.querySelector('button')?.getBoundingClientRect();
            return (
              title &&
              button &&
              Math.abs(title.y + title.height / 2 - button.y - button.height / 2) <= 1 &&
              button.x - title.right >= 8 &&
              button.x - title.right <= 16 &&
              Math.abs(title.x - (heading.nextElementSibling?.getBoundingClientRect().x ?? 0)) <= 1
            );
          }),
        ).toBe(true);
        await expect(
          panel.getByRole('button', { name: '管理智能体', exact: true }),
        ).toBeInViewport();
        await page.screenshot({ path: info.outputPath(`${theme}-ai-empty-${viewport.width}.png`) });
      }
      const scrollport = frame.locator('content');
      const port = await scrollport.boundingBox();
      const scroll = await scrollport.evaluate((element) => ({
        height: element.clientHeight,
        total: element.scrollHeight,
      }));
      expect(scroll.total).toBeGreaterThan(scroll.height);
      if (!port) throw Error('Missing document scrollport');
      const thumbCenter = port.y + Math.max(12, (scroll.height * scroll.height) / scroll.total / 2);
      const scrollbarX = port.x + port.width - 6;
      await page.mouse.move(scrollbarX, thumbCenter);
      await page.mouse.down();
      await page.mouse.move(scrollbarX, thumbCenter + 180, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(() => scrollport.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      const resize = page.getByRole('separator', { name: '调整 AI 面板宽度' });
      const before = Number(await resize.getAttribute('aria-valuenow'));
      const handle = await resize.boundingBox();
      if (!handle) throw Error('Missing AI resize handle');
      await page.mouse.move(handle.x + 3, handle.y + 80);
      await page.mouse.down();
      await expect(resize).toHaveAttribute('aria-valuenow', String(before));
      await page.mouse.move(handle.x + 43, handle.y + 80);
      await page.mouse.up();
      await expect(resize).toHaveAttribute('aria-valuenow', String(before - 40));
      await expectCenteredEmpty(page);
      await resize.focus();
      await resize.press('End');
      await expectCenteredEmpty(page);
      await panel.locator('.ai-empty p').click();
      await scrollport.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath(`${theme}-ai-empty-wide.png`) });
      // The settings control stays usable after dragging the real document scrollbar.
      await page.getByRole('button', { name: '智能体设置', exact: true }).click();
      await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
      await page
        .frameLocator('.runtime-preferences-frame')
        .getByRole('button', { name: '返回应用', exact: true })
        .click();
      await manageFromSessionMenu(page);
      await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
      await page
        .frameLocator('.runtime-preferences-frame')
        .getByRole('button', { name: '返回应用', exact: true })
        .click();
      await expect(page.getByRole('combobox', { name: '对话智能体' })).toHaveCount(0);
      await expect(page.locator('.ai-session-identity img')).toHaveCount(0);
      await expectCenteredEmpty(page);
      const manage = panel.getByRole('button', { name: '管理智能体', exact: true });
      await manage.focus();
      await expect(manage).toBeFocused();
      await manage.press('Enter');
      await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
    });
}

test('agent management preserves the active conversation and draft; disabled agents use neutral identity', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expectCenteredEmpty(page);
  await page.screenshot({ path: info.outputPath('ai-empty-conversation.png') });
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await page.getByRole('button', { name: '概括要点', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveText('概括这篇文档的要点');
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
  await input.fill('保留这个后续问题');
  await manageFromSessionMenu(page);
  await expect(page.getByRole('region', { name: '智能体设置' })).toBeVisible();
  await page
    .frameLocator('.runtime-preferences-frame')
    .getByRole('button', { name: '返回应用', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '当前会话智能体' })).toContainText('Codex');
  await expect(input).toHaveText('保留这个后续问题');
  await expect(page.getByRole('log')).toContainText('已阅读');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter((c) => c.command === 'agent_disconnect'),
    ),
  ).toHaveLength(0);
  await startConversation(page);
  await expect(input).toHaveText('');
  await expectCenteredEmpty(page);
  await manageFromSessionMenu(page);
  await page.getByRole('switch', { name: '启用 Codex' }).uncheck();
  await page
    .frameLocator('.runtime-preferences-frame')
    .getByRole('button', { name: '返回应用', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '尚未启用智能体' })).toBeVisible();
  await expect(page.locator('.ai-session-identity img')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '对话智能体' })).toHaveCount(0);
  await expectCenteredEmpty(page);
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: Copilot and Grok icons render visible artwork on their shared white tile`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents, { includeBrandIcons: true });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'view:ai');
    await page.getByRole('button', { name: '智能体设置', exact: true }).click();
    const settings = page.getByRole('region', { name: '智能体设置' });
    await expect(settings).toBeVisible();
    for (const id of ['github-copilot-cli', 'grok-build']) {
      const icon = settings.locator(`img[src="/agents/${id}.svg"]`);
      await icon.scrollIntoViewIfNeeded();
      await expect(icon).toBeVisible();
      await expect(icon.locator('..')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      const visiblePixels = await icon.evaluate(async (element) => {
        const img = element as HTMLImageElement;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 28;
        const context = canvas.getContext('2d');
        if (!context) throw Error('Missing canvas context');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 28, 28);
        context.drawImage(img, 0, 0, 28, 28);
        const { data } = context.getImageData(0, 0, 28, 28);
        let visible = 0;
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i] ?? 255) < 128 && (data[i + 1] ?? 255) < 128 && (data[i + 2] ?? 255) < 128)
            visible++;
        }
        return visible;
      });
      expect(
        visiblePixels,
        `${id} must contain visible ink, not just a successfully loaded image`,
      ).toBeGreaterThan(40);
    }
    await settings
      .locator('.ai-agent-list')
      .screenshot({ path: info.outputPath(`${theme}-brand-icons.png`) });
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: filled buttons retain contrast and agent navigation uses the concise label`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    const send = page.getByRole('button', { name: '发送 AI 消息' });
    await expect(send).toBeDisabled();
    await page.mouse.move(1, 1);
    const disabled = await buttonAppearance(send);
    await send.hover();
    expect(await buttonAppearance(send)).toEqual(disabled);
    await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('保留草稿');
    await expectFilledButtonStates(page, send);
    await page.getByRole('button', { name: '智能体设置', exact: true }).click();
    const settings = page.getByRole('region', { name: '智能体设置' });
    await expect(
      settings.getByRole('heading', { level: 1, name: '智能体', exact: true }),
    ).toBeVisible();
    const navigation = page.frameLocator('.runtime-preferences-frame');
    await expect(navigation.getByRole('button', { name: '智能体', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navigation.getByRole('button', { name: 'AI 智能体', exact: true })).toHaveCount(0);
    const install = settings.getByRole('button', { name: '安装', exact: true });
    await expectFilledButtonStates(page, install, true);
    const refresh = settings.getByRole('button', { name: '刷新目录', exact: true });
    await refresh.hover();
    expect((await buttonAppearance(refresh)).contrast).toBeGreaterThanOrEqual(4.5);
    await install.hover();
    await settings
      .locator('.ai-agent-list')
      .screenshot({ path: info.outputPath(`${theme}-install-hover.png`) });
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) =>
            call.command === 'agent_install' ||
            (call.command === 'agent_send' &&
              (call.args?.message as { method?: string })?.method === 'session/prompt'),
        ),
      ),
    ).toBe(false);
  });
}

test('a failed agent install keeps its notice clear of the search row and the list', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents, { installed: false, failInstall: true });
  await readyLayout(page, 'marklyra-dark');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await page.getByRole('button', { name: '智能体设置', exact: true }).click();
  const settings = page.getByRole('region', { name: '智能体设置' });
  await settings.getByRole('button', { name: '安装', exact: true }).first().click();
  const notice = settings.getByRole('alert');
  await expect(notice).toContainText('智能体安装失败');
  const gaps = await page.evaluate(() => {
    const box = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const notice = box('.ai-settings-content > .ai-error');
    const search = box('.ai-search');
    const list = box('.ai-agent-list');
    if (!notice || !search || !list) throw new Error('missing agent settings regions');
    return { above: notice.top - search.bottom, below: list.top - notice.bottom };
  });
  expect(gaps.above).toBeGreaterThanOrEqual(8);
  expect(gaps.below).toBeGreaterThanOrEqual(12);
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: agent settings share navigation states and content geometry with existing preferences`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents, { includeBrandIcons: true });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'preferences');
    const ui = page.frameLocator('.runtime-preferences-frame');
    const file = ui.getByRole('button', { name: '文件', exact: true });
    const markdown = ui.getByRole('button', { name: 'Markdown', exact: true });
    const agents = ui.getByRole('button', { name: '智能体', exact: true });
    const settings = page.getByRole('region', { name: '智能体设置' });
    const navStyle = (node: Element) => {
      const s = getComputedStyle(node);
      const b = node.getBoundingClientRect();
      return {
        width: b.width,
        height: b.height,
        background: s.backgroundColor,
        color: s.color,
        font: s.font,
        radius: s.borderRadius,
        padding: s.padding,
        shadow: s.boxShadow,
      };
    };
    await expect(ui.locator('.settings-page-heading h1')).toHaveText('文件');
    await page.mouse.move(600, 100);
    await expect(agents).toHaveAttribute('aria-current', 'false');
    expect(await agents.evaluate(navStyle)).toEqual(await markdown.evaluate(navStyle));
    expect((await agents.evaluate(navStyle)).background).toBe('rgba(0, 0, 0, 0)');
    const selected = await file.evaluate(navStyle);
    await markdown.hover();
    const hover = await markdown.evaluate(navStyle);
    await agents.hover();
    expect(await agents.evaluate(navStyle)).toEqual(hover);
    await agents.click();
    await page.mouse.move(600, 100);
    await expect(settings).toBeVisible();
    expect(await agents.evaluate(navStyle)).toEqual(selected);
    await expect(ui.locator('.nav-group-item[aria-current="page"]')).toHaveCount(1);
    await expect(file).toHaveAttribute('aria-current', 'false');
    await expect(file).toHaveCSS('font-weight', '400');
    await markdown.click();
    await page.mouse.move(600, 100);
    await expect(settings).toHaveCount(0);
    await expect(ui.locator('.settings-page-heading h1')).toHaveText('Markdown');
    await expect(agents).toHaveAttribute('aria-current', 'false');
    expect((await agents.evaluate(navStyle)).background).toBe('rgba(0, 0, 0, 0)');
    await agents.focus();
    expect((await agents.evaluate(navStyle)).background).toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Enter');
    await expect(settings).toBeVisible();
    const typography = (node: Element) => {
      const s = getComputedStyle(node);
      return { font: s.font, color: s.color, letterSpacing: s.letterSpacing, margin: s.margin };
    };
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 900 },
      { width: 900, height: 720 },
      { width: 700, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await markdown.click();
      await expect(settings).toHaveCount(0);
      const originalBox = await ui.locator('.settings-page-heading').boundingBox();
      const originalTitle = await ui.locator('.settings-page-heading h1').evaluate(typography);
      const originalSubtitle = await ui.locator('.settings-page-heading p').evaluate(typography);
      const groupStyle = await ui
        .locator('.content:not(.display-none) .input-group-content')
        .first()
        .evaluate((node) => {
          const s = getComputedStyle(node);
          return { radius: s.borderRadius, border: s.borderTopColor };
        });
      await agents.click();
      await page.mouse.move(20, 20);
      await expect(settings).toBeVisible();
      const box = await settings.locator('.ai-settings-content').boundingBox();
      const scrollGeometry = (element: Element) => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        return {
          box: node.getBoundingClientRect().toJSON(),
          clientWidth: node.clientWidth,
          offsetWidth: node.offsetWidth,
          padding: style.padding,
          border: style.border,
          scrollbarWidth: style.scrollbarWidth,
          scrollbar: getComputedStyle(node, '::-webkit-scrollbar').width,
        };
      };
      await info.attach(`settings-geometry-${viewport.width}`, {
        contentType: 'application/json',
        body: JSON.stringify({
          originalBox,
          box,
          original: await ui.locator('.pane-group > .pane').evaluate(scrollGeometry),
          agent: await settings.evaluate(scrollGeometry),
        }),
      });
      if (!originalBox || !box) throw Error('Missing preferences content geometry');
      expect(Math.abs(box.x - originalBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y - originalBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - originalBox.width)).toBeLessThanOrEqual(1);
      expect(box.width).toBeLessThanOrEqual(760);
      expect(await settings.locator('h1').evaluate(typography)).toEqual(originalTitle);
      expect(await settings.locator('.ai-settings-heading p').evaluate(typography)).toEqual(
        originalSubtitle,
      );
      await expect(settings.locator('.ai-agent-list')).toHaveCSS(
        'border-radius',
        groupStyle.radius,
      );
      await expect(settings.locator('.ai-agent-list')).toHaveCSS(
        'border-top-color',
        groupStyle.border,
      );
      expect(await settings.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${theme}-settings-consistent-${viewport.width}.png`),
      });
    }
    const agentSearch = settings.getByRole('textbox', { name: '搜索智能体', exact: true });
    await agentSearch.fill('不存在的智能体');
    await expect(settings.getByRole('status')).toHaveText('未找到匹配的智能体，请尝试其他名称。');
    await expect(settings.locator('.ai-agent-card')).toHaveCount(0);
    await agentSearch.fill('');
    await expect(settings.locator('.ai-agent-card')).toHaveCount(4);
    await ui.getByRole('searchbox', { name: '搜索设置', exact: true }).fill('自动保存');
    await expect(settings).toHaveCount(0);
    await expect(agents).toHaveAttribute('aria-current', 'false');
    await ui.getByRole('button', { name: '返回应用', exact: true }).click();
    await expect(page.locator('.runtime-preferences-frame')).toHaveCount(0);
    await expect(page.locator('.runtime-area .marklyra-editor-frame')).toBeFocused();
    await emitLayoutMenu(page, 'preferences');
    await expect(ui.locator('.settings-page-heading h1')).toHaveText('文件');
    await page.mouse.move(600, 100);
    await expect(agents).toHaveAttribute('aria-current', 'false');
    expect((await agents.evaluate(navStyle)).background).toBe('rgba(0, 0, 0, 0)');
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  for (const fallback of [false, true]) {
    test(`${theme} ${fallback ? 'fallback' : 'native'}: credentials modal is centered and saves, replaces and deletes without stale or plaintext UI state`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await installLayout(page);
      if (fallback)
        await page.addInitScript(() => {
          Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
            value: undefined,
            configurable: true,
          });
        });
      await page.addInitScript(mockAgents, { includeBrandIcons: true });
      await readyLayout(page, theme);
      await emitLayoutMenu(page, 'view:ai');
      await page.getByRole('button', { name: '智能体设置', exact: true }).click();
      const settings = page.getByRole('region', { name: '智能体设置' });
      const controls = settings.getByRole('group', { name: 'Codex 管理操作' });
      const toggle = controls.getByRole('switch', { name: '启用 Codex' });
      const manage = controls.getByRole('button', { name: '管理 Codex 凭据' });
      const uninstall = controls.getByRole('button', { name: '卸载', exact: true });
      const positions = await Promise.all([
        toggle.boundingBox(),
        manage.boundingBox(),
        uninstall.boundingBox(),
      ]);
      const [a, b, c] = positions;
      if (!a || !b || !c) throw Error('Missing installed actions');
      expect(a.x + a.width).toBeLessThan(b.x);
      expect(b.x + b.width).toBeLessThan(c.x);
      expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`${theme}-installed-actions.png`) });
      await page.setViewportSize({ width: 900, height: 640 });
      await settings.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await manage.click();
      const dialog = page.getByRole('dialog', { name: 'Codex 凭据', exact: true });
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(!fallback);
      const variable = dialog.getByRole('textbox', { name: '环境变量名称', exact: true });
      const password = dialog.getByLabel('凭据值', { exact: true });
      await expect(variable).toBeFocused();
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 900, height: 640 },
        { width: 700, height: 500 },
      ]) {
        await page.setViewportSize(viewport);
        const box = await dialog.boundingBox();
        if (!box) throw Error('Missing credentials dialog');
        expect(box.width).toBeLessThanOrEqual(480);
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
        expect(box.y).toBeGreaterThanOrEqual(31);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 31);
        expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(dialog.getByRole('button', { name: '完成', exact: true })).toBeInViewport();
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await variable.fill('2INVALID');
      await password.fill('synthetic-only-secret');
      await expect(dialog.getByRole('button', { name: '保存凭据', exact: true })).toBeDisabled();
      await variable.fill('providerToken');
      await page.evaluate(() => Reflect.set(window, '__credentialHold', true));
      await dialog.getByRole('button', { name: '保存凭据', exact: true }).click();
      await expect(password).toHaveValue('');
      await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await page.evaluate(() => {
        Reflect.set(window, '__credentialHold', false);
        Reflect.get(window, '__releaseCredentialOperation')();
      });
      await expect(dialog.locator('.ai-credential-list code')).toHaveText('providerToken');
      await expect(dialog.getByRole('status')).toContainText('凭据已保存');
      await expect(password).toHaveValue('');
      await expect(dialog).not.toContainText('synthetic-only-secret');
      const longName = `SECOND_${'TOKEN_'.repeat(10)}VALUE`;
      await variable.fill(longName);
      await password.fill('synthetic-second-secret');
      await dialog.getByRole('button', { name: '保存凭据', exact: true }).click();
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(2);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await dialog.getByRole('button', { name: '完成', exact: true }).click();
      await manage.click();
      await expect(
        dialog.getByRole('button', { name: '替换凭据 providerToken', exact: true }),
      ).toBeFocused();
      await dialog.getByRole('button', { name: '替换凭据 providerToken', exact: true }).click();
      await expect(variable).toHaveValue('providerToken');
      await expect(password).toBeFocused();
      await expect(password).toHaveValue('');
      await password.fill('synthetic-replacement-secret');
      await page.evaluate(() => Reflect.set(window, '__credentialFailure', true));
      await dialog.getByRole('button', { name: '保存替换', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('系统凭据存储暂不可用');
      await expect(password).toHaveValue('');
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(2);
      await page.evaluate(() => Reflect.set(window, '__credentialFailure', false));
      await password.fill('synthetic-replacement-secret');
      await dialog.getByRole('button', { name: '保存替换', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('凭据已保存');
      await dialog.locator('.ai-dialog-content').evaluate((node) => {
        node.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath(`${theme}-credentials.png`) });
      await dialog.getByRole('button', { name: '删除凭据 providerToken', exact: true }).click();
      await dialog.getByRole('button', { name: '取消删除', exact: true }).click();
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(2);
      await dialog.getByRole('button', { name: '删除凭据 providerToken', exact: true }).click();
      await page.evaluate(() => Reflect.set(window, '__credentialFailure', true));
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('系统凭据存储暂不可用');
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(2);
      await page.evaluate(() => Reflect.set(window, '__credentialFailure', false));
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(1);
      await dialog.getByRole('button', { name: `删除凭据 ${longName}`, exact: true }).click();
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(0);
      await expect(dialog.getByRole('status')).toContainText('凭据已删除');
      await dialog.getByRole('button', { name: '完成', exact: true }).focus();
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(manage).toBeFocused();
      await expect(settings).toBeVisible();
      await manage.click();
      await expect(password).toHaveValue('');
      await expect(variable).toHaveValue('');
      await expect(dialog.locator('.ai-credential-list code')).toHaveCount(0);
      await password.fill('synthetic-unsaved-secret');
      await page.keyboard.press('Escape');
      await manage.click();
      await expect(password).toHaveValue('');
      expect(
        await page.evaluate(() =>
          [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
            (value) =>
              value.includes('synthetic-only-secret') ||
              value.includes('synthetic-replacement-secret') ||
              value.includes('synthetic-unsaved-secret'),
          ),
        ),
      ).toBe(false);
      await dialog.getByRole('button', { name: '完成', exact: true }).click();
      await uninstall.click();
      const confirm = page.getByRole('dialog', { name: '卸载 Codex', exact: true });
      await expect(confirm).toBeVisible();
      expect((await confirm.boundingBox())?.width).toBeLessThanOrEqual(480);
      await confirm.getByRole('button', { name: '取消', exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(toggle).toBeChecked();
    });
  }
}

function mockPreparation({ hold = false, auth = false, compact = false } = {}) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  let authenticated = !auth;
  const configOptions = [
    {
      id: 'model',
      name: '模型',
      type: 'select',
      currentValue: 'fast',
      options: [
        { value: 'fast', name: '快速模型' },
        { value: 'deep', name: '深度模型' },
      ],
    },
    {
      id: 'reasoning',
      name: '思考深度',
      type: 'select',
      currentValue: 'medium',
      options: [
        { value: 'medium', name: '标准' },
        { value: 'high', name: '深入' },
      ],
    },
    {
      id: 'permission_policy',
      category: 'mode',
      name: '权限模式',
      type: 'select',
      currentValue: 'ask',
      options: [
        { value: 'ask', name: '询问' },
        { value: 'plan', name: '规划' },
      ],
    },
  ];
  if (compact) {
    configOptions[0] = {
      id: 'model',
      name: '模型',
      type: 'select',
      currentValue: 'glm',
      options: [
        { value: 'glm', name: 'GLM-5.3' },
        { value: 'preview', name: 'GLM-5.3 High Throughput Preview' },
        {
          value: 'long',
          name: 'A deliberately long alternative model name that must not widen the selected field',
        },
      ],
    };
    configOptions[1] = {
      id: 'reasoning',
      name: '思考深度',
      type: 'select',
      currentValue: 'max',
      options: [
        { value: 'max', name: 'Max' },
        { value: 'high', name: 'High' },
      ],
    };
    configOptions[2] = {
      id: 'permission_policy',
      category: 'mode',
      name: '权限模式',
      type: 'select',
      currentValue: 'ask',
      options: [
        { value: 'ask', name: 'Ask for permission' },
        { value: 'plan', name: 'Plan' },
      ],
    };
  }
  host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
    if (name === 'agent_catalog') {
      const catalog = (await previous(name, args)) as { profiles: Record<string, unknown>[] };
      return {
        ...catalog,
        profiles: [
          ...catalog.profiles,
          { ...catalog.profiles[0], id: 'test-other', name: 'Other', agentId: 'opencode' },
        ],
      };
    }
    const message = args.message as
      | { id: number; method: string; params?: { configId: string; value: string } }
      | undefined;
    if (
      name !== 'agent_send' ||
      !message ||
      !['initialize', 'authenticate', 'session/new', 'session/set_config_option'].includes(
        message.method,
      )
    )
      return previous(name, args);
    host.__desktopMock.calls.push({ command: name, args });
    const reply = (payload: Record<string, unknown>) =>
      host.__desktopMock.emitEvent('marklyra:agent-event', {
        connectionId: args.connectionId,
        kind: 'message',
        message: { jsonrpc: '2.0', id: message.id, ...payload },
      });
    if (message.method === 'initialize') {
      reply({
        result: { protocolVersion: 1, authMethods: [{ id: 'fixture-login', name: '测试登录' }] },
      });
    } else if (message.method === 'authenticate') {
      authenticated = true;
      reply({ result: {} });
    } else if (!authenticated) {
      reply({ error: { code: -32000, message: 'Authentication required' } });
    } else if (message.method === 'session/new') {
      const ready = () =>
        reply({
          result: {
            sessionId: 'provider-session',
            configOptions: args.connectionId === 'connection-1' ? configOptions : [],
            modes: {
              currentModeId: 'ask',
              availableModes: [
                { id: 'ask', name: '询问' },
                { id: 'plan', name: '规划' },
              ],
            },
          },
        });
      if (hold && args.connectionId === 'connection-1')
        Reflect.set(window, '__releasePreparation', ready);
      else ready();
    } else {
      const option = configOptions.find((option) => option.id === message.params?.configId);
      if (option && message.params) option.currentValue = message.params.value;
      reply({ result: { configOptions } });
    }
    return null;
  };
}

test('agent selection prepares editable ACP options before the first message', async ({
  page,
}, info) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(mockPreparation);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('fast');
  await expect(page.getByRole('combobox', { name: '智能体模式', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('deep');
  await page.getByRole('combobox', { name: '思考深度', exact: true }).selectOption('high');
  await page.getByRole('combobox', { name: '权限模式', exact: true }).selectOption('plan');
  await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('deep');
  await expect(page.getByRole('combobox', { name: '思考深度', exact: true })).toHaveValue('high');
  await expect(page.locator('.ai-composer-area')).toHaveCSS('border-top-width', '0px');
  await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('尚未发送');
  await emitLayoutMenu(page, 'view:ai');
  await emitLayoutMenu(page, 'view:ai');
  await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('deep');
  const calls = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  expect(calls.filter((call) => call.command === 'agent_connect')).toHaveLength(1);
  expect(
    calls.some(
      (call) =>
        ['agent_context', 'agent_save_session'].includes(call.command) ||
        (call.args?.message as { method?: string })?.method === 'session/prompt',
    ),
  ).toBe(false);
  await page.locator('.ai-panel').screenshot({ path: info.outputPath('prepared-options.png') });
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
});

test('preparation permits drafting and agent switching without stale options', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(mockPreparation, { hold: true });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expect(page.getByRole('status')).toContainText('正在连接智能体');
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.fill('连接期间可以编辑');
  await expect(input).toHaveText('连接期间可以编辑');
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, '__releasePreparation')))
    .toBe('function');
  await startConversation(page, 'Other');
  await expect(page.getByRole('combobox', { name: '智能体模式', exact: true })).toHaveValue('ask');
  await page.getByRole('combobox', { name: '智能体模式', exact: true }).selectOption('plan');
  await page.evaluate(() => Reflect.get(window, '__releasePreparation')());
  await expect(page.getByRole('combobox', { name: '智能体模式', exact: true })).toHaveValue('plan');
  await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveCount(0);
  await expect(page.getByRole('log')).not.toContainText('已阅读');
});

test('authentication is offered before sending and preserves the draft', async ({ page }) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(mockPreparation, { auth: true });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await expect(page.getByRole('button', { name: '测试登录' })).toBeVisible();
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.fill('登录后保留');
  await page.getByRole('button', { name: '测试登录' }).click();
  await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('fast');
  await expect(input).toHaveText('登录后保留');
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: new session menu uses installed agents and creates only on selection`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(mockPreparation);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    const trigger = page.getByRole('button', { name: '新建 AI 会话' });
    await expect(page.getByRole('heading', { name: '开始新的对话' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '对话智能体' })).toHaveCount(0);
    await trigger.focus();
    await trigger.press('ArrowDown');
    const menu = page.getByRole('menu', { name: '选择新会话智能体' });
    const geometry = await trigger.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const popup = element.parentElement?.querySelector('[role="menu"]')?.getBoundingClientRect();
      if (!popup) throw Error('Missing session menu geometry');
      return {
        x: Math.abs(popup.x - button.x),
        width: Math.abs(popup.width - button.width),
        gap: popup.y - button.bottom,
      };
    });
    expect(geometry.x).toBeLessThanOrEqual(1);
    expect(geometry.width).toBeLessThanOrEqual(1);
    expect(geometry.gap).toBeCloseTo(2, 0);
    await expect(trigger).toHaveCSS('border-top-width', '1px');
    expect(
      await trigger.evaluate((element) => {
        const label = element.querySelector('.ai-new-session-label')?.getBoundingClientRect();
        const arrow = element.querySelector('.ai-menu-chevron svg')?.getBoundingClientRect();
        if (!label || !arrow) return Infinity;
        return Math.abs(label.y + label.height / 2 - arrow.y - arrow.height / 2);
      }),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole('menuitemradio', { name: 'Codex', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio', { name: 'Other', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: '管理智能体…' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI 历史会话' })).toBeFocused();
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some((call) => call.command === 'agent_connect'),
      ),
    ).toBe(false);
    await startConversation(page);
    const identity = page.getByRole('region', { name: '当前会话智能体' });
    await expect(identity).toContainText('Codex');
    await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('fast');
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await input.fill('展开菜单时保留草稿');
    await trigger.click();
    await expect(page.getByRole('menuitemradio', { name: 'Codex', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(input).toHaveText('展开菜单时保留草稿');
    await menu.screenshot({ path: info.outputPath(`${theme}-new-session-menu.png`) });
    await page
      .locator('.ai-panel-heading')
      .screenshot({ path: info.outputPath(`${theme}-new-session-trigger.png`) });
    await page.keyboard.press('Escape');
    await expect(input).toHaveText('展开菜单时保留草稿');
    await startConversation(page, 'Other');
    await expect(identity).toContainText('Other');
    await expect(input).toHaveText('');
    await expect(page.getByRole('combobox', { name: '智能体模式', exact: true })).toHaveValue(
      'ask',
    );
    await trigger.click();
    await page.getByRole('heading', { name: '从这篇文档开始', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await page.setViewportSize({ width: 700, height: 500 });
    await trigger.click();
    const bounds = await menu.boundingBox();
    const panel = await page.locator('.ai-panel').boundingBox();
    if (!bounds || !panel) throw Error('Missing menu geometry');
    const narrowTrigger = await trigger.boundingBox();
    if (!narrowTrigger) throw Error('Missing session trigger');
    expect(Math.abs(bounds.x - narrowTrigger.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.width - narrowTrigger.width)).toBeLessThanOrEqual(1);
    expect(bounds.x).toBeGreaterThanOrEqual(panel.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panel.x + panel.width);
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-new-session-narrow.png`) });
  });
}

test('disabled installed agents remain visible in the session menu without starting a process', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents, { enabled: false });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await page.getByRole('button', { name: '新建 AI 会话' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Codex 已停用' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '管理智能体…' })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.some((call) => call.command === 'agent_connect'),
    ),
  ).toBe(false);
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: composer focus is subtle and common ACP options fit one row`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(mockPreparation, { compact: true });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('glm');
    await input.click();
    await expect(input).toHaveCSS('outline-style', 'none');
    await expect(input).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.ai-composer')).toHaveCSS('box-shadow', 'none');
    await expect(page.locator('.ai-composer')).toHaveCSS('border-top-width', '1px');
    const focusChannels = await page.locator('.ai-composer').evaluate((element) => {
      const color = getComputedStyle(element).borderTopColor;
      const channels =
        color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      return color.startsWith('color(') ? channels.map((value) => value * 255) : channels;
    });
    expect(focusChannels).toHaveLength(3);
    expect(Math.max(...focusChannels) - Math.min(...focusChannels)).toBeLessThan(20);
    await input.press('Tab');
    await page.getByRole('button', { name: '添加文档上下文' }).focus();
    await expect(page.getByRole('button', { name: '添加文档上下文' })).toBeFocused();
    await expect(page.getByRole('button', { name: '添加文档上下文' })).toHaveCSS(
      'outline-style',
      'solid',
    );
    await input.focus();
    await expect(input).toHaveCSS('outline-style', 'none');
    await expect(page.getByText('内置文档工具写入需确认', { exact: true })).toHaveCount(0);
    const options = page.locator('.ai-session-options');
    await expect(options.getByRole('combobox')).toHaveCount(3);
    await expect(options.getByText('模型', { exact: true })).toHaveCount(0);
    await expect(options.locator('.ai-session-option').first()).toHaveAttribute(
      'title',
      '模型：GLM-5.3',
    );
    const resize = page.getByRole('separator', { name: '调整 AI 面板宽度' });
    await resize.focus();
    await resize.press('Home');
    await expect(resize).toHaveAttribute('aria-valuenow', '280');
    await expect
      .poll(() =>
        options.evaluate((element) => {
          const boxes = [...element.querySelectorAll('select')].map((select) =>
            select.getBoundingClientRect(),
          );
          return (
            Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top))
          );
        }),
      )
      .toBeLessThanOrEqual(1);
    await input.focus();
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-compact-composer.png`) });
    const fitsSelectedText = () =>
      options.evaluate((element) =>
        [...element.querySelectorAll('select')].every((select) => {
          const measure = select.parentElement?.querySelector('.ai-session-option-measure');
          if (!measure) return false;
          const range = document.createRange();
          range.selectNodeContents(measure);
          const style = getComputedStyle(select);
          return (
            select.clientWidth -
              Number.parseFloat(style.paddingLeft) -
              Number.parseFloat(style.paddingRight) >=
            range.getBoundingClientRect().width - 1
          );
        }),
      );
    expect(await fitsSelectedText()).toBe(true);
    await resize.focus();
    await resize.press('End');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('preview');
    await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('preview');
    expect(await fitsSelectedText()).toBe(true);
    expect(
      (await page.getByRole('combobox', { name: '模型', exact: true }).boundingBox())?.width,
    ).toBeGreaterThan(160);
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-adaptive-options-wide.png`) });
    await resize.focus();
    await resize.press('Home');

    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('long');
    await expect(page.getByRole('combobox', { name: '模型', exact: true })).toHaveValue('long');
    await expect(options.locator('.ai-session-option').first()).toHaveAttribute(
      'title',
      /deliberately long/,
    );
    await expect
      .poll(() => options.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      (window as TestWindow).__desktopMock.emitEvent('marklyra:agent-event', {
        connectionId: 'connection-1',
        kind: 'message',
        message: {
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'provider-session',
            update: {
              sessionUpdate: 'config_option_update',
              configOptions: Array.from({ length: 6 }, (_, index) => ({
                id: `setting-${index}`,
                name: `设置 ${index}`,
                type: 'select',
                currentValue: 'value',
                options: [{ value: 'value', name: `Configuration ${index}` }],
              })),
            },
          },
        },
      });
    });
    await expect(options.getByRole('combobox')).toHaveCount(6);
    const layout = await options.evaluate((element) => ({
      rows: new Set(
        [...element.querySelectorAll('select')].map((select) =>
          Math.round(select.getBoundingClientRect().top),
        ),
      ).size,
      fits: element.scrollWidth <= element.clientWidth,
    }));
    expect(layout.rows).toBeGreaterThan(1);
    expect(layout.fits).toBe(true);
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-many-options.png`) });
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: provider errors keep environment variable underscores and copyable text`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const host = window as TestWindow & {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previous = host.__TAURI_INTERNALS__.invoke;
      host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
        const message = args.message as { id: number; method: string } | undefined;
        if (name !== 'agent_send' || message?.method !== 'session/prompt')
          return previous(name, args);
        host.__desktopMock.calls.push({ command: name, args });
        const emit = (message: unknown) =>
          host.__desktopMock.emitEvent('marklyra:agent-event', {
            connectionId: args.connectionId,
            kind: 'message',
            message,
          });
        setTimeout(() => {
          // Split inside the identifier to exercise incremental chat rendering as well.
          for (const text of [
            '[error] No API key found. Set the Z_AI_',
            'API_KEY environment variable, or run `glm-acp-agent --setup` to store one.\n\n_AI_ **Z_AI_API_KEY** `Z_AI_API_KEY` [my_file_name.md](Notes/my_file_name.md)',
          ]) {
            emit({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: 'provider-session',
                update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
              },
            });
          }
          emit({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } });
        }, 20);
        return null;
      };
    });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('你好');
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    const answer = page.locator('.ai-message-assistant .ai-markdown');
    await expect(answer).toContainText('Set the Z_AI_API_KEY environment variable');
    await expect(answer.locator('em')).toHaveCount(1);
    await expect(answer.locator('em')).toHaveText('AI');
    await expect(answer.locator('strong')).toHaveText('Z_AI_API_KEY');
    await expect(answer.locator('code').last()).toHaveText('Z_AI_API_KEY');
    await expect(answer.getByRole('link', { name: 'my_file_name.md' })).toHaveAttribute(
      'href',
      '#document:Notes%2Fmy_file_name.md',
    );
    const copied = await answer
      .locator('p')
      .first()
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection?.toString();
      });
    expect(copied).toContain('Z_AI_API_KEY');
    expect(copied).not.toContain('ZAIAPI_KEY');
    await answer.screenshot({ path: info.outputPath(`${theme}-literal-env-name.png`) });
  });
}

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: rich composer uses document links and retains typing through selection and IME`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await input.fill('请看 @Other');
    await input.press('Enter');
    await expect(input.locator('a[data-reference="Notes/Other.md"]')).toHaveText('Other.md');
    await expect(input).not.toContainText('%');
    await expect(input).not.toContainText('](');
    await input.press('ControlOrMeta+z');
    await expect(input.locator('a')).toHaveCount(0);
    await input.fill('请看 @Other');
    await input.press('Enter');
    await input.press('End');
    await input.press('Shift+Enter');
    await page.keyboard.type('继续检查');
    await expect(input).toContainText('继续检查');
    await input.evaluate((element) =>
      Reflect.set(window, '__composerNode', { element, first: element.firstChild }),
    );
    await input.dispatchEvent('compositionstart');
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.emitEvent('marklyra:agent-event', {
        connectionId: 'connection-1',
        kind: 'message',
        message: {
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'provider-session',
            update: { sessionUpdate: 'usage_update', used: 25, size: 100 },
          },
        },
      }),
    );
    await expect(page.locator('.ai-composer-hint')).toContainText('25%');
    expect(
      await input.evaluate((element) => {
        const saved = Reflect.get(window, '__composerNode');
        return saved.element === element && saved.first === element.firstChild;
      }),
    ).toBe(true);
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    await input.dispatchEvent('compositionend');
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) => (call.args?.message as { method?: string })?.method === 'session/prompt',
        ),
      ),
    ).toBe(false);
    await page
      .locator('.ai-composer')
      .screenshot({ path: info.outputPath(`${theme}-rich-mention.png`) });
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    await expect(page.getByRole('log')).toContainText('已阅读');
    const user = page.locator('.ai-message-user');
    await expect(user.locator('.ai-message-label')).toHaveCount(0);
    await expect(page.locator('.ai-message-assistant .ai-message-label')).toHaveCount(0);
    await expect(user.locator('.ai-message-body a').first()).toHaveText('Other.md');
    const prompt = await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.find(
          (call) => (call.args?.message as { method?: string })?.method === 'session/prompt',
        )?.args?.message,
    );
    expect(JSON.stringify(prompt)).toContain('[Other.md](Notes/Other.md)');
    await user.hover();
    await expect(user.locator('.ai-message-actions')).toHaveCSS('opacity', '1');
    await expect(user.locator('time')).toHaveAttribute('datetime', /T/);
    await user.getByRole('button', { name: '复制消息' }).click();
    await expect(user.getByRole('button', { name: '已复制消息' })).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.some(
          (call) =>
            call.command === 'clipboard_write' &&
            String((call.args?.data as { text?: string })?.text).includes(
              '[Other.md](Notes/Other.md)',
            ),
        ),
      ),
    ).toBe(true);
  });

  test(`${theme}: file picker and paste preserve image bytes, separate media from bubbles and persist history`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const host = window as TestWindow & {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previous = host.__TAURI_INTERNALS__.invoke;
      host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
        const message = args.message as { method: string; id: number } | undefined;
        if (name === 'agent_send' && message?.method === 'session/prompt') {
          host.__desktopMock.calls.push({ command: name, args });
          Reflect.set(window, '__finishAttachmentReply', () => {
            host.__desktopMock.emitEvent('marklyra:agent-event', {
              connectionId: args.connectionId,
              kind: 'message',
              message: {
                jsonrpc: '2.0',
                method: 'session/update',
                params: {
                  sessionId: 'provider-session',
                  update: {
                    sessionUpdate: 'agent_message_chunk',
                    content: { type: 'text', text: '已经收到附件。' },
                  },
                },
              },
            });
            host.__desktopMock.emitEvent('marklyra:agent-event', {
              connectionId: args.connectionId,
              kind: 'message',
              message: { jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } },
            });
          });
          return null;
        }
        return previous(name, args);
      };
    });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    // A browser-originated image and a text file exercise the same File ingestion as the picker.
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Canvas unavailable');
      ctx.fillStyle = '#c4dcf6';
      ctx.fillRect(0, 0, 160, 100);
      ctx.fillStyle = '#254d7a';
      ctx.fillRect(20, 25, 120, 50);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    });
    await page.getByLabel('选择附件').setInputFiles([
      { name: '示意图.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
      { name: '说明.txt', mimeType: 'text/plain', buffer: Buffer.from('这是附件正文。') },
    ]);
    await expect(
      page.getByRole('region', { name: '待发送附件' }).locator('.ai-attachment-item'),
    ).toHaveCount(2);
    await expect(page.getByRole('img', { name: '示意图.png', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '预览附件 示意图.png' }).click();
    await expect(page.getByRole('dialog', { name: '示意图.png' })).toBeVisible();
    await page.keyboard.press('Escape');
    await input.fill('请查看图片和文件');
    await page
      .locator('.ai-composer')
      .screenshot({ path: info.outputPath(`${theme}-draft-attachments.png`) });
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    await expect(input).toHaveText('');
    await expect(page.getByRole('button', { name: '停止 AI 任务' })).toBeVisible();
    await expect(page.getByRole('region', { name: '待发送附件' })).toHaveCount(0);
    await input.fill('等待时继续起草');
    await page.getByRole('button', { name: 'AI 历史会话' }).click();
    await page.getByRole('button', { name: '返回对话' }).click();
    await expect(input).toHaveText('等待时继续起草');
    const user = page.locator('.ai-message-user');
    await expect(user.locator(':scope > .ai-attachment-rail')).toBeVisible();
    await expect(user.locator('.ai-message-body .ai-attachment-rail')).toHaveCount(0);
    const prompt = (await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls.find(
          (call) => (call.args?.message as { method?: string })?.method === 'session/prompt',
        )?.args?.message,
    )) as { params: { prompt: { type: string; data?: string; resource?: { text?: string } }[] } };
    expect(prompt.params.prompt.find((block) => block.type === 'image')?.data).toBe(image);
    expect(prompt.params.prompt.find((block) => block.type === 'resource')?.resource?.text).toBe(
      '这是附件正文。',
    );
    await page.evaluate(() => Reflect.get(window, '__finishAttachmentReply')());
    await expect(page.getByRole('log')).toContainText('已经收到附件');
    await expect(input).toHaveText('等待时继续起草');
    const stored = (await page.evaluate(
      () =>
        (window as TestWindow).__desktopMock.calls
          .filter((call) => call.command === 'agent_save_session')
          .at(-1)?.args?.record,
    )) as { messages: { attachments?: Record<string, unknown>[] }[] };
    expect(stored.messages[0]?.attachments).toHaveLength(2);
    expect(stored.messages[0]?.attachments?.[0]).not.toHaveProperty('data');
    await user.getByRole('button', { name: '预览附件 说明.txt' }).click();
    await expect(page.getByRole('dialog', { name: '说明.txt' })).toContainText('这是附件正文。');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'AI 历史会话' }).click();
    await page.locator('.ai-history-open').first().click();
    await expect(page.locator('.ai-message-user .ai-attachment-rail')).toBeVisible();
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-sent-attachments.png`) });
    // Native Finder-style clipboard payload is captured only on an explicit paste.
    await page.evaluate(() =>
      Reflect.set(window, '__clipboardPayload', {
        files: [{ name: '粘贴.txt', base64: btoa('pasted file') }],
      }),
    );
    await input.dispatchEvent('paste');
    await expect(page.getByRole('region', { name: '待发送附件' })).toContainText('粘贴.txt');
    await page.getByRole('button', { name: '移除附件 粘贴.txt' }).click();
    await expect(page.getByRole('region', { name: '待发送附件' })).toHaveCount(0);
  });
}

test('attachment capability failures keep drafts and text files fall back to a named text block', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents, { imageSupport: false, embeddedSupport: false });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    return canvas.toDataURL().split(',')[1] ?? '';
  });
  await page.getByLabel('选择附件').setInputFiles([
    { name: 'image.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('file text') },
  ]);
  await input.fill('保留这个问题');
  await expect(page.getByRole('alert')).toContainText('未声明图片理解能力');
  await expect(page.getByRole('button', { name: '发送 AI 消息' })).toBeDisabled();
  await expect(input).toHaveText('保留这个问题');
  await page.getByRole('button', { name: '移除附件 image.png' }).click();
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
  const prompt = (await page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls.find(
        (call) => (call.args?.message as { method?: string })?.method === 'session/prompt',
      )?.args?.message,
  )) as { params: { prompt: { type: string; text?: string }[] } };
  expect(prompt.params.prompt.every((block) => block.type === 'text')).toBe(true);
  expect(
    prompt.params.prompt.some((block) =>
      block.text?.includes('附件 note.txt\n<attachment-content>\nfile text'),
    ),
  ).toBe(true);
  await page.getByLabel('选择附件').setInputFiles({
    name: 'binary.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n\0binary'),
  });
  await expect(page.getByRole('alert')).toContainText('不支持 binary.pdf');
  await expect(page.getByRole('button', { name: '发送 AI 消息' })).toBeDisabled();
});

test('late clipboard files never enter a different conversation and native drop targets the composer', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const previous = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
      if (name === 'agent_clipboard_attachments')
        return new Promise((resolve) =>
          Reflect.set(
            window,
            '__lateClipboard',
            (value: unknown = { files: [{ name: 'old.txt', base64: btoa('old') }] }) =>
              resolve(value),
          ),
        );
      return previous(name, args);
    };
  });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.dispatchEvent('paste');
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, '__lateClipboard')))
    .toBe('function');
  await startConversation(page);
  await page.evaluate(() => Reflect.get(window, '__lateClipboard')());
  await expect(page.getByRole('region', { name: '待发送附件' })).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.set(window, '__dropPayload', {
      files: [{ name: 'dropped.txt', base64: btoa('dropped file') }],
    });
    const rect = document.querySelector('.ai-composer')?.getBoundingClientRect();
    if (!rect) throw Error('Missing composer');
    (window as TestWindow).__desktopMock.emitEvent('native-file-drop', {
      ticket: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      entries: [{ name: 'dropped.txt', kind: 'file' }],
      position: { x: rect.x + 20, y: rect.y + 20 },
      viewport: { width: innerWidth, height: innerHeight },
    });
  });
  await expect(page.getByRole('region', { name: '待发送附件' })).toContainText('dropped.txt');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.some(
        (call) => call.command === 'agent_import_dropped_attachments',
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.some(
        (call) => call.command === 'import_native_input_images',
      ),
    ),
  ).toBe(false);
  await input.fill('abc');
  await input.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild ?? element, 0);
    range.collapse(true);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    Reflect.deleteProperty(window, '__lateClipboard');
  });
  await input.dispatchEvent('paste');
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, '__lateClipboard')))
    .toBe('function');
  await input.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.evaluate(() => Reflect.get(window, '__lateClipboard')({ text: 'stale paste' }));
  await expect(input).toHaveText('abc');
  await expect(page.getByRole('alert')).toContainText('焦点已变化');
});

test('pasted HTML remains literal and oversized attachments do not replace an existing draft', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.focus();
  await page.evaluate(() =>
    Reflect.set(window, '__clipboardPayload', { text: '<img src=x onerror=alert(1)> literal' }),
  );
  await input.dispatchEvent('paste');
  await expect(input).toHaveText('<img src=x onerror=alert(1)> literal');
  await expect(input.locator('img')).toHaveCount(0);
  await page
    .getByLabel('选择附件')
    .setInputFiles({ name: 'keep.txt', mimeType: 'text/plain', buffer: Buffer.from('keep') });
  await expect(page.getByRole('region', { name: '待发送附件' })).toContainText('keep.txt');
  await page.getByLabel('选择附件').setInputFiles({
    name: 'large.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('超过 4 MiB');
  await expect(page.getByRole('region', { name: '待发送附件' })).toContainText('keep.txt');
  await expect(input).toHaveText('<img src=x onerror=alert(1)> literal');
});

for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: turn activity streams openly then collapses with persisted elapsed time`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const host = window as TestWindow & {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previous = host.__TAURI_INTERNALS__.invoke;
      host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
        const request = args.message as { method: string; id: number } | undefined;
        if (name !== 'agent_send' || request?.method !== 'session/prompt')
          return previous(name, args);
        host.__desktopMock.calls.push({ command: name, args });
        const emit = (message: unknown) =>
          host.__desktopMock.emitEvent('marklyra:agent-event', {
            connectionId: args.connectionId,
            kind: 'message',
            message,
          });
        const update = (update: unknown) =>
          emit({
            jsonrpc: '2.0',
            method: 'session/update',
            params: { sessionId: 'provider-session', update },
          });
        setTimeout(() => {
          update({
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: '先核实文档内容，再整理要点。' },
          });
          update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '我会先读取指定文档。' },
          });
          update({
            sessionUpdate: 'tool_call',
            toolCallId: 'read-1',
            title: '读取文档',
            kind: 'read',
            status: 'in_progress',
            content: [{ type: 'content', content: { type: 'text', text: '工具的初始输出。' } }],
          });
          Reflect.set(window, '__updateActivityOutput', () =>
            update({
              sessionUpdate: 'tool_call_update',
              toolCallId: 'read-1',
              content: [{ type: 'content', content: { type: 'text', text: '工具的后续输出。' } }],
            }),
          );
          Reflect.set(window, '__completeActivity', () => {
            update({
              sessionUpdate: 'tool_call_update',
              toolCallId: 'read-1',
              status: 'completed',
              content: [{ type: 'content', content: { type: 'text', text: '已读取文件正文。' } }],
            });
            update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '文档总结：结构清楚，建议补充示例。' },
            });
            emit({ jsonrpc: '2.0', id: request.id, result: { stopReason: 'end_turn' } });
          });
        }, 20);
        return null;
      };
    });
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await startConversation(page);
    const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await input.fill('总结文档');
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    const activity = page.locator('.ai-turn-activity');
    await expect(activity).toHaveAttribute('open', '');
    await expect(activity).toContainText('正在处理');
    await expect(activity.getByText('我会先读取指定文档。')).toBeVisible();
    await expect(activity.getByText('读取文档', { exact: false })).toBeVisible();
    await expect(activity.locator('.ai-message-actions')).toHaveCount(0);
    const tool = activity.locator('.ai-message-tool details');
    await expect(tool).not.toHaveAttribute('open');
    await expect(tool.getByText('工具的初始输出。')).not.toBeVisible();
    await tool.locator('summary').click();
    await expect(tool.getByText('工具的初始输出。')).toBeVisible();
    await page.evaluate(() => Reflect.get(window, '__updateActivityOutput')());
    await expect(tool).toHaveAttribute('open', '');
    await expect(tool.getByText('工具的后续输出。')).toBeVisible();
    await tool.locator('summary').click();
    await page.evaluate(() => Reflect.get(window, '__completeActivity')());
    await expect(activity).not.toHaveAttribute('open');
    await expect(activity.locator(':scope > summary')).toContainText('用时');
    await expect(page.getByText('文档总结：结构清楚，建议补充示例。')).toBeVisible();
    await expect(activity.getByText('我会先读取指定文档。')).not.toBeVisible();
    const summary = (await activity.locator(':scope > summary').textContent()) ?? '';
    await activity.locator(':scope > summary').click();
    await expect(activity.getByText('我会先读取指定文档。')).toBeVisible();
    await activity.hover();
    await expect(activity.locator('.ai-message-actions, time')).toHaveCount(0);
    await expect(page.locator('.ai-turn > .ai-message-user .ai-message-actions')).toHaveCount(1);
    await expect(page.locator('.ai-turn > .ai-message-assistant .ai-message-actions')).toHaveCount(
      1,
    );
    await expect(tool).not.toHaveAttribute('open');
    await expect(tool.getByText('已读取文件正文。')).not.toBeVisible();
    await tool.locator('summary').click();
    await expect(tool.getByText('已读取文件正文。')).toBeVisible();
    await activity.screenshot({ path: info.outputPath(`${theme}-expanded-process.png`) });
    await page.getByRole('button', { name: 'AI 历史会话' }).click();
    await page.locator('.ai-history-open').first().click();
    await expect(activity).not.toHaveAttribute('open');
    await expect(activity.locator(':scope > summary')).toHaveText(summary);
    await activity.locator(':scope > summary').click();
    await expect(tool).not.toHaveAttribute('open');
    await expect(activity.locator('.ai-message-actions')).toHaveCount(0);
    await activity.locator(':scope > summary').click();
    await page
      .locator('.ai-panel')
      .screenshot({ path: info.outputPath(`${theme}-collapsed-process.png`) });
  });
}

test('deleted mentions and removed uploads do not remain in the submitted context; attachment shelf scrolls horizontally', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await openLayoutDocument(page);
  await page.getByRole('button', { name: '移除上下文 Layout.md' }).click();
  await input.fill('@Layout');
  await input.press('Enter');
  await expect(input.locator('a[data-reference="Layout.md"]')).toBeVisible();
  await input.fill('移除提及');
  await expect(page.getByRole('button', { name: '移除上下文 Layout.md' })).toHaveCount(0);
  await input.fill('请看 @Other');
  await input.press('Enter');
  await expect(input.locator('a')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '移除上下文 Notes/Other.md' })).toHaveCount(0);
  await input.fill('只使用保留的附件');
  await page.getByLabel('选择附件').setInputFiles(
    Array.from({ length: 6 }, (_, i) => ({
      name: `说明文件-${i}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`content-${i}`),
    })),
  );
  const rail = page.getByRole('region', { name: '待发送附件' });
  await expect(rail.locator('.ai-attachment-item')).toHaveCount(6);
  expect(await rail.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const first = rail.locator('.ai-attachment-item').first();
  await first.hover();
  await expect(first.getByRole('button', { name: '移除附件 说明文件-0.txt' })).toHaveCSS(
    'opacity',
    '1',
  );
  await first.getByRole('button', { name: '移除附件 说明文件-0.txt' }).click();
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
  const calls = await page.evaluate(() => (window as TestWindow).__desktopMock.calls);
  expect(
    JSON.stringify(calls.filter((call) => call.command === 'agent_context').at(-1)?.args),
  ).not.toContain('Notes/Other.md');
  const uploads = calls.find((call) => call.command === 'agent_store_attachments')?.args
    ?.uploads as { name: string }[];
  expect(
    calls.filter((call) => call.command === 'agent_context').at(-1)?.args?.context,
  ).toMatchObject({ references: [] });
  expect(uploads).toHaveLength(5);
  expect(uploads.some((file) => file.name === '说明文件-0.txt')).toBe(false);
  await expect(page.locator('.ai-message-body .ai-message-references')).toHaveCount(0);
});

test('mentioning the automatic document retains its explicit context across document navigation', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await openLayoutDocument(page);
  const input = page.getByRole('textbox', { name: '发送给 AI 的消息' });
  await input.fill('@Layout');
  await input.press('Enter');
  await input.press('End');
  await page.keyboard.type(' @Other');
  await input.press('Enter');
  await input.locator('a[data-reference="Notes/Other.md"]').click();
  await expect(
    page.frameLocator('.runtime-area .marklyra-editor-frame').locator('#write h1'),
  ).toHaveText('Other');
  await expect(input.locator('a')).toHaveCount(2);
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('log')).toContainText('已阅读');
  const context = await page.evaluate(
    () =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'agent_context')
        .at(-1)?.args?.context,
  );
  expect(context).toMatchObject({
    references: ['Layout.md', 'Notes/Other.md'],
    active: 'Notes/Other.md',
  });
  await expect(page.getByRole('button', { name: '移除上下文 Layout.md' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '移除上下文 Notes/Other.md' })).toBeVisible();
});

function mockHistoryInventory() {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const original = host.__TAURI_INTERNALS__.invoke;
  const inventory = [
    { id: 'history-a', title: '很长的会话标题'.repeat(20), archived: false },
    { id: 'history-b', title: '第二个会话', archived: false },
    { id: 'history-c', title: '保留的会话', archived: false },
    { id: 'archive-a', title: '归档甲', archived: true },
    { id: 'archive-b', title: '归档乙', archived: true },
  ].map((item) => ({
    ...item,
    profileId: 'codex-profile',
    agentId: 'codex-acp',
    agentName: 'Codex',
    rootPath: '/mock/layout',
    providerSessionId: `provider-${item.id}`,
    createdAt: 10,
    updatedAt: 20,
  }));
  Reflect.set(window, '__historyInventory', inventory);
  host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
    if (name === 'agent_history') return inventory;
    if (name !== 'agent_manage_session') return original(name, args);
    host.__desktopMock.calls.push({ command: name, args });
    const item = inventory.find((item) => item.id === args.id);
    if (!item) throw Error('Missing history');
    if (args.action === 'delete') {
      if (!item.archived) throw Error('Archive required');
      if (Reflect.get(window, '__failHistoryDelete') === item.id) throw Error('测试：记录被占用');
      if (Reflect.get(window, '__holdHistoryDelete'))
        await new Promise<void>((resolve) =>
          Reflect.set(window, '__releaseHistoryDelete', resolve),
        );
      inventory.splice(inventory.indexOf(item), 1);
    } else if (args.action === 'rename') item.title = String(args.title);
    else item.archived = args.action === 'archive';
    return null;
  };
}
for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: history rows stay inline and bulk selection is scoped to search and tab`, async ({
    page,
  }, info) => {
    await installLayout(page);
    await page.addInitScript(mockAgents);
    await page.addInitScript(mockHistoryInventory);
    await readyLayout(page, theme);
    await emitLayoutMenu(page, 'open-folder');
    await emitLayoutMenu(page, 'view:ai');
    await page.getByRole('button', { name: 'AI 历史会话' }).click();
    const history = page.locator('.ai-history');
    await expect(history.locator('.ai-history-list article')).toHaveCount(3);
    // Also check the minimum supported panel width, leaving actions beside the title.
    await page.locator('.ai-history').evaluate((element) => {
      (element as HTMLElement).style.width = '280px';
      (element as HTMLElement).style.boxSizing = 'border-box';
    });
    const metrics = await history
      .locator('.ai-history-list article')
      .first()
      .evaluate((row) => {
        const title = row.querySelector('strong') as HTMLElement;
        const open = row.querySelector('.ai-history-open') as HTMLElement;
        const actions = row.querySelector('.ai-history-actions') as HTMLElement;
        const a = open.getBoundingClientRect(),
          b = actions.getBoundingClientRect();
        return {
          ellipsis: getComputedStyle(title).textOverflow,
          truncated: title.scrollWidth > title.clientWidth,
          aligned: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 2,
          fits: row.scrollWidth <= row.clientWidth,
        };
      });
    expect(metrics).toEqual({ ellipsis: 'ellipsis', truncated: true, aligned: true, fits: true });
    await history.locator('.ai-history-list input[type=checkbox]').first().check();
    await expect(page.getByRole('checkbox', { name: '全选当前列表' })).toHaveJSProperty(
      'indeterminate',
      true,
    );
    await page.getByRole('checkbox', { name: '全选当前列表' }).check();
    await expect(page.getByText('已选 3 项')).toBeVisible();
    await page.getByRole('textbox', { name: '搜索 AI 会话' }).fill('第二个');
    await expect(page.getByRole('checkbox', { name: '全选当前列表' })).not.toBeChecked();
    await page.getByRole('checkbox', { name: '全选当前列表' }).check();
    await page.getByRole('button', { name: '删除所选' }).click();
    const dialog = page.getByRole('dialog', { name: '彻底移除会话' });
    await expect(dialog).toContainText('选中的 1 个会话');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    expect(
      await page.evaluate(() =>
        (window as TestWindow).__desktopMock.calls.filter(
          (call) => call.command === 'agent_manage_session',
        ),
      ),
    ).toHaveLength(0);
    await page.getByRole('button', { name: '删除所选' }).click();
    await dialog.getByRole('button', { name: '彻底移除', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const operations = await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'agent_manage_session')
        .map((call) => [call.args?.id, call.args?.action]),
    );
    expect(operations).toEqual([
      ['history-b', 'archive'],
      ['history-b', 'delete'],
    ]);
    await page.getByRole('textbox', { name: '搜索 AI 会话' }).fill('');
    await page.getByRole('checkbox', { name: '全选当前列表' }).check();
    await page.getByRole('button', { name: '已归档', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '全选当前列表' })).not.toBeChecked();
    await page.getByRole('textbox', { name: '搜索 AI 会话' }).fill('归档甲');
    await page.getByRole('button', { name: '清空归档', exact: true }).click();
    const clear = page.getByRole('dialog', { name: '清空归档' });
    await expect(clear).toContainText('全部 2 个归档会话，不受搜索筛选影响');
    await clear.screenshot({ path: info.outputPath(`${theme}-clear-archives.png`) });
    await clear.getByRole('button', { name: '清空归档', exact: true }).click();
    await expect(clear).not.toBeVisible();
    await page.getByRole('textbox', { name: '搜索 AI 会话' }).fill('');
    await expect(page.getByText('暂无已归档会话')).toBeVisible();
    await expect(page.getByRole('button', { name: '清空归档', exact: true })).toBeDisabled();
    const remaining = await page.evaluate(() =>
      (Reflect.get(window, '__historyInventory') as { id: string }[]).map((item) => item.id),
    );
    expect(remaining).toEqual(['history-a', 'history-c']);
    await page.getByRole('button', { name: '会话', exact: true }).click();
    await history.screenshot({ path: info.outputPath(`${theme}-compact-history.png`) });
  });
}

test('bulk deletion retains failed items for retry and locks controls while deleting', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(mockHistoryInventory);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await page.getByRole('button', { name: 'AI 历史会话' }).click();
  await page.getByRole('checkbox', { name: '全选当前列表' }).check();
  await page.evaluate(() => Reflect.set(window, '__failHistoryDelete', 'history-b'));
  await page.getByRole('button', { name: '删除所选' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '彻底移除', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    '已删除 2 项，1 项未完成',
  );
  await expect(page.getByRole('dialog')).toContainText('第二个会话');
  await page.evaluate(() => {
    Reflect.set(window, '__failHistoryDelete', null);
    Reflect.set(window, '__holdHistoryDelete', true);
  });
  await page.getByRole('button', { name: '重试删除 1 项' }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'AI 历史会话' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => Reflect.get(window, '__releaseHistoryDelete')());
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      (Reflect.get(window, '__historyInventory') as { id: string }[]).map((item) => item.id),
    ),
  ).toEqual(['archive-a', 'archive-b']);
  const operations = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((call) => call.command === 'agent_manage_session' && call.args?.id === 'history-b')
      .map((call) => call.args?.action),
  );
  expect(operations).toEqual(['archive', 'delete', 'delete']);
});

test('archive selection covers paged results and deletes only selected archives', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(mockHistoryInventory);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await page.evaluate(() => {
    const inventory = Reflect.get(window, '__historyInventory') as Record<string, unknown>[];
    const source = inventory[3];
    for (let n = 0; n < 83; n++)
      inventory.push({ ...source, id: `extra-${n}`, title: `归档-${n}` });
  });
  await page.getByRole('button', { name: 'AI 历史会话' }).click();
  await page.getByRole('button', { name: '已归档', exact: true }).click();
  await expect(page.locator('.ai-history-list article')).toHaveCount(80);
  await page.getByRole('checkbox', { name: '全选当前列表' }).check();
  await expect(page.getByText('已选 85 项')).toBeVisible();
  await page.getByRole('button', { name: '显示更多（还有 5 项）' }).click();
  await expect(page.locator('.ai-history-list article')).toHaveCount(85);
  await page.getByRole('checkbox', { name: '全选当前列表' }).uncheck();
  await page.getByRole('checkbox', { name: '选择会话 归档甲', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择会话 归档乙', exact: true }).check();
  await page.getByRole('button', { name: '删除所选' }).click();
  const dialog = page.getByRole('dialog', { name: '删除所选会话' });
  await expect(dialog).toContainText('选中的 2 个会话');
  await dialog.getByRole('button', { name: '彻底移除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const operations = await page.evaluate(() =>
    (window as TestWindow).__desktopMock.calls
      .filter((call) => call.command === 'agent_manage_session')
      .map((call) => [call.args?.id, call.args?.action]),
  );
  expect(operations).toEqual([
    ['archive-a', 'delete'],
    ['archive-b', 'delete'],
  ]);
});

test('deleting an active running conversation requires stopping before any mutation', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const original = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
      const request = args.message as { id: number; method: string } | undefined;
      if (name !== 'agent_send' || request?.method !== 'session/prompt')
        return original(name, args);
      Reflect.set(window, '__endBusyHistoryTest', () =>
        host.__desktopMock.emitEvent('marklyra:agent-event', {
          connectionId: args.connectionId,
          kind: 'message',
          message: { jsonrpc: '2.0', id: request.id, result: { stopReason: 'end_turn' } },
        }),
      );
      return null;
    };
  });
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('当前运行中的会话');
  await page.getByRole('button', { name: '发送 AI 消息' }).click();
  await expect(page.getByRole('button', { name: '停止 AI 任务' })).toBeVisible();
  await page.getByRole('button', { name: 'AI 历史会话' }).click();
  await page.getByRole('checkbox', { name: '全选当前列表' }).check();
  await page.getByRole('button', { name: '删除所选' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '彻底移除', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('请先停止当前任务');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) => call.command === 'agent_manage_session',
      ),
    ),
  ).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => Reflect.get(window, '__endBusyHistoryTest')());
  await expect(page.locator('.ai-history-open')).toHaveCount(1);
});

async function openImageViewerFixture(page: import('@playwright/test').Page, theme: string) {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const host = window as TestWindow & {
      __TAURI_INTERNALS__: {
        invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    const original = host.__TAURI_INTERNALS__.invoke;
    host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
      if (name !== 'agent_preview_image') return original(name, args);
      host.__desktopMock.calls.push({ command: name, args });
      return Reflect.get(window, '__cancelImageSave') !== true;
    };
  });
  await readyLayout(page, theme);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:ai');
  await startConversation(page);
  await openLayoutDocument(page);
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    const context = canvas.getContext('2d');
    if (!context) throw Error('No canvas');
    context.fillStyle = '#aac8e5';
    context.fillRect(0, 0, 640, 400);
    context.fillStyle = '#31526c';
    context.fillRect(60, 60, 520, 280);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  await page.getByLabel('选择附件').setInputFiles({
    name: 'preview.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await page.screenshot({ path: test.info().outputPath(`${theme}-viewer-host.png`) });
  await page.getByRole('button', { name: '预览附件 preview.png' }).click();
  await expect(page.getByRole('dialog', { name: 'preview.png', exact: true })).toBeVisible();
  return data;
}
for (const theme of ['marklyra-light', 'marklyra-dark']) {
  test(`${theme}: image viewer is inset, flat and has one close control with working zoom and native copy actions`, async ({
    page,
  }, info) => {
    const data = await openImageViewerFixture(page, theme);
    const viewer = page.getByRole('dialog', { name: 'preview.png', exact: true });
    const bounds = await viewer.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds?.x).toBe(8);
    expect(bounds?.y).toBe(8);
    expect(bounds?.width).toBe((viewport?.width ?? 0) - 16);
    expect(bounds?.height).toBe((viewport?.height ?? 0) - 16);
    await expect(viewer).toHaveCSS('box-shadow', 'none');
    await expect(viewer.getByRole('img', { name: 'preview.png' })).toHaveCSS('box-shadow', 'none');
    await expect(viewer.getByRole('button', { name: /关闭/ })).toHaveCount(1);
    await expect(viewer.locator('.ai-dialog-heading, .ai-dialog-footer')).toHaveCount(0);
    await expect(viewer).toBeFocused();
    await viewer.getByRole('combobox', { name: '图片缩放' }).selectOption('2');
    await expect(viewer.locator('.ai-viewer-surface')).toHaveCSS('width', '1280px');
    await viewer.getByRole('application', { name: '图片查看区域' }).focus();
    await viewer.getByRole('application', { name: '图片查看区域' }).press('ArrowDown');
    expect(
      await viewer.locator('.ai-viewer-stage').evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await viewer.getByRole('application', { name: '图片查看区域' }).press('Home');
    await expect(viewer.getByRole('combobox', { name: '图片缩放' })).toHaveValue('fit');
    await viewer.getByRole('button', { name: '打开', exact: true }).click();
    await expect(viewer.getByRole('status')).toContainText('已在默认应用打开');
    await viewer.getByRole('button', { name: '下载图片' }).click();
    await expect(viewer.getByRole('status')).toContainText('图片已保存');
    const calls = await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'agent_preview_image')
        .map((call) => call.args),
    );
    expect(calls.map((args) => args?.action)).toEqual(['open', 'save']);
    await viewer.getByRole('combobox', { name: '图片打开方式' }).selectOption('save');
    await expect(viewer.getByRole('status')).toContainText('图片已保存');
    expect(
      calls.every((args) => (args?.upload as { data: string } | undefined)?.data === data),
    ).toBe(true);
    await viewer.screenshot({ path: info.outputPath(`${theme}-image-viewer.png`) });
    await page.keyboard.press('Escape');
    await expect(viewer).not.toBeVisible();
    await expect(page.getByRole('button', { name: '预览附件 preview.png' })).toBeFocused();
  });
  test(`${theme}: local image annotation, comments, resize and undo export a copy and protect unsaved changes`, async ({
    page,
  }, info) => {
    const original = await openImageViewerFixture(page, theme);
    const viewer = page.getByRole('dialog', { name: 'preview.png', exact: true });
    await viewer.getByRole('button', { name: '标注', exact: true }).click();
    const canvas = viewer.locator('canvas');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw Error('No image');
    await page.mouse.move(bounds.x + 70, bounds.y + 70);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 200, bounds.y + 180, { steps: 10 });
    await page.mouse.up();
    await expect(viewer.getByRole('status')).toContainText('已添加标注');
    await viewer.getByRole('button', { name: '添加评论', exact: true }).click();
    await canvas.click({ position: { x: 180, y: 100 } });
    await viewer.getByRole('textbox', { name: '图片评论' }).fill('这里需要关注');
    await viewer.getByRole('textbox', { name: '图片评论' }).press('Enter');
    await expect(viewer.getByRole('status')).toContainText('评论已添加');
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await viewer.getByRole('button', { name: '调整大小', exact: true }).click();
    await viewer.getByRole('spinbutton', { name: '图片宽度' }).fill('320');
    await expect(viewer.getByRole('spinbutton', { name: '图片高度' })).toHaveValue('200');
    await viewer.getByRole('button', { name: '应用', exact: true }).click();
    await expect(viewer.locator('.ai-viewer-surface')).toHaveCSS('width', '320px');
    expect(await viewer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await viewer.getByRole('button', { name: '撤销图片修改' }).click();
    await expect(viewer.locator('.ai-viewer-surface')).toHaveCSS('width', '640px');
    await viewer.getByRole('button', { name: '调整大小', exact: true }).click();
    await viewer.getByRole('spinbutton', { name: '图片宽度' }).fill('320');
    await viewer.getByRole('button', { name: '应用', exact: true }).click();
    await page.evaluate(() => Reflect.set(window, '__cancelImageSave', true));
    await viewer.getByRole('button', { name: '下载图片' }).click();
    await expect(viewer.getByRole('status')).toContainText('已取消保存');
    await viewer.getByRole('button', { name: '关闭图片预览' }).click();
    await expect(page.getByRole('dialog', { name: '放弃图片修改' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '放弃图片修改' })).not.toBeVisible();
    await expect(viewer).toBeVisible();
    await page.evaluate(() => Reflect.set(window, '__cancelImageSave', false));
    await viewer.getByRole('button', { name: '下载图片' }).click();
    await expect(viewer.getByRole('status')).toContainText('图片已保存');
    const exported = await page.evaluate(async () => {
      const call = (window as TestWindow).__desktopMock.calls
        .filter((call) => call.command === 'agent_preview_image')
        .at(-1);
      const upload = call?.args?.upload as { data: string; mimeType: string };
      const image = new Image();
      image.src = `data:${upload.mimeType};base64,${upload.data}`;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight, data: upload.data };
    });
    expect(exported.width).toBe(320);
    expect(exported.height).toBe(200);
    expect(exported.data).not.toBe(original);
    await viewer.screenshot({ path: info.outputPath(`${theme}-image-edited.png`) });
    await viewer.getByRole('button', { name: '关闭图片预览' }).click();
    await page.getByRole('button', { name: '预览附件 preview.png' }).click();
    await expect(viewer.getByRole('img')).toHaveAttribute(
      'src',
      `data:image/png;base64,${original}`,
    );
    await expect(viewer.getByRole('button', { name: '撤销图片修改' })).toHaveCount(0);
    await viewer.getByRole('button', { name: '添加评论', exact: true }).click();
    await viewer.locator('canvas').click();
    await viewer.getByRole('textbox', { name: '图片评论' }).fill('放弃这条评论');
    await viewer.getByRole('textbox', { name: '图片评论' }).press('Enter');
    await viewer.getByRole('button', { name: '关闭图片预览' }).click();
    await page
      .getByRole('dialog', { name: '放弃图片修改' })
      .getByRole('button', { name: '放弃修改', exact: true })
      .click();
    await expect(viewer).not.toBeVisible();
  });
}

test('fallback image viewer protects pending edits and nested confirmations keep focus inside', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      value: undefined,
      configurable: true,
    });
  });
  await openImageViewerFixture(page, 'marklyra-light');
  const viewer = page.getByRole('dialog', { name: 'preview.png', exact: true });
  await expect(viewer).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('.ai-viewer-fallback-backdrop')).toHaveCSS('background-color', /0\.25/);
  await viewer.getByRole('button', { name: '添加评论', exact: true }).click();
  await viewer.locator('canvas').click();
  await viewer.getByRole('textbox', { name: '图片评论' }).fill('尚未提交的评论');
  await viewer.getByRole('button', { name: '下载图片' }).click();
  await expect(viewer.getByRole('alert')).toContainText('请先点击“添加”');
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.some(
        (call) => call.command === 'agent_preview_image',
      ),
    ),
  ).toBe(false);
  await viewer.getByRole('button', { name: '关闭图片预览' }).click();
  const confirm = page.getByRole('dialog', { name: '放弃图片修改' });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await confirm.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(confirm).not.toBeVisible();
  await expect(viewer.getByRole('textbox', { name: '图片评论' })).toHaveValue('尚未提交的评论');
  await viewer.getByRole('textbox', { name: '图片评论' }).press('Enter');
  await viewer.getByRole('button', { name: '添加评论', exact: true }).click();
  await viewer.getByRole('application', { name: '图片查看区域' }).focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(viewer.getByRole('button', { name: '撤销图片修改' })).toHaveCount(0);
  await viewer.getByRole('button', { name: '关闭图片预览' }).click();
  await expect(viewer).not.toBeVisible();
});

for (const titlebar of ['appkit', 'web'] as const)
  test(`${titlebar}: background approval stays visible as a badge without stealing editor focus`, async ({
    page,
  }, info) => {
    await installLayout(page, undefined, titlebar);
    await page.addInitScript(mockAgents);
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const host = window as TestWindow & {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previous = host.__TAURI_INTERNALS__.invoke;
      host.__TAURI_INTERNALS__.invoke = async (name, args = {}) => {
        const message = args.message as { method?: string } | undefined;
        if (name === 'agent_send' && message?.method === 'session/prompt') return null;
        return previous(name, args);
      };
    });
    await readyLayout(page, 'marklyra-light');
    await emitLayoutMenu(page, 'view:ai');
    await page.getByRole('button', { name: '打开文件夹', exact: true }).click();
    await startConversation(page);
    await openLayoutDocument(page);
    await page.getByRole('textbox', { name: '发送给 AI 的消息' }).fill('运行命令');
    await page.getByRole('button', { name: '发送 AI 消息' }).click();
    await expect(page.getByRole('button', { name: '停止 AI 任务' })).toBeVisible();
    await emitLayoutMenu(page, 'view:ai');
    const editor = page.locator('.runtime-area iframe');
    await page.frameLocator('.runtime-area iframe').locator('#write').click();
    const emit = async (connectionId = 'connection-1') =>
      page.evaluate((connectionId) => {
        const host = window as TestWindow;
        host.__desktopMock.emitEvent('marklyra:agent-event', {
          connectionId,
          kind: 'message',
          message: {
            jsonrpc: '2.0',
            id: 'attention-approval',
            method: 'session/request_permission',
            params: {
              sessionId: 'provider-session',
              toolCall: { title: '运行 shell 命令', kind: 'execute' },
              options: [
                { optionId: 'deny', name: '拒绝', kind: 'reject_once' },
                { optionId: 'once', name: '允许本次', kind: 'allow_once' },
              ],
            },
          },
        });
      }, connectionId);
    await emit('other-window');
    await expect(page.locator('.ai-attention-indicator')).toHaveCount(0);
    await emit();
    await emit();
    await expect(page.locator('.ai-attention-indicator')).toHaveText('AI 等待处理 · 1');
    await expect(page.locator('.ai-panel')).toBeHidden();
    await expect(editor).toBeFocused();
    await page.getByRole('button', { name: 'AI 等待处理 · 1' }).click();
    await expect(page.getByRole('region', { name: '待处理授权' })).toBeFocused();
    await page.screenshot({ path: info.outputPath('approval-attention.png') });
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await expect(page.locator('.ai-attention-indicator')).toHaveCount(0);
    const decisions = await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls.filter(
        (call) =>
          call.command === 'agent_send' &&
          (call.args.message as { id?: string })?.id === 'attention-approval',
      ),
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.args.message).toMatchObject({
      result: { outcome: { outcome: 'selected', optionId: 'deny' } },
    });
    await emit();
    await expect(page.locator('.ai-attention-indicator')).toBeVisible();
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.emitEvent('marklyra:agent-event', {
        connectionId: 'connection-1',
        kind: 'closed',
      }),
    );
    await expect(page.locator('.ai-attention-indicator')).toHaveCount(0);
  });

test('attention preference survives settings reload while authorization remains available', async ({
  page,
}) => {
  await installLayout(page);
  await page.addInitScript(mockAgents);
  await readyLayout(page, 'marklyra-light');
  await emitLayoutMenu(page, 'view:ai');
  await page.getByRole('button', { name: '智能体设置', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'AI 等待授权时提醒我' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});
