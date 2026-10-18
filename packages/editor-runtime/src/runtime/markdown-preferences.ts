import {
  defaultMarkLyraMarkdownPreferences,
  markdownSerializationPolicy,
  marklyraMarkdownPreferences,
  type ResolvedMarkLyraMarkdownPreferences,
  sameMarkdownPolicy,
} from '../markdown-preferences.js';
import type { MarkdownPreferencesResolution, RuntimeState } from '../protocol.js';
import type { LegacyEditor, LegacyGlobals } from './legacy-types.js';
import { readMarkdownPolicy, writeMarkdownPolicy } from './policy-options.js';
import { capturePolicyModel, serializePolicyModel } from './policy-serialization.js';
import type { RuntimeSourceTracking } from './source-tracking.js';

export interface PreparedMarkdownPreferences {
  token: number;
  before: RuntimeState;
  canonical: string;
}

interface Preparation extends PreparedMarkdownPreferences {
  preferences: ResolvedMarkLyraMarkdownPreferences;
  editor: LegacyEditor;
  expires: number;
}

/** Preparing never applies a policy. Commit rechecks the exact native checkpoint
 * after the host has proved the candidate raw/canonical correspondence. */
export class RuntimeMarkdownPreferences {
  private serial = 0;
  private committedToken = 0;
  private prepared: Preparation | undefined;
  private initialized = false;
  private current = { ...defaultMarkLyraMarkdownPreferences };
  constructor(
    private readonly dependencies: {
      runtime: LegacyGlobals;
      state(): RuntimeState;
      available(): boolean;
      tracking: RuntimeSourceTracking;
    },
  ) {}

  initialize(input: unknown): void {
    if (this.initialized) throw new Error('Markdown preferences already initialized');
    const next = marklyraMarkdownPreferences(input);
    const restore = writeMarkdownPolicy(
      this.dependencies.runtime,
      markdownSerializationPolicy(next),
    );
    try {
      this.dependencies.tracking.enableMarkdownProjection();
    } catch (error) {
      restore();
      throw error;
    }
    this.current = next;
    this.initialized = true;
  }

  prepare(input: unknown): PreparedMarkdownPreferences {
    if (!this.initialized || !this.dependencies.available())
      throw new Error('请先完成文档载入与输入法候选');
    const preferences = marklyraMarkdownPreferences(input, this.current);
    const before = this.dependencies.state();
    const runtime = this.dependencies.runtime;
    const editor = runtime.editor;
    if (!editor) throw new Error('Editor is unavailable');
    let canonical = before.canonical;
    if (!before.sourceMode) {
      const model = capturePolicyModel(runtime);
      if (
        serializePolicyModel(runtime, model, readMarkdownPolicy(runtime)).canonical !==
        before.canonical
      )
        throw new Error('模型序列化与活动内容不一致，已保留原设置');
      canonical = serializePolicyModel(
        runtime,
        model,
        markdownSerializationPolicy(preferences),
      ).canonical;
    }
    const prepared = {
      token: ++this.serial,
      before,
      canonical,
      preferences,
      editor,
      expires: performance.now() + 30_000,
    };
    this.prepared = prepared;
    return { token: prepared.token, before, canonical };
  }

  commit(input: unknown): RuntimeState {
    const prepared = this.prepared;
    this.prepared = undefined;
    if (
      !input ||
      typeof input !== 'object' ||
      Reflect.get(input, 'token') !== prepared?.token ||
      !prepared ||
      performance.now() > prepared.expires ||
      !this.dependencies.available()
    )
      throw new Error('缩进设置请求已过期，已保留原设置');
    const current = this.dependencies.state();
    const { runtime, tracking } = this.dependencies;
    if (
      runtime.editor !== prepared.editor ||
      current.sequence !== prepared.before.sequence ||
      current.tracking.checkpoint !== prepared.before.tracking.checkpoint ||
      current.canonical !== prepared.before.canonical ||
      current.sourceMode !== prepared.before.sourceMode
    )
      throw new Error('调整缩进期间文档已有更改，已保留原设置');
    if (!current.sourceMode) {
      const model = capturePolicyModel(runtime);
      if (
        serializePolicyModel(runtime, model, markdownSerializationPolicy(prepared.preferences))
          .canonical !== prepared.canonical
      )
        throw new Error('调整缩进期间文档模型已有更改，已保留原设置');
    }
    const restore = writeMarkdownPolicy(runtime, markdownSerializationPolicy(prepared.preferences));
    try {
      const projected = tracking.rebasePolicy(prepared.canonical);
      this.current = prepared.preferences;
      this.committedToken = prepared.token;
      // Selection/outline/native history were read before committing. A policy
      // changes no DOM or history; do not run another fallible sync after commit.
      return { ...current, canonical: prepared.canonical, tracking: projected };
    } catch (error) {
      restore();
      throw error;
    }
  }

  cancel(input: unknown): void {
    if (input && typeof input === 'object' && Reflect.get(input, 'token') === this.prepared?.token)
      this.prepared = undefined;
  }

  resolve(input: unknown): MarkdownPreferencesResolution {
    const token = input && typeof input === 'object' ? Reflect.get(input, 'token') : undefined;
    if (!Number.isSafeInteger(token) || token <= 0 || token !== this.serial)
      throw new Error('无法确认已过期的Markdown策略请求');
    // Resolve is also a barrier: a not-yet-delivered commit cannot apply after
    // this token has been proved uncommitted.
    this.cancel(input);
    if (!this.initialized || !this.dependencies.available())
      throw new Error('Markdown策略结果尚未确认，请完成当前输入后重试同步');
    if (
      !sameMarkdownPolicy(
        readMarkdownPolicy(this.dependencies.runtime),
        markdownSerializationPolicy(this.current),
      )
    )
      throw new Error('Markdown策略实际状态与确认记录不一致');
    return {
      token,
      committed: this.committedToken === token,
      preferences: { ...this.current },
      state: this.dependencies.state(),
    };
  }
}
