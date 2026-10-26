import {
  type MarkdownPreferenceChange,
  type MarkdownPreferencesSnapshot,
  type MarkdownPreferenceValues,
  markdownPreferenceChange,
  markdownPreferencesSnapshot,
} from './runtime-preferences/markdown-preferences.js';

export interface MarkdownEditor {
  getMarkdownPreferences(): Readonly<MarkdownPreferenceValues>;
  setMarkdownPreferences(
    value: MarkdownPreferenceChange,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}
interface Request {
  token: string;
  before: MarkdownPreferencesSnapshot;
  change: MarkdownPreferenceChange;
}
interface Dependencies {
  get(): Promise<MarkdownPreferencesSnapshot>;
  complete(token: string, error: string | null): Promise<MarkdownPreferencesSnapshot | null>;
  report(message: string): void;
  changed(error: string, working: boolean): void;
}
function values(value: MarkdownPreferenceValues): MarkdownPreferenceValues {
  const { indentSize, prettyIndent, headingStyle, ulStyle, olStyle } = value;
  return {
    indentSize,
    prettyIndent,
    headingStyle: headingStyle ?? 0,
    ulStyle: ulStyle ?? 0,
    olStyle: olStyle ?? 0,
  };
}
function same(left: MarkdownPreferenceValues, right: MarkdownPreferenceValues): boolean {
  return (
    left.indentSize === right.indentSize &&
    left.prettyIndent === right.prettyIndent &&
    (left.headingStyle ?? 0) === (right.headingStyle ?? 0) &&
    (left.ulStyle ?? 0) === (right.ulStyle ?? 0) &&
    (left.olStyle ?? 0) === (right.olStyle ?? 0)
  );
}
function request(value: unknown): Request {
  if (!value || typeof value !== 'object') throw new Error('Markdown策略请求无效。');
  const input = value as Record<string, unknown>;
  if (
    typeof input.token !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.token)
  )
    throw new Error('Markdown策略请求标识无效。');
  return {
    token: input.token,
    before: markdownPreferencesSnapshot(input.before),
    change: markdownPreferenceChange(input.change),
  };
}

/** One window's SDK lane. Storage is authoritative; a sibling's failure is never hidden. */
export class MarkdownPreferenceSync {
  private editor: MarkdownEditor | null = null;
  private binding = 0;
  private readVersion = 0;
  private disposed = false;
  private lane: Promise<void> = Promise.resolve();
  private requests = new Map<string, AbortController>();
  private passive: AbortController | null = null;
  private life = new AbortController();
  private error = '';
  constructor(private readonly deps: Dependencies) {}
  bind(editor: MarkdownEditor): void {
    if (this.disposed) return;
    if (this.editor === editor) return;
    this.passive?.abort();
    this.binding++;
    this.editor = editor;
    this.readVersion++;
    for (const controller of this.requests.values()) controller.abort();
  }
  private publish(error = this.error): void {
    this.error = error;
    if (!this.disposed) this.deps.changed(error, this.requests.size > 0 || this.passive !== null);
  }
  private failed(message: string): void {
    if (this.disposed) return;
    this.publish(message);
    this.deps.report(message);
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.lane.catch(() => {}).then(work);
    this.lane = pending;
    return pending;
  }
  async reload(): Promise<void> {
    if (this.disposed || !this.editor || this.requests.size) return;
    const ticket = ++this.readVersion,
      binding = this.binding,
      editor = this.editor;
    try {
      const snapshot = await this.deps.get();
      if (
        this.disposed ||
        ticket !== this.readVersion ||
        binding !== this.binding ||
        this.requests.size
      )
        return;
      await this.enqueue(async () => {
        if (
          this.disposed ||
          ticket !== this.readVersion ||
          binding !== this.binding ||
          this.requests.size
        )
          return;
        const controller = new AbortController();
        this.passive = controller;
        this.publish();
        try {
          if (!same(editor.getMarkdownPreferences(), snapshot))
            await editor.setMarkdownPreferences(values(snapshot), { signal: controller.signal });
          if (!this.disposed && ticket === this.readVersion && binding === this.binding)
            this.publish('');
        } catch (error) {
          if (!controller.signal.aborted && !this.disposed)
            this.failed(`Markdown缩进尚未同步：${String(error)}。可重试同步，原稿保留。`);
        } finally {
          if (this.passive === controller) this.passive = null;
          this.publish();
        }
      });
    } catch (error) {
      if (!this.disposed && ticket === this.readVersion)
        this.failed(`无法读取Markdown缩进设置：${String(error)}。可重试同步，原稿保留。`);
    }
  }
  cancel(token: string): void {
    this.requests.get(token)?.abort();
  }
  receive(value: unknown): Promise<void> {
    if (this.disposed) return Promise.resolve();
    let current: Request;
    try {
      current = request(value);
    } catch (error) {
      this.failed(String(error));
      return Promise.resolve();
    }
    if (this.disposed || this.requests.has(current.token)) return Promise.resolve();
    const controller = new AbortController();
    this.requests.set(current.token, controller);
    this.readVersion++;
    this.passive?.abort();
    this.publish();
    const binding = this.binding,
      editor = this.editor;
    return this.enqueue(async () => {
      const live = () => !this.disposed && binding === this.binding && editor === this.editor;
      if (!editor || !live()) {
        await this.deps.complete(current.token, '编辑窗口尚未就绪或已更换').catch(() => {});
        return;
      }
      const before = values(editor.getMarkdownPreferences());
      const next = { ...current.before, ...current.change };
      let applied = false;
      const destroyed = () => controller.abort();
      this.life.signal.addEventListener('abort', destroyed, { once: true });
      try {
        if (controller.signal.aborted) throw new Error('Markdown策略请求已取消');
        await editor.setMarkdownPreferences(values(next), { signal: controller.signal });
        applied = true;
        if (controller.signal.aborted || !live()) throw new Error('Markdown策略请求已取消');
        const saved = await this.deps.complete(current.token, null);
        if (!saved || saved.revision !== current.before.revision + 1 || !same(saved, next))
          throw new Error('Markdown策略未收到匹配的持久化确认');
        if (live()) this.publish('');
      } catch (failure) {
        let message = String(failure);
        try {
          // Never infer that a failed write/receipt means rename did not publish.
          const observed = await this.deps.get();
          const committed =
            observed.revision === current.before.revision + 1 && same(observed, next);
          if (committed && applied && live()) {
            try {
              const saved = await this.deps.complete(current.token, null);
              if (saved && saved.revision === current.before.revision + 1 && same(saved, next)) {
                this.publish('');
                return;
              }
            } catch {
              /* The receipt may already have finalized or expired. */
            }
            this.failed(`${message}；Native已确认目标值，回执状态未确认。可重试同步。`);
            return;
          }
          if (applied && live()) {
            const actual = editor.getMarkdownPreferences();
            if (!same(actual, next) && !same(actual, before))
              throw new Error('策略已由后续操作改变，未覆盖当前策略');
            if (!same(actual, before))
              await editor.setMarkdownPreferences(before, { signal: this.life.signal });
          }
          if (live() && !same(editor.getMarkdownPreferences(), observed))
            this.failed(`${message}；当前窗口保留原策略，与已保存策略尚未同步，可重试同步。`);
          else if (live()) {
            this.publish('');
            this.deps.report(message);
          }
        } catch (recovery) {
          message += `；无法确认或恢复底层策略：${String(recovery)}。原稿保留，请重试同步。`;
          if (live()) this.failed(message);
        }
        await this.deps.complete(current.token, message).catch(() => {});
      } finally {
        this.life.signal.removeEventListener('abort', destroyed);
      }
    })
      .catch((error) => {
        if (!this.disposed) this.failed(`Markdown策略处理失败：${String(error)}`);
      })
      .finally(() => {
        this.requests.delete(current.token);
        this.publish();
      });
  }
  destroy(): void {
    this.disposed = true;
    this.binding++;
    this.readVersion++;
    this.editor = null;
    this.life.abort();
    this.passive?.abort();
    for (const controller of this.requests.values()) controller.abort();
  }
}
