import { SourceMirror } from '@marklyra/editor-core';
import type { RuntimeState } from '../protocol.js';
import type { RuntimeReloadRequest, RuntimeReloadResult } from '../reload/contracts.js';
import type { RuntimeImages } from './images.js';
import type { LegacyGlobals } from './legacy-types.js';
import {
  ensureSourceReloadHistory,
  sourcePosition,
  sourceReloadCheckpoint,
} from './reload-history.js';
import { parserSource } from './source-prefix.js';
import type { RuntimeSourceTracking, TrackingSnapshot } from './source-tracking.js';

export interface RuntimeDocumentSnapshot {
  focused: boolean;
  sourceSelection?: {
    ranges: { anchor: { line: number; ch: number }; head: { line: number; ch: number } }[];
    primary: number;
  };
  native: unknown;
  tracking: TrackingSnapshot;
}
interface Dependencies {
  runtime: LegacyGlobals;
  tracking: RuntimeSourceTracking;
  images: RuntimeImages;
  sourceBOM(): 'metadata' | 'text';
  composing(): boolean;
  loading(): boolean;
  setLoading(value: boolean): void;
  state(sync?: boolean, resetTracking?: boolean): RuntimeState;
}
/** Reload transactions; native snapshots are only an in-memory failure rollback. */
export class RuntimeReload {
  private readonly guarded = new WeakSet<object>();
  constructor(private readonly deps: Dependencies) {}
  install(): void {
    const editor = this.deps.runtime.editor;
    if (!editor || this.guarded.has(editor)) return;
    this.guarded.add(editor);
    const scroll = editor.selection.scrollAdjust;
    editor.selection.scrollAdjust = (...args: unknown[]) => {
      if (args[0] === undefined && !document.getSelection()?.rangeCount) return;
      Reflect.apply(scroll, editor.selection, args);
    };
    const menu = editor.contextMenu;
    const show = menu.showCustom;
    let popupGeneration = 0;
    menu.showCustom = (...args: unknown[]) => {
      const generation = ++popupGeneration;
      const current = () => document.hasFocus() && Boolean(document.getSelection()?.rangeCount);
      const hideCurrent = () => {
        if (generation === popupGeneration)
          document.querySelector('#user-context-menu')?.classList.remove('show');
      };
      if (!current()) {
        hideCurrent();
        return;
      }
      const schedule = window.setTimeout;
      let guardedPopup = false;
      // The runtime method checks its range before scheduling, then reads it
      // unconditionally in the popup callback. Recheck at that asynchronous boundary.
      // Interception exists only during this synchronous method invocation.
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...parameters: unknown[]) => {
        // Module 4c showCustom has one 100ms popup-position callback. Other
        // synchronously scheduled work retains the timer semantics.
        if (guardedPopup || typeof handler !== 'function' || timeout !== 100 || parameters.length)
          return schedule(handler, timeout, ...parameters);
        guardedPopup = true;
        return schedule(() => {
          if (generation !== popupGeneration) return;
          if (!current()) {
            hideCurrent();
            return;
          }
          Reflect.apply(handler, window, parameters);
        }, timeout);
      }) as typeof window.setTimeout;
      try {
        return Reflect.apply(show, menu, args);
      } finally {
        window.setTimeout = schedule;
      }
    };
  }
  snapshot(): RuntimeDocumentSnapshot {
    if (this.deps.composing()) throw new Error('请先完成输入法候选');
    const { runtime, tracking } = this.deps;
    const focused = document.hasFocus();
    const activeSelection = tracking.captureActiveSelection();
    const cm = runtime.editor?.sourceView.inSourceMode ? runtime.editor.sourceView.cm : undefined;
    const sourceText = cm?.getValue();
    const anchor = cm?.getCursor('anchor'),
      head = cm?.getCursor('head');
    const ranges = cm?.listSelections().map((range) => ({
      anchor: sourcePosition(range.anchor),
      head: sourcePosition(range.head),
    }));
    const primary =
      ranges?.findIndex(
        (range) =>
          range.anchor.line === anchor?.line &&
          range.anchor.ch === anchor.ch &&
          range.head.line === head?.line &&
          range.head.ch === head.ch,
      ) ?? -1;
    const native = runtime.File?.generateSnap();
    return {
      focused,
      ...(ranges && primary >= 0 && cm?.getValue() === sourceText
        ? { sourceSelection: { ranges, primary } }
        : {}),
      native:
        runtime.editor?.sourceView.inSourceMode && native && typeof native === 'object'
          ? { ...native, srcContent: runtime.editor.sourceView.cm?.getValue() }
          : native,
      tracking: tracking.save(activeSelection),
    };
  }
  async restore(snapshot: RuntimeDocumentSnapshot, source: string): Promise<RuntimeState> {
    const passive = !snapshot.focused || !document.hasFocus();
    const focusElement = HTMLElement.prototype.focus,
      focusWindow = window.focus;
    if (passive) {
      // File.loadFile always focuses its writing area. A failed background
      // reload must leave the host's input alone; this override exists only here.
      HTMLElement.prototype.focus = () => {};
      window.focus = () => {};
    }
    this.deps.setLoading(true);
    try {
      await this.deps.runtime.File?.loadFile('', false, [
        source,
        snapshot.native,
        this.deps.images.documentState(),
      ]);
      this.deps.setLoading(false);
      const restored = this.deps.state(true, true);
      this.deps.tracking.restore(snapshot.tracking, restored.canonical);
      const cm = this.deps.runtime.editor?.sourceView.inSourceMode
        ? this.deps.runtime.editor.sourceView.cm
        : undefined;
      const expected =
        snapshot.native && typeof snapshot.native === 'object'
          ? Reflect.get(snapshot.native, 'srcContent')
          : undefined;
      if (
        cm &&
        snapshot.sourceSelection &&
        typeof expected === 'string' &&
        cm.getValue() === expected
      )
        cm.setSelections(snapshot.sourceSelection.ranges, snapshot.sourceSelection.primary);
      // Active plain selection is restored after the native snapshot. Do not sync
      // again: return the actually restored directed selection and checkpoint.
      return this.deps.state(false);
    } finally {
      this.deps.setLoading(false);
      if (passive) {
        HTMLElement.prototype.focus = focusElement;
        window.focus = focusWindow;
      }
    }
  }
  async reload(value: RuntimeReloadRequest): Promise<RuntimeReloadResult> {
    if (this.deps.composing() || this.deps.loading()) throw new Error('请先完成当前编辑操作');
    if (
      !value ||
      typeof value.source !== 'string' ||
      typeof value.expectedSource !== 'string' ||
      !value.expected
    )
      throw new Error('重载请求无效');
    const before = this.deps.state();
    if (
      before.canonical !== value.expected.canonical ||
      before.sequence !== value.expected.sequence ||
      before.tracking.checkpoint !== value.expected.checkpoint
    )
      return { applied: false, state: before, reason: '重载期间内容已有更改，已保留当前稿件' };
    const file = this.deps.runtime.File,
      editor = this.deps.runtime.editor;
    if (!file || !editor) throw new Error('编辑器尚未初始化');
    const snapshot = this.snapshot();
    const flags = { crlf: file.useCRLF, finalNewline: file.finalNewline };
    const hadFocus = document.hasFocus();
    const sourceHistory = sourceReloadCheckpoint(editor);
    this.deps.setLoading(true);
    try {
      this.deps.images.setContext(value.images);
      const reload = () => {
        file.reloadContent(parserSource(value.source, this.deps.sourceBOM()), {
          fromDiskChange: true,
          delayRefresh: false,
        });
        // Reload does not restore these globals on Undo. Keep its internal
        // canonical representation stable; the adopted raw version keeps actual EOL/BOM.
        file.setLineEnding(flags.crlf);
        file.finalNewline = flags.finalNewline;
        ensureSourceReloadHistory(editor, sourceHistory);
      };
      // Keep native setValue and its final directed selections in the same real
      // CM operation, so CodeMirror records selectionAfter for Undo/Redo itself.
      if (sourceHistory) sourceHistory.cm.operation(reload);
      else reload();
      // Async scroll/menu callbacks assume a range after reload. WebKit
      // clears it; create a real editor caret only when this document owned focus.
      if (hadFocus && !editor.sourceView.inSourceMode && !document.getSelection()?.rangeCount) {
        const first = editor.writingArea.querySelector<HTMLElement>(':scope > [cid]');
        if (first) editor.selection.jumpIntoElemBegin(this.deps.runtime.$(first));
      }
      const canonical = file.sync(false, false, true) ?? editor.getMarkdown();
      // Preflight the same raw/canonical transition before publishing its checkpoint.
      new SourceMirror(value.expectedSource, before.canonical, {
        sourceBOM: this.deps.sourceBOM(),
        canonicalBOM: 'text',
      }).adoptExternal(value.source, canonical);
      this.deps.setLoading(false);
      this.deps.tracking.markExternalReload(canonical, value.source);
      return { applied: true, state: this.deps.state() };
    } catch (error) {
      try {
        const state = await this.restore(snapshot, before.canonical);
        return {
          applied: false,
          state,
          reason: error instanceof Error ? error.message : String(error),
        };
      } catch (rollback) {
        throw new Error(`重载及恢复失败：${String(rollback)}`, { cause: error });
      }
    } finally {
      this.deps.setLoading(false);
    }
  }
}
