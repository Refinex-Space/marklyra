import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentProfile, RpcMessage } from '../src/features/ai/types.js';

const bridge = vi.hoisted(() => ({
  listener: null as ((event: AgentEvent) => void) | null,
  invoke: vi.fn(),
  sent: [] as RpcMessage[],
  promptId: 0,
}));
vi.mock('../src/features/ai/api.js', () => ({
  agentApi: {
    invoke: bridge.invoke,
    events: async (callback: (event: AgentEvent) => void) => {
      bridge.listener = callback;
      return () => {
        bridge.listener = null;
      };
    },
  },
}));

import { AgentSession } from '../src/features/ai/session.js';

const profile: AgentProfile = {
  id: 'p',
  agentId: 'codex-acp',
  name: 'Codex',
  executable: '/agent',
  args: [],
  env: {},
  secretKeys: [],
  version: '1',
  managedPath: null,
  enabled: true,
  mcpEnabled: true,
};
const sessions: AgentSession[] = [];
function event(message: RpcMessage) {
  bridge.listener?.({ connectionId: 'connection', kind: 'message', message });
}
function make() {
  const host = {
    beforeWrite: vi.fn(async () => {}),
    changed: vi.fn(),
    snapshot: vi.fn(async () => ({
      documentId: 'document',
      path: '/workspace/a.md',
      text: 'unsaved draft',
      dirty: true,
    })),
  };
  const session = new AgentSession(profile, { id: 'workspace', path: '/workspace' }, host);
  sessions.push(session);
  return { session, host };
}
beforeEach(() => {
  bridge.listener = null;
  bridge.sent = [];
  bridge.promptId = 0;
  bridge.invoke.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  bridge.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === 'agent_connect') return { connectionId: 'connection', mcpServers: [] };
    if (command === 'agent_context') return args.context;
    if (command === 'agent_client_operation') return { content: 'document' };
    if (command === 'agent_send') {
      const message = args.message as RpcMessage;
      bridge.sent.push(message);
      if (message.method === 'session/prompt') {
        bridge.promptId = Number(message.id);
        return;
      }
      if (message.id !== undefined && message.method) {
        const result =
          message.method === 'initialize'
            ? { protocolVersion: 1, agentCapabilities: { loadSession: true } }
            : message.method === 'session/new'
              ? { sessionId: 'session' }
              : {};
        const id = message.id;
        queueMicrotask(() => event({ jsonrpc: '2.0', id, result }));
      }
    }
  });
});
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.disconnect();
  vi.unstubAllGlobals();
});

describe('ACP session lifecycle', () => {
  it('passes the editor snapshot only when explicitly attached and streams the answer', async () => {
    const { session, host } = make();
    const pending = session.prompt('Explain', ['a.md'], 'a.md', true);
    await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(0));
    expect(host.snapshot).toHaveBeenCalledOnce();
    expect(bridge.invoke).toHaveBeenCalledWith(
      'agent_context',
      expect.objectContaining({
        context: expect.objectContaining({
          snapshot: expect.objectContaining({ text: 'unsaved draft' }),
        }),
      }),
    );
    event({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'session',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Answer' } },
      },
    });
    event({ jsonrpc: '2.0', id: bridge.promptId, result: { stopReason: 'end_turn' } });
    expect(await pending).toBe(true);
    expect(session.snapshot().phase).toBe('ready');
    expect(session.snapshot().record.messages.at(-1)?.text).toBe('Answer');
    const user = session.snapshot().record.messages[0];
    expect(user?.completedAt).toBeGreaterThanOrEqual(user?.createdAt ?? 0);
    const finished = user?.completedAt;
    await session.disconnect();
    expect(session.snapshot().record.messages[0]?.completedAt).toBe(finished);
  });
  it('requires a current user decision before host writes and rejects after cancel', async () => {
    const { session, host } = make();
    const pending = session.prompt('Edit', [], null);
    await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(0));
    event({
      jsonrpc: '2.0',
      id: 'write',
      method: 'fs/write_text_file',
      params: { sessionId: 'session', path: '/workspace/a.md', content: 'changed' },
    });
    await vi.waitFor(() => expect(session.snapshot().interactions).toHaveLength(1));
    expect(bridge.invoke.mock.calls.some(([name]) => name === 'agent_client_operation')).toBe(
      false,
    );
    await session.cancel();
    await session.decide(JSON.stringify('write'), 'allow');
    expect(host.beforeWrite).not.toHaveBeenCalled();
    expect(bridge.invoke.mock.calls.some(([name]) => name === 'agent_client_operation')).toBe(
      false,
    );
    event({ jsonrpc: '2.0', id: bridge.promptId, result: { stopReason: 'cancelled' } });
    await pending;
    expect(session.snapshot().interactions).toHaveLength(0);
  });
  it('does not replay an uncertain task after process disconnect', async () => {
    const { session } = make();
    const pending = session.prompt('Write', [], null);
    await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(0));
    bridge.listener?.({ connectionId: 'connection', kind: 'closed', error: 'exit' });
    await pending;
    expect(session.snapshot().phase).toBe('disconnected');
    expect(bridge.sent.filter((m) => m.method === 'session/prompt')).toHaveLength(1);
    expect(session.snapshot().error).toContain('未确认');
  });
  it('foreign session updates cannot change the visible transcript', async () => {
    const { session } = make();
    await session.connect();
    event({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'foreign',
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'wrong' } },
      },
    });
    expect(session.snapshot().record.messages).toHaveLength(0);
  });
});

it('a delayed approval from a disconnected generation cannot execute or cancel a new turn', async () => {
  const { session, host } = make();
  let release = () => {};
  host.beforeWrite.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = session.prompt('Old edit', [], null);
  await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(0));
  event({
    jsonrpc: '2.0',
    id: 'late-write',
    method: 'fs/write_text_file',
    params: { sessionId: 'session', path: '/workspace/a.md', content: 'old' },
  });
  await vi.waitFor(() => expect(session.snapshot().interactions).toHaveLength(1));
  const decision = session.decide(JSON.stringify('late-write'), 'allow');
  await vi.waitFor(() => expect(host.beforeWrite).toHaveBeenCalledOnce());
  await session.disconnect();
  await first;
  await session.connect();
  const previousId = bridge.promptId;
  const second = session.prompt('New turn', [], null);
  await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(previousId));
  release();
  await decision;
  expect(bridge.invoke.mock.calls.some(([name]) => name === 'agent_client_operation')).toBe(false);
  expect(session.snapshot().phase).toBe('running');
  event({ jsonrpc: '2.0', id: bridge.promptId, result: { stopReason: 'end_turn' } });
  expect(await second).toBe(true);
});

it('prepares advertised configuration before a prompt and shares the pending handshake', async () => {
  const original = bridge.invoke.getMockImplementation();
  if (!original) throw new Error('Missing test bridge');
  let initialization: RpcMessage | undefined;
  const options = [
    {
      id: 'model',
      name: '模型',
      type: 'select',
      currentValue: 'fast',
      options: [
        { value: 'fast', name: 'Fast' },
        { value: 'deep', name: 'Deep' },
      ],
    },
  ];
  bridge.invoke.mockImplementation(async (command, args) => {
    const message = args?.message as RpcMessage | undefined;
    if (command === 'agent_send' && message?.method === 'initialize') {
      bridge.sent.push(message);
      initialization = message;
      return;
    }
    if (command === 'agent_send' && message?.method === 'session/new') {
      bridge.sent.push(message);
      queueMicrotask(() =>
        event({
          jsonrpc: '2.0',
          id: message.id ?? 0,
          result: { sessionId: 'session', configOptions: options },
        }),
      );
      return;
    }
    if (command === 'agent_send' && message?.method === 'session/set_config_option') {
      bridge.sent.push(message);
      const option = options[0];
      if (option) option.currentValue = 'deep';
      queueMicrotask(() =>
        event({ jsonrpc: '2.0', id: message.id ?? 0, result: { configOptions: options } }),
      );
      return;
    }
    return original(command, args);
  });
  const { session, host } = make();
  const first = session.connect();
  await vi.waitFor(() => expect(initialization).toBeDefined());
  expect(session.connect()).toBe(first);
  expect(session.snapshot().phase).toBe('connecting');
  event({ jsonrpc: '2.0', id: initialization?.id ?? 0, result: { protocolVersion: 1 } });
  await first;
  expect(session.snapshot().configOptions[0]?.currentValue).toBe('fast');
  await session.setOption('model', 'deep');
  expect(session.snapshot().configOptions[0]?.currentValue).toBe('deep');
  expect(session.snapshot().record.messages).toEqual([]);
  expect(host.snapshot).not.toHaveBeenCalled();
  expect(
    bridge.invoke.mock.calls.some(([name]) =>
      ['agent_context', 'agent_save_session'].includes(name),
    ),
  ).toBe(false);
  expect(bridge.sent.some((m) => m.method === 'session/prompt')).toBe(false);
});

it('releases a late native connection after preparation is cancelled', async () => {
  const original = bridge.invoke.getMockImplementation();
  if (!original) throw new Error('Missing test bridge');
  let release: ((value: unknown) => void) | undefined;
  bridge.invoke.mockImplementation((command, args) =>
    command === 'agent_connect'
      ? new Promise((resolve) => {
          release = resolve;
        })
      : original(command, args),
  );
  const { session } = make();
  const preparing = session.connect();
  await vi.waitFor(() => expect(release).toBeDefined());
  await session.disconnect();
  if (!release) throw new Error('Missing pending connection');
  release({ connectionId: 'abandoned', mcpServers: [] });
  await preparing;
  expect(bridge.invoke).toHaveBeenCalledWith('agent_disconnect', { connectionId: 'abandoned' });
  expect(bridge.sent).toEqual([]);
  expect(session.snapshot().phase).toBe('disconnected');
});

it('recreates an unused prepared session when the provider cannot load sessions', async () => {
  const original = bridge.invoke.getMockImplementation();
  if (!original) throw new Error('Missing test bridge');
  bridge.invoke.mockImplementation(async (command, args) => {
    const message = args?.message as RpcMessage | undefined;
    if (command === 'agent_send' && message?.method === 'initialize') {
      queueMicrotask(() =>
        event({ jsonrpc: '2.0', id: message.id ?? 0, result: { protocolVersion: 1 } }),
      );
      return;
    }
    return original(command, args);
  });
  const { session } = make();
  await session.connect();
  await session.reconnect();
  expect(session.snapshot().phase).toBe('ready');
  expect(bridge.sent.filter((message) => message.method === 'session/new')).toHaveLength(2);
  expect(bridge.sent.some((message) => message.method === 'session/load')).toBe(false);
});

it('commits attachments separately, preserves their ACP bytes and acknowledges before the reply', async () => {
  const original = bridge.invoke.getMockImplementation();
  if (!original) throw new Error('Missing bridge');
  bridge.invoke.mockImplementation(async (command, args) => {
    const message = args?.message as RpcMessage | undefined;
    if (command === 'agent_send' && message?.method === 'initialize') {
      queueMicrotask(() =>
        event({
          jsonrpc: '2.0',
          id: message.id ?? 0,
          result: {
            protocolVersion: 1,
            agentCapabilities: { promptCapabilities: { image: true, embeddedContext: true } },
          },
        }),
      );
      return;
    }
    if (command === 'agent_store_attachments')
      return [
        {
          id: 'saved-image',
          name: 'image.png',
          mimeType: 'image/png',
          size: 3,
          digest: 'a'.repeat(64),
        },
      ];
    return original(command, args);
  });
  const { session } = make();
  const accepted = vi.fn();
  const pending = session.prompt(
    '',
    [],
    null,
    false,
    [
      {
        id: 'draft-image',
        name: 'image.png',
        mimeType: 'image/png',
        size: 3,
        digest: 'a'.repeat(64),
        data: 'YWJj',
      },
    ],
    accepted,
  );
  await vi.waitFor(() => expect(bridge.promptId).toBeGreaterThan(0));
  expect(accepted).toHaveBeenCalledOnce();
  const user = session.snapshot().record.messages[0];
  expect(user?.attachments?.[0]?.id).toBe('saved-image');
  expect(user?.attachments?.[0]).not.toHaveProperty('data');
  expect(user?.createdAt).toBeGreaterThan(0);
  expect(bridge.sent.find((item) => item.method === 'session/prompt')?.params?.prompt).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image', data: 'YWJj', mimeType: 'image/png' }),
    ]),
  );
  event({ jsonrpc: '2.0', id: bridge.promptId, result: { stopReason: 'end_turn' } });
  expect(await pending).toBe(true);
});

it('cancelling attachment preparation discards unsent copies and restores a usable composer', async () => {
  const original = bridge.invoke.getMockImplementation();
  if (!original) throw new Error('Missing bridge');
  let release: ((value: unknown) => void) | undefined;
  bridge.invoke.mockImplementation(async (command, args) => {
    if (command === 'agent_store_attachments')
      return new Promise((resolve) => {
        release = resolve;
      });
    return original(command, args);
  });
  const { session } = make();
  const accepted = vi.fn();
  const pending = session.prompt(
    'read',
    [],
    null,
    false,
    [
      {
        id: 'draft',
        name: 'note.txt',
        mimeType: 'text/plain',
        size: 3,
        digest: 'a'.repeat(64),
        data: 'YWJj',
      },
    ],
    accepted,
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  await session.cancel();
  if (!release) throw Error('Missing pending import');
  release([
    { id: 'unsent', name: 'note.txt', mimeType: 'text/plain', size: 3, digest: 'a'.repeat(64) },
  ]);
  expect(await pending).toBe(false);
  expect(accepted).not.toHaveBeenCalled();
  expect(session.snapshot().phase).toBe('ready');
  expect(session.snapshot().record.messages).toHaveLength(0);
  expect(bridge.sent.some((message) => message.method === 'session/prompt')).toBe(false);
  expect(bridge.invoke).toHaveBeenCalledWith(
    'agent_discard_attachments',
    expect.objectContaining({ ids: ['unsent'] }),
  );
});
