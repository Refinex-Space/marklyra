import { agentApi } from './api.js';
import { attachmentBlocks, rememberAttachment } from './attachments.js';
import { configOptions, updateMessages } from './model.js';
import type { Attachment, DraftAttachment } from './types.js';
import {
  type AgentEvent,
  type AgentProfile,
  type Interaction,
  object,
  type RpcMessage,
  type SessionRecord,
  type SessionView,
  text,
} from './types.js';

export interface SessionHost {
  beforeWrite: (path?: string) => Promise<void>;
  changed: () => void;
  attention?: () => void;
  snapshot?: () => Promise<{
    documentId: string | null;
    path: string | null;
    text: string;
    dirty: boolean;
  }>;
}
interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One window, one provider session, one admitted turn. Hiding the panel never destroys a run. */
export class AgentSession {
  private view: SessionView;
  private listeners = new Set<() => void>();
  private pending = new Map<string | number, Pending>();
  private decisions = new Map<
    string,
    (value: string, form?: Record<string, unknown>) => Promise<void>
  >();
  private connectionId: string | null = null;
  private stopListening: (() => void) | null = null;
  private generation = 0;
  private turnId = '';
  private loading = false;
  private earlyUpdates: AgentEvent[] = [];
  private sequence = 0;
  private saveChain = Promise.resolve();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshFrame: number | null = null;
  private cancelTimer: ReturnType<typeof setTimeout> | null = null;
  private connectWork: Promise<void> | null = null;
  private capabilities: Record<string, unknown> = {};
  host: SessionHost;
  constructor(
    readonly profile: AgentProfile,
    readonly workspace: { id: string; path: string },
    host: SessionHost,
    record?: SessionRecord,
  ) {
    this.host = host;
    const now = Date.now();
    this.view = {
      record: record ?? {
        id: crypto.randomUUID(),
        profileId: profile.id,
        agentId: profile.agentId,
        agentName: profile.name,
        rootPath: workspace.path,
        providerSessionId: null,
        title: '新会话',
        createdAt: now,
        updatedAt: now,
        archived: false,
        messages: [],
      },
      phase: 'idle',
      promptCapabilities: { image: false, embeddedContext: false },
      error: null,
      authMethods: [],
      interactions: [],
      configOptions: [],
      modes: null,
      commands: [],
      usage: null,
    };
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SessionView>, throttle = false) {
    this.view = { ...this.view, ...patch };
    if (throttle) {
      this.refreshFrame ??= requestAnimationFrame(() => {
        this.refreshFrame = null;
        for (const listener of this.listeners) listener();
      });
    } else for (const listener of this.listeners) listener();
  }
  private record(patch: Partial<SessionRecord>) {
    this.publish(
      {
        record: {
          ...this.view.record,
          ...patch,
          updatedAt: Math.max(Date.now(), this.view.record.updatedAt + 1),
        },
      },
      true,
    );
  }
  private send(message: RpcMessage) {
    if (!this.connectionId) return Promise.reject(new Error('智能体尚未连接'));
    return agentApi.invoke<void>('agent_send', { connectionId: this.connectionId, message });
  }
  private request(
    method: string,
    params: Record<string, unknown>,
    timeout = 60_000,
  ): Promise<unknown> {
    const id = ++this.sequence;
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('智能体响应超时；任务不会自动重发，请检查文件后重试。'));
        if (generation === this.generation) void this.disconnect();
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      void this.send({ jsonrpc: '2.0', id, method, params }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }
  private persistSoon() {
    this.saveTimer ??= setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 800);
  }
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (
      !this.view.record.providerSessionId ||
      !this.view.record.messages.length ||
      this.view.record.archived
    )
      return;
    const record = structuredClone(this.view.record);
    this.saveChain = this.saveChain
      .then(async () => {
        await agentApi.invoke('agent_save_session', { record });
      })
      .catch((error) => {
        this.publish({ error: `会话尚未保存：${String(error)}` });
      });
    await this.saveChain;
  }
  connect(): Promise<void> {
    if (this.connectWork) return this.connectWork;
    if (this.connectionId) return Promise.resolve();
    const work = this.start().finally(() => {
      if (this.connectWork === work) this.connectWork = null;
    });
    this.connectWork = work;
    return work;
  }
  private async start() {
    const generation = ++this.generation;
    this.earlyUpdates = [];
    this.publish({ phase: 'connecting', error: null, configOptions: [], modes: null });
    try {
      const stopListening = await agentApi.events((event) => {
        if (generation === this.generation)
          void this.receive(event).catch((error) => {
            this.publish({ error: String(error) });
            void this.disconnect();
          });
      });
      if (generation !== this.generation) {
        stopListening();
        return;
      }
      this.stopListening = stopListening;
      const connected = await agentApi.invoke<{ connectionId: string; mcpServers: unknown[] }>(
        'agent_connect',
        { profileId: this.profile.id, workspaceId: this.workspace.id },
      );
      if (generation !== this.generation) {
        await agentApi.invoke('agent_disconnect', { connectionId: connected.connectionId });
        return;
      }
      this.connectionId = connected.connectionId;
      const initialized = object(
        await this.request('initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'MarkLyra', version: '0.1.0' },
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
            auth: { terminal: true },
            elicitation: { form: {} },
          },
        }),
      );
      if (generation !== this.generation) return;
      if (initialized.protocolVersion !== 1) throw new Error('智能体不支持稳定 ACP v1');
      this.capabilities = object(initialized.agentCapabilities);
      const prompt = object(this.capabilities.promptCapabilities);
      this.publish({
        promptCapabilities: {
          image: prompt.image === true,
          embeddedContext: prompt.embeddedContext === true,
        },
        authMethods: Array.isArray(initialized.authMethods)
          ? (initialized.authMethods as SessionView['authMethods'])
          : [],
      });
      await this.createOrLoad(connected.mcpServers);
    } catch (error) {
      if (generation !== this.generation) return;
      const message = String(error);
      if (
        /auth|login|登录|认证|credentials/i.test(message) &&
        this.view.authMethods.length &&
        this.connectionId
      )
        this.publish({ phase: 'auth', error: '请先完成智能体登录。' });
      else {
        await this.disconnect();
        this.publish({ phase: 'disconnected', error: message });
      }
    }
  }
  private mcpServers: unknown[] = [];
  private async createOrLoad(servers: unknown[]) {
    const generation = this.generation;
    this.mcpServers = servers;
    let saved = this.view.record.providerSessionId;
    if (saved && !this.capabilities.loadSession) {
      if (this.view.record.messages.length)
        throw new Error('此智能体不支持恢复历史。历史可继续查看，请新建会话。');
      // An unused prepared session has no transcript to recover.
      saved = null;
      this.record({ providerSessionId: null });
    }
    this.loading = !!saved;
    try {
      const result = object(
        await this.request(saved ? 'session/load' : 'session/new', {
          cwd: this.workspace.path,
          mcpServers: servers,
          ...(saved ? { sessionId: saved } : {}),
        }),
      );
      if (generation !== this.generation) return;
      const id = saved || text(result.sessionId);
      if (!id) throw new Error('智能体没有返回会话标识');
      this.record({ providerSessionId: id });
      this.configure(result);
      const early = this.earlyUpdates.splice(0);
      for (const event of early) await this.receive(event);
      this.publish({ phase: 'ready', error: null });
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }
  async authenticate(methodId: string) {
    if (!this.connectionId) return;
    this.publish({ phase: 'connecting', error: null });
    try {
      await this.request('authenticate', { methodId }, 300_000);
      await this.createOrLoad(this.mcpServers);
    } catch (error) {
      this.publish({ phase: 'auth', error: String(error) });
    }
  }
  async reconnect() {
    await this.disconnect();
    await this.connect();
  }
  startTerminalAuth(methodId: string) {
    return agentApi.invoke<void>('agent_auth_start', { connectionId: this.connectionId, methodId });
  }
  authIo(args: { input?: string; cols?: number; rows?: number; close?: boolean }) {
    return agentApi.invoke<{ data: string; exitCode: number | null }>('agent_auth_io', {
      connectionId: this.connectionId,
      input: null,
      cols: null,
      rows: null,
      close: false,
      ...args,
    });
  }
  openExternal(url: string) {
    return agentApi.invoke<void>('open_external_link', { url });
  }
  private configure(result: Record<string, unknown>) {
    if (Array.isArray(result.configOptions))
      this.publish({ configOptions: configOptions(result.configOptions) });
    if (result.modes) this.publish({ modes: result.modes as SessionView['modes'] });
  }
  async setOption(id: string, value: string) {
    if (this.view.phase !== 'ready') return;
    const generation = this.generation;
    this.publish({ phase: 'configuring', error: null });
    try {
      const result = object(
        await this.request('session/set_config_option', {
          sessionId: this.view.record.providerSessionId,
          configId: id,
          value,
        }),
      );
      if (generation === this.generation) this.configure(result);
    } catch (error) {
      if (generation === this.generation) this.publish({ error: String(error) });
    } finally {
      if (generation === this.generation) this.publish({ phase: 'ready' });
    }
  }
  async setMode(modeId: string) {
    if (this.view.phase !== 'ready') return;
    const generation = this.generation;
    this.publish({ phase: 'configuring', error: null });
    try {
      await this.request('session/set_mode', {
        sessionId: this.view.record.providerSessionId,
        modeId,
      });
      if (generation === this.generation && this.view.modes)
        this.publish({ modes: { ...this.view.modes, currentModeId: modeId } });
    } catch (error) {
      if (generation === this.generation) this.publish({ error: String(error) });
    } finally {
      if (generation === this.generation) this.publish({ phase: 'ready' });
    }
  }
  async prompt(
    input: string,
    references: string[],
    active: string | null,
    includeSnapshot = false,
    attachments: DraftAttachment[] = [],
    accepted?: () => void,
  ) {
    if (
      this.view.record.archived ||
      (!input.trim() && !attachments.length) ||
      input.length > 64_000
    )
      throw new Error('消息为空、过长或会话已归档');
    if (['connecting', 'configuring', 'running', 'cancelling'].includes(this.view.phase))
      throw new Error('请等待当前操作结束');
    await this.connect();
    if (this.view.phase !== 'ready') return false;
    const blocks = attachmentBlocks(attachments, this.view.promptCapabilities);
    const generation = this.generation;
    const turnId = crypto.randomUUID();
    this.turnId = turnId;
    this.publish({ phase: 'running', error: null });
    let stored: Attachment[] = [];
    let recorded = false;
    let dispatched = false;
    try {
      const snapshot = includeSnapshot ? await this.host.snapshot?.() : undefined;
      if (generation !== this.generation || this.snapshot().phase !== 'running') return false;
      const context = await agentApi.invoke<unknown>('agent_context', {
        connectionId: this.connectionId,
        context: { turnId, references, active, ...(snapshot ? { snapshot } : {}) },
      });
      if (generation !== this.generation || this.snapshot().phase !== 'running') return false;
      const prompt = [
        {
          type: 'text',
          text: `<marklyra-context>\n${JSON.stringify(context)}\n</marklyra-context>`,
        },
        ...(input.trim() ? [{ type: 'text', text: input }] : []),
        ...blocks,
      ];
      if (new TextEncoder().encode(JSON.stringify(prompt)).length > 7.5 * 1024 * 1024)
        throw new Error('本轮内容过大，请减少附件或文档上下文');
      stored = attachments.length
        ? await agentApi.invoke<Attachment[]>('agent_store_attachments', {
            connectionId: this.connectionId,
            providerSessionId: this.view.record.providerSessionId,
            recordId: this.view.record.id,
            uploads: attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
          })
        : [];
      if (generation !== this.generation || this.snapshot().phase !== 'running') return false;
      stored.forEach((value, index) => {
        const draft = attachments[index];
        if (draft) rememberAttachment(this.view.record.id, { ...value, data: draft.data });
      });
      this.record({
        title:
          this.view.record.title !== '新会话'
            ? this.view.record.title
            : Array.from(input.trim() || attachments[0]?.name || '附件对话')
                .slice(0, 40)
                .join(''),
        messages: [
          ...this.view.record.messages,
          {
            id: crypto.randomUUID(),
            role: 'user',
            text: input,
            turnId,
            references: [...references],
            createdAt: Date.now(),
            ...(stored.length ? { attachments: stored } : {}),
          },
        ],
      });
      recorded = true;
      await this.flush();
      if (generation !== this.generation || this.snapshot().phase !== 'running') return false;
      accepted?.();
      dispatched = true;
      const result = object(
        await this.request(
          'session/prompt',
          {
            sessionId: this.view.record.providerSessionId,
            prompt,
          },
          30 * 60_000,
        ),
      );
      if (generation !== this.generation) return true;
      if (result.stopReason && result.stopReason !== 'end_turn')
        this.record({
          messages: [
            ...this.view.record.messages,
            {
              id: crypto.randomUUID(),
              role: 'notice',
              turnId,
              text:
                result.stopReason === 'cancelled'
                  ? '任务已停止。'
                  : `本轮结束：${text(result.stopReason)}`,
            },
          ],
        });
      this.publish({ phase: 'ready' });
      this.host.changed();
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.publish({ phase: this.connectionId ? 'ready' : 'disconnected', error: String(error) });
      return false;
    } finally {
      this.finishTurn(turnId);
      if (stored.length && !recorded)
        await agentApi
          .invoke('agent_discard_attachments', {
            rootPath: this.workspace.path,
            recordId: this.view.record.id,
            ids: stored.map((value) => value.id),
          })
          .catch(() => {});
      if (generation === this.generation) {
        if (!dispatched && this.snapshot().phase === 'cancelling') {
          if (recorded)
            this.record({
              messages: [
                ...this.view.record.messages,
                {
                  id: crypto.randomUUID(),
                  role: 'notice',
                  text: '本轮在发送前已取消，内容未提交给智能体。',
                  turnId,
                  createdAt: Date.now(),
                },
              ],
            });
          this.publish({ phase: this.connectionId ? 'ready' : 'disconnected' });
        }
        if (this.cancelTimer) clearTimeout(this.cancelTimer);
        this.cancelTimer = null;
        await this.cancelDecisions();
      }
      await this.flush();
    }
  }
  private async receive(event: AgentEvent) {
    if (event.connectionId !== this.connectionId) return;
    const connectionId = event.connectionId,
      generation = this.generation;
    const current = () =>
      generation === this.generation &&
      connectionId === this.connectionId &&
      this.view.phase === 'running';
    const reply = (id: string | number, result: unknown) =>
      generation !== this.generation
        ? Promise.resolve()
        : agentApi.invoke<void>('agent_send', {
            connectionId,
            message: { jsonrpc: '2.0', id, result },
          });
    const fail = (id: string | number, error: unknown) =>
      generation !== this.generation
        ? Promise.resolve()
        : agentApi
            .invoke<void>('agent_send', {
              connectionId,
              message: { jsonrpc: '2.0', id, error: { code: -32603, message: String(error) } },
            })
            .catch(() => {});
    if (event.kind === 'closed') {
      const running = this.view.phase === 'running' || this.view.phase === 'cancelling';
      this.publish({
        error: running
          ? '连接中断，任务结果未确认；请检查文件后重试。'
          : (event.error ?? '连接已结束'),
      });
      await this.disconnect();
      return;
    }
    if (event.kind === 'tool') {
      const id = event.requestId;
      if (!id) return;
      if (this.view.phase !== 'running' || event.context?.turnId !== this.turnId) {
        await agentApi
          .invoke('agent_tool_respond', {
            connectionId,
            requestId: id,
            result: { approved: false },
          })
          .catch(() => {});
        return;
      }
      const args = event.arguments ?? {};
      this.interact(
        {
          id,
          kind: 'operation',
          title: operationName(event.name ?? ''),
          detail: text(args.path) || text(args.receipt),
          ...(typeof args.content === 'string' ? { preview: args.content.slice(0, 12000) } : {}),
          ...(typeof args.oldText === 'string' && typeof args.newText === 'string'
            ? {
                preview: `原文：\n${args.oldText.slice(0, 6000)}\n\n替换为：\n${args.newText.slice(0, 6000)}`,
              }
            : {}),
          options: [
            { id: 'allow', name: '允许本次', allow: true },
            { id: 'deny', name: '拒绝', allow: false },
          ],
        },
        async (choice) => {
          if (choice === 'allow')
            await this.host.beforeWrite(
              text(args.path) ? this.absolutePath(text(args.path)) : undefined,
            );
          await agentApi.invoke('agent_tool_respond', {
            connectionId,
            requestId: id,
            result: { approved: choice === 'allow' && current() },
          });
          if (choice === 'allow') this.host.changed();
        },
      );
      return;
    }
    const message = event.message;
    if (!message) return;
    if (!message.method && message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    const params = message.params ?? {};
    if (
      message.method &&
      message.id !== undefined &&
      ![
        'session/request_permission',
        'fs/read_text_file',
        'fs/write_text_file',
        'terminal/create',
        'terminal/output',
        'terminal/wait_for_exit',
        'terminal/kill',
        'terminal/release',
        'elicitation/create',
      ].includes(message.method)
    ) {
      await this.send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not supported' },
      }).catch(() => {});
      return;
    }
    if (params.sessionId !== this.view.record.providerSessionId) {
      if (
        message.method === 'session/update' &&
        this.view.phase === 'connecting' &&
        !this.view.record.providerSessionId &&
        this.earlyUpdates.length < 32
      )
        this.earlyUpdates.push(event);
      return;
    }
    if (message.method === 'session/update') {
      const update = object(params.update);
      if (update.sessionUpdate === 'config_option_update') this.configure(update);
      if (update.sessionUpdate === 'current_mode_update' && this.view.modes)
        this.publish({ modes: { ...this.view.modes, currentModeId: text(update.currentModeId) } });
      if (
        update.sessionUpdate === 'available_commands_update' &&
        Array.isArray(update.availableCommands)
      )
        this.publish({ commands: update.availableCommands as SessionView['commands'] });
      if (
        update.sessionUpdate === 'usage_update' &&
        typeof update.used === 'number' &&
        typeof update.size === 'number'
      )
        this.publish({ usage: { used: update.used, size: update.size } });
      if (!this.loading) {
        const incomingSize = JSON.stringify(update).length;
        if (
          incomingSize > 2 * 1024 * 1024 ||
          this.view.record.messages.length >= 4000 ||
          this.view.record.messages.reduce((size, message) => size + message.text.length, 0) +
            incomingSize >
            4 * 1024 * 1024
        ) {
          this.publish({ error: '本轮输出已达会话容量上限，已停止。请新建会话继续。' });
          await this.cancel();
          return;
        }
        const messages = updateMessages(this.view.record.messages, update, this.turnId);
        if (messages !== this.view.record.messages) {
          this.record({ messages });
          this.persistSoon();
        }
      }
      return;
    }
    const id = message.id;
    if (id === undefined) return;
    if (this.view.phase !== 'running') {
      await fail(id, '当前没有活动任务');
      return;
    }
    if (message.method === 'session/request_permission') {
      const tool = object(params.toolCall);
      const options = Array.isArray(params.options)
        ? params.options.map((option) => {
            const value = object(option);
            return {
              id: text(value.optionId),
              name: text(value.name),
              allow: value.kind === 'allow_once' || value.kind === 'allow_always',
            };
          })
        : [];
      this.interact(
        {
          id: JSON.stringify(id),
          kind: 'permission',
          title: text(tool.title) || '智能体请求授权',
          detail: JSON.stringify(tool.locations ?? tool.rawInput ?? {}).slice(0, 3000),
          options,
        },
        async (choice) => {
          if (
            options.find((o) => o.id === choice)?.allow &&
            !['read', 'search', 'fetch', 'think'].includes(text(tool.kind))
          )
            await this.host.beforeWrite();
          await reply(id, {
            outcome:
              choice && current()
                ? { outcome: 'selected', optionId: choice }
                : { outcome: 'cancelled' },
          });
        },
      );
      return;
    }
    if (message.method === 'elicitation/create') {
      this.interact(
        {
          id: JSON.stringify(id),
          kind: 'form',
          title: text(params.message) || '智能体需要补充信息',
          detail: '',
          schema: object(params.requestedSchema),
          options: [
            { id: 'accept', name: '提交', allow: true },
            { id: 'decline', name: '跳过', allow: false },
          ],
        },
        async (choice, content) => {
          await reply(id, {
            action: choice || 'cancel',
            ...(choice === 'accept' ? { content } : {}),
          });
        },
      );
      return;
    }
    const execute = async () => {
      if (!current()) throw new Error('任务已结束，操作未执行');
      const result = await agentApi.invoke('agent_client_operation', {
        connectionId,
        requestId: id,
        method: message.method,
        params,
      });
      await reply(id, result);
    };
    if (message.method === 'fs/write_text_file' || message.method === 'terminal/create') {
      this.interact(
        {
          id: JSON.stringify(id),
          kind: 'operation',
          title: operationName(message.method),
          ...(typeof params.content === 'string'
            ? { preview: params.content.slice(0, 12000) }
            : {}),
          detail:
            text(params.path) ||
            JSON.stringify(
              {
                command: params.command,
                args: Array.isArray(params.args) ? params.args : [],
                cwd: params.cwd ?? this.workspace.path,
                environmentVariables: Array.isArray(params.env)
                  ? params.env.map((value) => text(object(value).name))
                  : [],
              },
              null,
              2,
            ),
          options: [
            { id: 'allow', name: '允许本次', allow: true },
            { id: 'deny', name: '拒绝', allow: false },
          ],
        },
        async (choice) => {
          if (choice !== 'allow') {
            await fail(id, '用户拒绝操作');
            return;
          }
          await this.host.beforeWrite(
            message.method === 'fs/write_text_file' ? text(params.path) : undefined,
          );
          await execute();
          this.host.changed();
        },
      );
      return;
    }
    if (
      message.method === 'fs/read_text_file' ||
      ['terminal/output', 'terminal/wait_for_exit', 'terminal/kill', 'terminal/release'].includes(
        message.method ?? '',
      )
    ) {
      try {
        await execute();
      } catch (error) {
        await fail(id, error);
      }
      return;
    }
    await fail(id, 'Method not supported');
  }
  private absolutePath(path: string) {
    return /^(?:[A-Za-z]:[\\/]|[\\/])/.test(path) ? path : `${this.workspace.path}/${path}`;
  }
  private interact(
    interaction: Interaction,
    decision: (choice: string, form?: Record<string, unknown>) => Promise<void>,
  ) {
    if (this.decisions.has(interaction.id)) return;
    this.decisions.set(interaction.id, decision);
    this.host.attention?.();
    this.publish({ interactions: [...this.view.interactions, interaction] });
  }
  async decide(id: string, choice: string, form?: Record<string, unknown>) {
    const decision = this.decisions.get(id);
    if (!decision) return;
    const generation = this.generation;
    this.decisions.delete(id);
    this.publish({ interactions: this.view.interactions.filter((i) => i.id !== id) });
    try {
      await decision(choice, form);
    } catch (error) {
      if (generation === this.generation) {
        this.publish({ error: String(error) });
        await this.cancel();
      }
    }
  }
  private async cancelDecisions() {
    const decisions = [...this.decisions.values()];
    this.decisions.clear();
    this.publish({ interactions: [] });
    await Promise.allSettled(decisions.map((decision) => decision('')));
  }
  async cancel() {
    if (this.view.phase === 'connecting' || this.view.phase === 'configuring') {
      await this.disconnect();
      return;
    }
    if (this.view.phase !== 'running' && this.view.phase !== 'cancelling') return;
    this.publish({ phase: 'cancelling' });
    await this.send({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: this.view.record.providerSessionId },
    }).catch(() => {});
    await this.cancelDecisions();
    this.cancelTimer ??= setTimeout(() => {
      void this.disconnect();
    }, 5000);
  }
  private finishTurn(turnId: string) {
    if (
      !turnId ||
      !this.view.record.messages.some(
        (message) =>
          message.turnId === turnId && message.role === 'user' && message.completedAt === undefined,
      )
    )
      return;
    this.record({
      messages: this.view.record.messages.map((message) =>
        message.turnId === turnId && message.role === 'user' && message.completedAt === undefined
          ? { ...message, completedAt: Math.max(Date.now(), message.createdAt ?? 0) }
          : message,
      ),
    });
  }
  async disconnect() {
    this.finishTurn(this.turnId);
    const generation = ++this.generation;
    this.connectWork = null;
    const connectionId = this.connectionId;
    const stopListening = this.stopListening;
    this.stopListening = null;
    stopListening?.();
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    this.cancelTimer = null;
    await this.cancelDecisions();
    if (this.connectionId === connectionId) this.connectionId = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('连接已关闭'));
    }
    this.pending.clear();
    if (connectionId) await agentApi.invoke('agent_disconnect', { connectionId }).catch(() => {});
    if (generation === this.generation) this.publish({ phase: 'disconnected' });
    await this.flush();
  }
}
function operationName(name: string) {
  return (
    (
      {
        workspace_write_document: '写入文档',
        editor_write_document: '修改当前文档',
        editor_edit_document: '精确修改当前文档',
        workspace_edit_document: '精确修改文档',
        workspace_create_directory: '创建目录',
        workspace_trash_entry: '移入恢复目录',
        workspace_restore_entry: '恢复文档或目录',
        'fs/write_text_file': '写入文档',
        'terminal/create': '运行本机命令',
      } as Record<string, string>
    )[name] ?? name
  );
}
