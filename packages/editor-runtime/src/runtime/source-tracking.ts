import { diffText, type Patch } from '@marklyra/editor-core';
import { type MarkdownSerializationPolicy, sameMarkdownPolicy } from '../markdown-preferences.js';
import type { RuntimeChange, RuntimeTracking } from '../protocol.js';
import { type BlockIndentAction, captureBlockIndent } from './block-indent-source.js';
import {
  bindCodeHistorySelection,
  type CodeHistoryData,
  type CodeHistorySelection,
  captureCodeHistorySelection,
  type PendingCodeHistorySelection,
  rebindRestoredCodeHistorySelection,
  restoreCodeHistorySelection,
} from './code-history-selection.js';
import { type CodeLineRange, captureCodeLineCut } from './code-line-source.js';
import { findReplaceSourcePatches } from './find-replace-source.js';
import {
  bindHistorySelection,
  captureHistorySelection,
  type HistorySelection,
  type PendingHistorySelection,
  restoreHistorySelection,
} from './history-selection.js';
import {
  type ActivePlainSelection,
  captureActivePlainSelection,
  captureAuthorizedReplacement,
  capturePlainInput,
  type PlainBlockRange,
  type PlainInputCandidate,
  type PlainInputContext,
  type PlainSelection,
  plainUndoSelection,
  repairPlainRedoCursor,
  restoreActivePlainSelection,
  restorePlainUndoSelection,
} from './input-range.js';
import type { LegacyEditor, LegacyGlobals, LegacyNode } from './legacy-types.js';
import { captureListIndent } from './list-indent-source.js';
import { normalizeTrackedPatches, type PlacementCheck } from './patch-normalization.js';
import { readMarkdownPolicy } from './policy-options.js';
import { capturePolicyModel, serializePolicyModel } from './policy-serialization.js';
import { captureRootBreak } from './root-break-source.js';
import { RuntimeSerializationRead } from './serialization-read.js';
import { captureStructuralBreak } from './structural-break-source.js';
import { repairStructuralHistoryDOM } from './structural-history-dom.js';
import { captureTableCellSelection } from './table-cell-source.js';
import {
  captureTableRowAction,
  readTableRowContext,
  type TableEditAction,
} from './table-row-edit.js';

interface BlockRange {
  id: string;
  from: number;
  to: number;
  text: string;
}
export interface TrackingSnapshot {
  checkpoint: number;
  canonical: string;
  nativeHistory: { signature: string; checkpoint: number | null }[];
  scalarIdentities: [string, number][];
  projectionEpoch?: number;
  projectedPolicy?: MarkdownSerializationPolicy;
  journalPolicies?: [number, MarkdownSerializationPolicy][];
  projectionBridges?: [number, ProjectionBridge][];
  activeSelection?: ActivePlainSelection;
  codeSelections?: { index: number; undo: string; redo: string; selection: CodeHistoryData }[];
  historySelections?: { index: number; signature: string; selection: HistorySelection }[];
  plainSelections?: { index: number; signature: string; selection: PlainSelection }[];
  sourceHistory?: {
    prefix: string;
    generation: number;
    maxGeneration: number;
    done: { signature: string; generation: number | null }[];
    undone: { signature: string; generation: number | null }[];
  };
}
interface Snapshot {
  canonical: string;
  blocks: BlockRange[] | null;
}
interface TrackedEdit {
  base: string;
  patches: readonly Patch[];
  completePrefixes?: RuntimeChange['completePrefixes'];
  history?: boolean;
  normalization?: { baseCanonical: string; patches: readonly Patch[]; canonical: string };
  beforeNormalization?: readonly Patch[];
}
interface ProjectionBridge {
  forward: readonly Patch[];
  inverse: readonly Patch[];
  /** Proved on the live native model, independently of a stale Source view. */
  native?: true;
  nativeFingerprint?: string;
}
/** Candidate filter only. Core still verifies the complete historical anchor;
 * neither a digest nor matching local patch text grants source authority. */
function canonicalFingerprint(text: string): string {
  let a = 2166136261,
    b = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b ^ code, 2246822519);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
function markNativeBridge(bridge: ProjectionBridge | undefined, canonical: string): void {
  if (bridge) {
    bridge.native = true;
    bridge.nativeFingerprint = canonicalFingerprint(canonical);
  }
}
function bridgeApplies(canonical: string, bridge: ProjectionBridge): boolean {
  return (
    bridge.nativeFingerprint === canonicalFingerprint(canonical) &&
    bridge.inverse.length === bridge.forward.length &&
    bridge.inverse.every(
      (patch, index) => canonical.slice(patch.from, patch.to) === bridge.forward[index]?.insert,
    )
  );
}
const MAX_BRIDGE_PATCHES = 16_384;
const MAX_BRIDGE_TEXT = 1_048_576;
function replayBridge(source: string, patches: readonly Patch[]): string {
  if (patches.length > MAX_BRIDGE_PATCHES)
    throw new Error('Source projection bridge budget exceeded');
  let previous = 0,
    text = 0;
  for (const patch of patches) {
    if (
      !Number.isSafeInteger(patch.from) ||
      !Number.isSafeInteger(patch.to) ||
      patch.from < previous ||
      patch.to < patch.from ||
      patch.to > source.length ||
      typeof patch.insert !== 'string'
    )
      throw new Error('Invalid source projection bridge');
    previous = patch.to;
    text += patch.insert.length;
    if (text > MAX_BRIDGE_TEXT) throw new Error('Source projection bridge text budget exceeded');
  }
  let next = source;
  for (let index = patches.length - 1; index >= 0; index--) {
    const patch = patches[index];
    if (patch) next = next.slice(0, patch.from) + patch.insert + next.slice(patch.to);
  }
  return next;
}
function bridgeBase(canonical: string, bridge: ProjectionBridge | undefined): string {
  if (!bridge) return canonical;
  const base = replayBridge(canonical, bridge.inverse);
  if (replayBridge(base, bridge.forward) !== canonical)
    throw new Error('Source history does not match its proven projection bridge');
  return base;
}
function projectionBridge(base: string, canonical: string): ProjectionBridge | undefined {
  if (base === canonical) return;
  const forward = diffText(base, canonical),
    inverse: Patch[] = [];
  let shift = 0;
  for (const patch of forward) {
    inverse.push({
      from: patch.from + shift,
      to: patch.from + shift + patch.insert.length,
      insert: base.slice(patch.from, patch.to),
    });
    shift += patch.insert.length - (patch.to - patch.from);
  }
  if (replayBridge(base, forward) !== canonical || replayBridge(canonical, inverse) !== base)
    throw new Error('Source projection bridge replay failed');
  return { forward, inverse };
}
const patchesBetween = diffText;

/** CodeMirror internal changes may contain cyclic line/marker handles. Only
 * public text-operation fields define the history checkpoint correspondence. */
export function historySignature(changes: unknown): string {
  if (changes === undefined || changes === null) return 'null';
  if (!Array.isArray(changes)) throw new Error('Invalid CodeMirror history changes');
  return JSON.stringify(
    changes.map((change: unknown) => {
      if (!change || typeof change !== 'object') throw new Error('Invalid history change');
      const position = (name: string) => {
        const value = Reflect.get(change, name);
        if (!value || typeof value !== 'object') throw new Error('Invalid history position');
        const line: unknown = Reflect.get(value, 'line'),
          ch: unknown = Reflect.get(value, 'ch');
        if (
          typeof line !== 'number' ||
          typeof ch !== 'number' ||
          !Number.isSafeInteger(line) ||
          !Number.isSafeInteger(ch)
        )
          throw new Error('Invalid history position');
        return { line, ch };
      };
      const text: unknown = Reflect.get(change, 'text');
      if (!Array.isArray(text) || !text.every((value: unknown) => typeof value === 'string'))
        throw new Error('Invalid history text');
      return { from: position('from'), to: position('to'), text };
    }),
  );
}

/** Captures original serializer node identity, not DOM text offsets. */
export class RuntimeSourceTracking {
  private serial = 0;
  private checkpoint = 0;
  private previous: Snapshot | undefined;
  private changes: RuntimeChange[] = [];
  private objectIdentities = new WeakMap<object, number>();
  private scalarIdentities = new Map<string, number>();
  private attachedUndo = new WeakSet<object>();
  private historyDepth = 0;
  private cmIds = new WeakMap<object, number>();
  private cmSerial = 0;
  private attached = new WeakSet<object>();
  private findPanels = new WeakSet<object>();
  private sourceFindReplace: { cm: object; base: string; patches: readonly Patch[] } | undefined;
  private inputDocuments = new WeakSet<Document>();
  private pendingInput: PlainInputCandidate | undefined;
  private pendingAction:
    | ((next: string, blocks?: readonly PlainBlockRange[]) => TrackedEdit | undefined)
    | undefined;
  private inputTicket = 0;
  private pendingCodeSelection: PendingCodeHistorySelection | undefined;
  private codeSelections = new WeakMap<object, CodeHistorySelection>();
  private pendingHistoryRestore:
    | { entry: object; selection: HistorySelection; index: number }
    | undefined;
  private pendingCodeRestore:
    | { entry: object; selection: CodeHistorySelection; index: number; direction: 'undo' | 'redo' }
    | undefined;
  private pendingHistorySelection: PendingHistorySelection | undefined;
  private historySelections = new WeakMap<object, HistorySelection>();
  private plainSelections = new WeakMap<object, PlainSelection>();
  private pendingUndoSelection: { metadata: PlainSelection; commands: unknown } | undefined;
  private readonly serialization: RuntimeSerializationRead;
  private prepared: Snapshot | undefined;
  private projectionEpoch = 0;
  private policyEnabled = false;
  private projectedPolicy: MarkdownSerializationPolicy | undefined;
  private journalPolicies = new Map<number, MarkdownSerializationPolicy>();
  private projectionBridges = new Map<number, ProjectionBridge>();
  constructor(
    private readonly runtime: LegacyGlobals,
    private readonly suspended: () => boolean,
  ) {
    this.serialization = new RuntimeSerializationRead(runtime);
  }

  /** Keep block ranges from this exact synchronous read until its one capture.
   * Equal text in a later read is still serialized with current node identities. */
  read(read: () => string, reset = false): { canonical: string; tracking: RuntimeTracking } {
    const snapshot = this.serialization.read(read);
    const previous = this.prepared;
    this.prepared = snapshot.blocks ? snapshot : undefined;
    try {
      return {
        canonical: snapshot.canonical,
        tracking: reset ? this.reset(snapshot.canonical) : this.capture(snapshot.canonical),
      };
    } finally {
      this.prepared = previous;
    }
  }
  private captureCurrent(): string {
    return this.read(() => this.runtime.editor?.getMarkdown() ?? '').canonical;
  }
  enableMarkdownProjection(): void {
    const policy = readMarkdownPolicy(this.runtime);
    this.policyEnabled = true;
    this.projectedPolicy = policy;
    if (this.previous) this.journalPolicies.set(this.checkpoint, policy);
  }

  /** Arm a host command or plain clipboard event before its original operation.
   * A later capture must still match the complete expected canonical output. */
  armAuthorizedReplacement(
    text: string,
    inputType: 'insertText' | 'deleteContentBackward',
  ): boolean {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    const editor = this.runtime.editor;
    if (
      !editor ||
      editor.sourceView.inSourceMode ||
      this.suspended() ||
      this.runtime.File?.isLocked
    )
      return false;
    this.captureCurrent();
    const previous = this.previous;
    if (!previous?.blocks) return false;
    const candidate = captureAuthorizedReplacement(
      {
        editor,
        canonical: previous.canonical,
        blocks: previous.blocks,
        ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
      },
      text,
      inputType,
    );
    this.pendingInput = candidate;
    const ticket = ++this.inputTicket;
    if (!candidate) return false;
    setTimeout(() => {
      if (ticket !== this.inputTicket) return;
      if (!this.suspended()) this.captureCurrent();
      if (ticket === this.inputTicket) this.pendingInput = undefined;
    }, 0);
    return true;
  }

  armAuthorizedTableAction(rowId: string, action: TableEditAction): boolean {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    const editor = this.runtime.editor;
    if (
      !editor ||
      editor.sourceView.inSourceMode ||
      this.suspended() ||
      this.runtime.File?.isLocked
    )
      return false;
    this.captureCurrent();
    const previous = this.previous;
    if (!previous?.blocks) return false;
    this.pendingAction = captureTableRowAction(
      this.runtime,
      previous.canonical,
      previous.blocks,
      rowId,
      action,
      this.runtime.File?.useCRLF ? '\r\n' : '\n',
    );
    const ticket = ++this.inputTicket;
    if (!this.pendingAction) return false;
    setTimeout(() => {
      if (ticket !== this.inputTicket) return;
      if (!this.suspended()) this.captureCurrent();
      if (ticket === this.inputTicket) this.pendingAction = undefined;
    }, 0);
    return true;
  }

  armAuthorizedCodeLineCut(
    cid: string,
    cm: NonNullable<LegacyEditor['sourceView']['cm']>,
    ranges: readonly CodeLineRange[],
  ): boolean {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    const editor = this.runtime.editor;
    if (
      !editor ||
      editor.sourceView.inSourceMode ||
      this.suspended() ||
      this.runtime.File?.isLocked
    )
      return false;
    this.captureCurrent();
    const previous = this.previous;
    if (!previous?.blocks) return false;
    this.pendingAction = captureCodeLineCut(
      editor,
      previous.canonical,
      previous.blocks,
      cid,
      cm,
      ranges,
    );
    if (!this.pendingAction) return false;
    const ticket = ++this.inputTicket;
    setTimeout(() => {
      if (ticket !== this.inputTicket) return;
      if (!this.suspended()) this.captureCurrent();
      if (ticket === this.inputTicket) this.pendingAction = undefined;
    }, 0);
    return true;
  }

  private armStructuralBreak(soft: boolean, event: KeyboardEvent | InputEvent): boolean {
    if (!this.policyEnabled || this.suspended() || this.runtime.File?.isLocked) return false;
    // Complete the preceding real input before replacing its pending evidence.
    this.captureCurrent();
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.pendingHistorySelection = undefined;
    this.pendingCodeSelection = undefined;
    this.inputTicket++;
    const previous = this.previous;
    if (!previous?.blocks) return false;
    const complete =
      captureStructuralBreak(this.runtime, previous.canonical, previous.blocks, soft) ??
      captureRootBreak(this.runtime, previous.canonical, previous.blocks, soft, event) ??
      (!soft
        ? captureBlockIndent(
            this.runtime,
            previous.canonical,
            previous.blocks,
            'exit-item',
            this.runtime.File?.useCRLF ? '\r\n' : '\n',
          )
        : undefined);
    if (!complete) return false;
    this.pendingAction = (next, blocks) => {
      const proved = complete(next, blocks);
      if (!proved) return;
      return {
        base: proved.base,
        patches: proved.patches,
        ...(proved.completePrefixes?.length ? { completePrefixes: proved.completePrefixes } : {}),
        ...(proved.normalizationPatches.length
          ? {
              normalization: {
                baseCanonical: proved.editCanonical,
                patches: proved.normalizationPatches,
                canonical: proved.canonical,
              },
            }
          : {}),
      };
    };
    const ticket = ++this.inputTicket;
    setTimeout(() => {
      if (ticket !== this.inputTicket) return;
      if (!this.suspended()) this.captureCurrent();
      if (ticket === this.inputTicket) this.pendingAction = undefined;
    }, 0);
    return true;
  }

  armStructuralIndent(action: BlockIndentAction | 'join-item'): boolean {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    const editor = this.runtime.editor;
    if (
      !this.policyEnabled ||
      !editor ||
      editor.sourceView.inSourceMode ||
      this.suspended() ||
      this.runtime.File?.isLocked
    )
      return false;
    this.captureCurrent();
    const previous = this.previous;
    if (!previous?.blocks) return false;
    const structural = captureBlockIndent(
      this.runtime,
      previous.canonical,
      previous.blocks,
      action,
      this.runtime.File?.useCRLF ? '\r\n' : '\n',
    );
    const narrow =
      !structural && (action === 'indent' || action === 'outdent')
        ? captureListIndent(
            editor,
            previous.canonical,
            previous.blocks,
            action,
            this.runtime.File?.useCRLF ? '\r\n' : '\n',
          )
        : undefined;
    if (!structural && !narrow) return false;
    this.pendingAction = (next) => {
      const proved = structural?.(next);
      const receipt = proved ?? narrow?.(next);
      if (!receipt) return;
      return {
        base: receipt.base,
        patches: receipt.patches,
        ...(proved?.completePrefixes.length ? { completePrefixes: proved.completePrefixes } : {}),
        ...(proved?.beforeNormalizationPatches?.length
          ? { beforeNormalization: proved.beforeNormalizationPatches }
          : {}),
        ...(receipt.normalizationPatches.length
          ? {
              normalization: {
                baseCanonical: receipt.editCanonical,
                patches: receipt.normalizationPatches,
                canonical: receipt.canonical,
              },
            }
          : {}),
      };
    };
    const ticket = ++this.inputTicket;
    setTimeout(() => {
      if (ticket !== this.inputTicket) return;
      if (!this.suspended()) this.captureCurrent();
      if (ticket === this.inputTicket) this.pendingAction = undefined;
    }, 0);
    return true;
  }

  reset(canonical: string): RuntimeTracking {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    this.checkpoint = ++this.serial;
    this.changes = [];
    this.objectIdentities = new WeakMap();
    this.pendingHistorySelection = undefined;
    this.pendingCodeSelection = undefined;
    this.codeSelections = new WeakMap();
    this.historySelections = new WeakMap();
    this.plainSelections = new WeakMap();
    this.scalarIdentities.clear();
    this.projectionEpoch = 0;
    this.projectionBridges.clear();
    this.projectedPolicy = this.policyEnabled ? readMarkdownPolicy(this.runtime) : undefined;
    this.journalPolicies = new Map(
      this.projectedPolicy ? [[this.checkpoint, this.projectedPolicy]] : [],
    );
    this.previous = this.snapshot(canonical);
    this.attach();
    this.remember(this.identity());
    return this.value();
  }
  markExternalReload(canonical: string, rawSource: string): RuntimeTracking {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    if (!this.previous) throw new Error('External reload requires an existing source checkpoint');
    if (this.lookup(this.identity()) !== undefined)
      throw new Error('External reload did not create a distinct original history operation');
    this.record(canonical, undefined, rawSource);
    return this.value();
  }
  captureActiveSelection(): ActivePlainSelection | undefined {
    const editor = this.runtime.editor;
    if (!editor || this.suspended() || editor.sourceView.inSourceMode) return;
    const canonical = this.captureCurrent();
    const blocks = this.previous?.blocks;
    return blocks
      ? captureActivePlainSelection(
          { editor, canonical, blocks, ending: this.runtime.File?.useCRLF ? '\r\n' : '\n' },
          this.checkpoint,
        )
      : undefined;
  }
  /** Original clipboard bookmarks misread an Element boundary as offset zero.
   * Re-express only a proven, focused plain range using actual text endpoints. */
  normalizePlainSelection(): boolean {
    const selection = this.captureActiveSelection();
    const editor = this.runtime.editor;
    const previous = this.previous;
    if (!selection || !editor || !previous?.blocks) return false;
    return restoreActivePlainSelection(
      {
        editor,
        canonical: previous.canonical,
        blocks: previous.blocks,
        ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
      },
      selection,
      true,
    );
  }
  save(activeSelection?: ActivePlainSelection): TrackingSnapshot {
    const editor = this.runtime.editor;
    const cm = editor?.sourceView.inSourceMode ? editor.sourceView.cm : undefined;
    const entries = (values: { changes?: unknown; generation?: number }[]) =>
      values.map((entry) => ({
        signature: historySignature(entry.changes),
        generation: entry.generation ?? null,
      }));
    return {
      checkpoint: this.checkpoint,
      canonical: this.previous?.canonical ?? '',
      ...(activeSelection?.checkpoint === this.checkpoint ? { activeSelection } : {}),
      nativeHistory: (editor?.undo.commandStack ?? []).map((entry) => ({
        signature: JSON.stringify(entry.redo),
        checkpoint: this.objectIdentities.get(entry.redo) ?? null,
      })),
      scalarIdentities: [...this.scalarIdentities],
      ...(this.policyEnabled
        ? {
            projectionEpoch: this.projectionEpoch,
            ...(this.projectedPolicy ? { projectedPolicy: this.projectedPolicy } : {}),
            journalPolicies: [...this.journalPolicies],
            projectionBridges: [...this.projectionBridges],
          }
        : {}),
      codeSelections: (editor?.undo.commandStack ?? []).flatMap((entry, index) => {
        const selection = this.codeSelections.get(entry);
        return selection
          ? [
              {
                index,
                undo: JSON.stringify(Reflect.get(entry, 'undo')),
                redo: JSON.stringify(entry.redo),
                selection: { cid: selection.cid, before: selection.before, after: selection.after },
              },
            ]
          : [];
      }),
      historySelections: (editor?.undo.commandStack ?? []).flatMap((entry, index) => {
        const selection = this.historySelections.get(entry);
        return selection
          ? [{ index, signature: JSON.stringify(Reflect.get(entry, 'undo')), selection }]
          : [];
      }),
      plainSelections: (editor?.undo.commandStack ?? []).flatMap((entry, index) => {
        const selection = this.plainSelections.get(entry);
        return selection
          ? [{ index, signature: JSON.stringify(Reflect.get(entry, 'undo')), selection }]
          : [];
      }),
      ...(cm
        ? {
            sourceHistory: {
              prefix: String(this.identity()).split(':').slice(0, 2).join(':'),
              generation: cm.doc.history.generation,
              maxGeneration: cm.doc.history.maxGeneration,
              done: entries(cm.doc.history.done),
              undone: entries(cm.doc.history.undone),
            },
          }
        : {}),
    };
  }

  restore(saved: TrackingSnapshot, canonical: string): RuntimeTracking {
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    if (saved.canonical !== canonical)
      throw new Error('Restored serializer does not match saved checkpoint');
    this.checkpoint = saved.checkpoint;
    this.serial = Math.max(this.serial, saved.checkpoint);
    this.changes = [];
    this.objectIdentities = new WeakMap();
    this.scalarIdentities = new Map(saved.scalarIdentities);
    this.projectionEpoch = saved.projectionEpoch ?? 0;
    this.projectedPolicy =
      saved.projectedPolicy ?? (this.policyEnabled ? readMarkdownPolicy(this.runtime) : undefined);
    this.journalPolicies = new Map(
      saved.journalPolicies ??
        (this.projectedPolicy ? [[this.checkpoint, this.projectedPolicy]] : []),
    );
    this.projectionBridges = new Map(saved.projectionBridges ?? []);
    const entries = this.runtime.editor?.undo.commandStack ?? [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index],
        prior = saved.nativeHistory[index];
      if (
        entry &&
        prior &&
        prior.checkpoint !== null &&
        JSON.stringify(entry.redo) === prior.signature
      )
        this.objectIdentities.set(entry.redo, prior.checkpoint);
    }
    this.pendingHistorySelection = undefined;
    this.pendingCodeSelection = undefined;
    this.codeSelections = new WeakMap();
    for (const record of saved.codeSelections ?? []) {
      const entry = entries[record.index],
        editor = this.runtime.editor;
      if (
        !entry ||
        !editor ||
        JSON.stringify(Reflect.get(entry, 'undo')) !== record.undo ||
        JSON.stringify(entry.redo) !== record.redo
      )
        continue;
      const metadata = rebindRestoredCodeHistorySelection(editor, record.selection, entry);
      if (metadata) this.codeSelections.set(entry, metadata);
    }
    this.historySelections = new WeakMap();
    for (const record of saved.historySelections ?? []) {
      const entry = entries[record.index];
      if (entry && JSON.stringify(Reflect.get(entry, 'undo')) === record.signature)
        this.historySelections.set(entry, record.selection);
    }
    this.plainSelections = new WeakMap();
    for (const record of saved.plainSelections ?? []) {
      const entry = entries[record.index];
      if (entry && JSON.stringify(Reflect.get(entry, 'undo')) === record.signature)
        this.plainSelections.set(entry, record.selection);
    }
    const cm = this.runtime.editor?.sourceView.cm,
      sourceHistory = saved.sourceHistory;
    if (cm && sourceHistory) {
      for (const direction of ['done', 'undone'] as const) {
        const actual = cm.doc.history[direction],
          stored = sourceHistory[direction];
        if (
          actual.length !== stored.length ||
          actual.some(
            (entry, index) => historySignature(entry.changes) !== stored[index]?.signature,
          )
        )
          throw new Error('Restored CodeMirror history does not match saved operation identities');
        for (let index = 0; index < actual.length; index++) {
          const entry = actual[index],
            before = stored[index];
          if (entry && before?.generation != null) entry.generation = before.generation;
        }
      }
      cm.doc.history.generation = sourceHistory.generation;
      cm.doc.history.maxGeneration = Math.max(
        cm.doc.history.maxGeneration,
        sourceHistory.maxGeneration,
      );
      const prefix = String(this.identity()).split(':').slice(0, 2).join(':');
      for (const [identity, checkpoint] of saved.scalarIdentities)
        if (identity.startsWith(sourceHistory.prefix + ':'))
          this.scalarIdentities.set(
            prefix + identity.slice(sourceHistory.prefix.length),
            checkpoint,
          );
    }
    this.previous = this.snapshot(canonical);
    this.attach();
    this.remember(this.identity());
    const editor = this.runtime.editor,
      blocks = this.previous.blocks;
    if (editor && blocks && saved.activeSelection?.checkpoint === saved.checkpoint) {
      const context: PlainInputContext = {
        editor,
        canonical,
        blocks,
        ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
      };
      if (restoreActivePlainSelection(context, saved.activeSelection)) {
        // Native snapshot loading schedules 80/200ms refreshes. With collapsed
        // markers, their first expansion can move a restored body-start caret
        // outside the formatting pair. Finalize the actual restored target's
        // view now, then reapply the same proven source/role/direction. No timer
        // is canceled, and passive/unproved selections never enter this branch.
        editor.refresh();
        restoreActivePlainSelection(context, saved.activeSelection);
      }
    }
    return this.value();
  }
  acknowledge(checkpoint: number): void {
    const index = this.changes.findIndex((change) => change.checkpoint === checkpoint);
    if (index >= 0) this.changes.splice(0, index + 1);
  }
  capture(canonical: string): RuntimeTracking {
    this.attach();
    if (!this.previous) return this.reset(canonical);
    if (this.pendingAction && canonical !== this.previous.canonical) {
      const complete = this.pendingAction;
      this.pendingAction = undefined;
      this.inputTicket++;
      this.record(canonical, complete(canonical, this.prepared?.blocks ?? undefined));
      return this.value();
    }
    const codeSelection = this.pendingCodeSelection;
    const nativeEditor = this.runtime.editor;
    const codeEntry = nativeEditor?.undo.commandStack[nativeEditor.undo.index];
    if (codeSelection && codeEntry && nativeEditor) {
      const metadata = bindCodeHistorySelection(
        nativeEditor,
        codeSelection,
        codeEntry,
        this.codeSelections.get(codeEntry),
      );
      if (metadata) this.codeSelections.set(codeEntry, metadata);
      if (codeEntry !== codeSelection.priorEntry) this.pendingCodeSelection = undefined;
    }
    const historySelection = this.pendingHistorySelection;
    const currentEntry = this.runtime.editor?.undo.commandStack[this.runtime.editor.undo.index];
    if (historySelection && currentEntry) {
      const metadata = bindHistorySelection(historySelection, currentEntry);
      if (metadata && !this.historySelections.has(currentEntry))
        this.historySelections.set(currentEntry, metadata);
      if (currentEntry !== historySelection.priorEntry) this.pendingHistorySelection = undefined;
    }
    const candidate = this.pendingInput;
    if (candidate && candidate.base === this.previous.canonical && candidate.next === canonical) {
      this.pendingInput = undefined;
      this.inputTicket++;
      this.record(canonical, candidate);
      const editor = this.runtime.editor,
        blocks = this.previous?.blocks;
      if (
        editor &&
        blocks &&
        repairPlainRedoCursor(
          { editor, canonical, blocks, ending: this.runtime.File?.useCRLF ? '\r\n' : '\n' },
          candidate,
        )
      ) {
        const entry = editor.undo.commandStack[editor.undo.index];
        const metadata = entry ? plainUndoSelection(candidate, entry) : undefined;
        if (entry && metadata && !this.plainSelections.has(entry))
          this.plainSelections.set(entry, metadata);
      }
    } else this.record(canonical);
    return this.value();
  }
  /** A validated configuration commit changes coordinates, not document history.
   * Source CodeMirror is literal; retain its last live policy until hide actually
   * serializes that model. Only scalar policy identities enter retained history. */
  rebasePolicy(canonical: string): RuntimeTracking {
    const previous = this.previous;
    if (!this.policyEnabled || !previous || this.suspended())
      throw new Error('Source projection is unavailable');
    const policy = readMarkdownPolicy(this.runtime);
    const sourceMode = this.runtime.editor?.sourceView.inSourceMode;
    const serialized = sourceMode
      ? undefined
      : serializePolicyModel(this.runtime, capturePolicyModel(this.runtime), policy);
    if (serialized && serialized.canonical !== canonical)
      throw new Error('Candidate serializer projection no longer matches the model');
    if (sourceMode && canonical !== previous.canonical)
      throw new Error('Source-mode preference changes cannot replace CodeMirror text');
    const patches = diffText(previous.canonical, canonical);
    const next: Snapshot = serialized ?? { canonical, blocks: null };
    const origin = this.journalPolicies.get(this.checkpoint) ?? this.projectedPolicy ?? policy;
    const identity = this.identity();
    const previousBridge = this.projectionBridges.get(this.checkpoint);
    const bridge = projectionBridge(
      previousBridge?.native && !bridgeApplies(previous.canonical, previousBridge)
        ? previous.canonical
        : bridgeBase(previous.canonical, previousBridge),
      canonical,
    );
    // A live WYS policy commit is already checked against the isolated model.
    // Source-only commits keep their old rule; their stale nodeMap is no proof.
    if (!sourceMode || previousBridge?.native) markNativeBridge(bridge, canonical);
    if (!Number.isSafeInteger(this.projectionEpoch + 1) || !Number.isSafeInteger(this.serial + 1))
      throw new Error('Serializer checkpoint space exhausted');
    const change: RuntimeChange = {
      baseCheckpoint: this.checkpoint,
      checkpoint: this.serial + 1,
      baseProjectionEpoch: this.projectionEpoch,
      patches,
      normalization: true,
      canonicalProjection: {
        baseProjectionEpoch: this.projectionEpoch,
        baseCanonical: previous.canonical,
        patches,
      },
    };
    this.pendingInput = undefined;
    this.pendingAction = undefined;
    this.inputTicket++;
    this.serial++;
    this.checkpoint = change.checkpoint;
    this.projectionEpoch++;
    this.changes.push(change);
    this.previous = next;
    if (!sourceMode) this.projectedPolicy = policy;
    this.journalPolicies.set(this.checkpoint, origin);
    if (bridge) this.projectionBridges.set(this.checkpoint, bridge);
    this.remember(identity);
    return this.value();
  }
  private value(): RuntimeTracking {
    return {
      checkpoint: this.checkpoint,
      changes: [...this.changes],
      ...(this.policyEnabled ? { projectionEpoch: this.projectionEpoch } : {}),
    };
  }
  private mathCursorIdentity(identity: object | string): identity is object {
    const editor = this.runtime.editor,
      entry = editor?.undo.commandStack[editor.undo.index],
      undo: unknown = entry && Reflect.get(entry, 'undo'),
      redo: unknown = entry?.redo;
    return (
      typeof identity === 'object' &&
      entry?.redo === identity &&
      Array.isArray(undo) &&
      Array.isArray(redo) &&
      undo.length > 0 &&
      redo.length > 0 &&
      [...undo, ...redo].every(
        (command: unknown) =>
          command !== null &&
          typeof command === 'object' &&
          Reflect.get(command, 'type') === 'cursor',
      ) &&
      redo.every((command: object) => {
        const cid: unknown = Reflect.get(command, 'id');
        return typeof cid === 'string' && editor?.getNode(cid)?.get('type') === 'math_block';
      })
    );
  }
  private remember(identity: object | string): void {
    // A math CM exposes its new value before its content entry is appended.
    // Its preceding cursor-only receipt continues to denote the old text.
    if (this.mathCursorIdentity(identity) && this.objectIdentities.has(identity)) return;
    if (typeof identity === 'string') this.scalarIdentities.set(identity, this.checkpoint);
    else this.objectIdentities.set(identity, this.checkpoint);
  }
  private lookup(identity: object | string): number | undefined {
    return typeof identity === 'string'
      ? this.scalarIdentities.get(identity)
      : this.objectIdentities.get(identity);
  }
  private identity(): object | string {
    const editor = this.runtime.editor;
    if (!editor) return 'uninitialized';
    const cm = editor.sourceView.cm;
    if (editor.sourceView.inSourceMode && cm) {
      let id = this.cmIds.get(cm);
      if (id === undefined) {
        id = ++this.cmSerial;
        this.cmIds.set(cm, id);
      }
      return `cm:${id}:${cm.doc.history.generation}`;
    }
    const entry = editor.undo.commandStack[editor.undo.index];
    return entry?.redo ?? 'native:initial';
  }
  private snapshot(canonical: string): Snapshot {
    const prepared = this.prepared;
    this.prepared = undefined;
    if (prepared?.canonical === canonical) return prepared;
    const editor = this.runtime.editor;
    if (!editor || editor.sourceView.inSourceMode) return { canonical, blocks: null };
    const ending = this.runtime.File?.useCRLF ? '\r\n' : '\n';
    const nodes: LegacyNode[] = [];
    let node = editor.nodeMap.blocks.sortedFirst()?.getFirstBrother();
    const seen = new Set<string>();
    while (node) {
      if (seen.has(node.cid)) return { canonical, blocks: null };
      seen.add(node.cid);
      nodes.push(node);
      node = node.get('after');
    }
    const blocks: BlockRange[] = [];
    let joined = '';
    for (let index = 0; index < nodes.length; index++) {
      const current = nodes[index];
      if (!current) continue;
      const text = current.toMark() + (index + 1 < nodes.length ? ending : '');
      blocks.push({ id: current.cid, from: joined.length, to: joined.length + text.length, text });
      joined += text;
    }
    const wrapped = editor.warpContentWithOption(joined);
    if (wrapped !== canonical || !canonical.startsWith(joined)) return { canonical, blocks: null };
    const last = blocks.at(-1);
    if (last) {
      last.text += canonical.slice(joined.length);
      last.to = canonical.length;
    }
    return { canonical, blocks };
  }
  private record(canonical: string, exact?: TrackedEdit, externalSource?: string): void {
    const previous = this.previous;
    if (!previous || this.suspended()) return;
    const identity = this.identity();
    if (
      this.historyDepth === 0 &&
      !exact?.history &&
      canonical !== previous.canonical &&
      this.mathCursorIdentity(identity) &&
      !this.objectIdentities.has(identity)
    )
      // Selection inside the math CM can append its first cursor receipt
      // between two reads. Bind that still-content-free receipt before the
      // pending edit advances the checkpoint, rather than to the new text.
      this.objectIdentities.set(identity, this.checkpoint);
    const historyTarget =
      this.historyDepth > 0 || exact?.history ? this.lookup(identity) : undefined;
    const policy = this.policyEnabled ? readMarkdownPolicy(this.runtime) : undefined;
    const sourceMode = this.runtime.editor?.sourceView.inSourceMode;
    // A Source hide may be the first read affected by a setting accepted while
    // its CodeMirror was open. Prove the old representation on this same model.
    if (
      policy &&
      historyTarget === undefined &&
      externalSource === undefined &&
      !sourceMode &&
      this.projectedPolicy &&
      !sameMarkdownPolicy(policy, this.projectedPolicy)
    ) {
      const old = serializePolicyModel(
        this.runtime,
        capturePolicyModel(this.runtime),
        this.projectedPolicy,
      );
      if (old.canonical === previous.canonical) {
        this.rebasePolicy(canonical);
        return;
      }
      if (old.canonical !== canonical)
        throw new Error('无法分离源码模式编辑与缩进策略变化，已保留原稿');
    }
    let canonicalProjection: RuntimeChange['canonicalProjection'];
    const journalPolicy =
      historyTarget === undefined ? undefined : this.journalPolicies.get(historyTarget);
    const sourceBridge =
      historyTarget === undefined ? undefined : this.projectionBridges.get(historyTarget);
    if (
      historyTarget !== undefined &&
      sourceBridge &&
      ((sourceMode && !sourceBridge.native) ||
        (sourceBridge.native && bridgeApplies(canonical, sourceBridge)))
    ) {
      // The actual CM history generation identifies this exact checkpoint. Its
      // bridge was proved while the live model was current, never against the
      // stale nodeMap left behind Source mode. Core also checks the reconstructed
      // base against the complete target journal canonical before restoring raw.
      canonicalProjection = {
        baseProjectionEpoch: this.projectionEpoch,
        baseCanonical: bridgeBase(canonical, sourceBridge),
        patches: sourceBridge.forward,
      };
    }
    if (
      policy &&
      historyTarget !== undefined &&
      journalPolicy &&
      !canonicalProjection &&
      !sourceMode &&
      !sameMarkdownPolicy(policy, journalPolicy)
    ) {
      let historical = serializePolicyModel(
        this.runtime,
        capturePolicyModel(this.runtime),
        journalPolicy,
      ).canonical;
      if (sourceBridge?.native && bridgeApplies(historical, sourceBridge))
        historical = bridgeBase(historical, sourceBridge);
      canonicalProjection = {
        baseProjectionEpoch: this.projectionEpoch,
        baseCanonical: historical,
        patches: diffText(historical, canonical),
      };
    }
    if (
      canonical === previous.canonical &&
      externalSource === undefined &&
      !canonicalProjection &&
      (historyTarget === undefined || historyTarget === this.checkpoint)
    ) {
      this.remember(identity);
      this.previous = this.snapshot(canonical);
      return;
    }
    const next = this.snapshot(canonical);
    if (exact?.completePrefixes && (historyTarget !== undefined || externalSource !== undefined))
      throw new Error(
        'Structural prefix authorization cannot replace a history or external version',
      );
    let patches: readonly Patch[];
    let editPatches: readonly Patch[] | undefined;
    let placementRanges: { from: number; to: number }[] | undefined;
    let placementChecks: PlacementCheck[] | undefined;
    if (externalSource !== undefined) patches = diffText(previous.canonical, canonical);
    else if (historyTarget !== undefined) {
      // The real original history identity already names a journal target.
      // Transport its canonical delta without inferring fresh edit placement
      // across cids removed/recreated by Undo. Core still verifies the complete
      // target canonical before restoring its raw source representation.
      patches = diffText(previous.canonical, canonical);
    } else if (exact?.base === previous.canonical) {
      if (exact.normalization) {
        if (
          historyTarget !== undefined ||
          canonicalProjection ||
          exact.normalization.canonical !== canonical
        )
          throw new Error('Inconsistent content normalization receipt');
        let intermediate = previous.canonical;
        for (let index = exact.patches.length - 1; index >= 0; index--) {
          const patch = exact.patches[index];
          if (patch)
            intermediate =
              intermediate.slice(0, patch.from) + patch.insert + intermediate.slice(patch.to);
        }
        if (intermediate !== exact.normalization.baseCanonical)
          throw new Error('Content patches do not reproduce normalization anchor');
        editPatches = exact.patches;
        canonicalProjection = {
          baseProjectionEpoch: this.projectionEpoch,
          baseCanonical: intermediate,
          patches: exact.normalization.patches,
        };
        let actual = intermediate;
        for (let index = canonicalProjection.patches.length - 1; index >= 0; index--) {
          const patch = canonicalProjection.patches[index];
          if (patch) actual = actual.slice(0, patch.from) + patch.insert + actual.slice(patch.to);
        }
        if (actual !== canonical)
          throw new Error('Normalization does not reproduce actual canonical');
        patches = diffText(previous.canonical, canonical);
      } else patches = exact.patches;
    } else {
      const aligned = this.align(previous, next);
      patches = aligned.patches;
      placementRanges = aligned.ranges;
      placementChecks = aligned.placementChecks;
    }
    let verified = previous.canonical;
    for (let index = patches.length - 1; index >= 0; index--) {
      const patch = patches[index];
      if (patch) verified = verified.slice(0, patch.from) + patch.insert + verified.slice(patch.to);
    }
    if (verified !== canonical)
      throw new Error('Runtime checkpoint patches do not reproduce canonical text');
    // A primary content edit journals its complete canonical, including proven
    // serializer padding. Only a history restore retains another journal anchor.
    const bridge =
      canonicalProjection && historyTarget !== undefined
        ? projectionBridge(canonicalProjection.baseCanonical, canonical)
        : undefined;
    let beforeBridge: ProjectionBridge | undefined;
    if (exact?.beforeNormalization) {
      if (
        historyTarget !== undefined ||
        externalSource !== undefined ||
        !exact.normalization ||
        !exact.completePrefixes?.length ||
        exact.base !== previous.canonical ||
        sourceMode
      )
        throw Error('Invalid structural pre-history normalization');
      const previousBridge = this.projectionBridges.get(this.checkpoint);
      const anchor =
        previousBridge &&
        (!previousBridge.native || bridgeApplies(previous.canonical, previousBridge))
          ? bridgeBase(previous.canonical, previousBridge)
          : previous.canonical;
      for (const patch of exact.beforeNormalization) {
        const old = /^(\d+)([.)][ \t]+)$/u.exec(previous.canonical.slice(patch.from, patch.to)),
          next = /^(\d+)([.)][ \t]+)$/u.exec(patch.insert);
        if (
          !old ||
          !next ||
          old[2] !== next[2] ||
          (old[1]?.replace(/^0+/u, '') || '0') !== (next[1]?.replace(/^0+/u, '') || '0') ||
          exact.patches.some((p) => p.from < patch.to && p.to > patch.from)
        )
          throw Error('Structural pre-history normalization is not an unchanged numeral');
        const shift = exact.patches
          .filter((p) => p.to <= patch.from)
          .reduce((sum, p) => sum + p.insert.length - (p.to - p.from), 0);
        if (
          !exact.normalization.patches.some(
            (p) =>
              p.from === patch.from + shift &&
              p.to === patch.to + shift &&
              p.insert === patch.insert,
          )
        )
          throw Error('Structural pre-history normalization does not commute with the actual edit');
      }
      const normalized = replayBridge(previous.canonical, exact.beforeNormalization);
      beforeBridge = projectionBridge(anchor, normalized);
      markNativeBridge(beforeBridge, normalized);
    }
    if (sourceBridge?.native) markNativeBridge(bridge, canonical);
    const change: RuntimeChange = {
      baseCheckpoint: this.checkpoint,
      checkpoint: ++this.serial,
      ...(this.policyEnabled ? { baseProjectionEpoch: this.projectionEpoch } : {}),
      patches,
      ...(editPatches ? { editPatches } : {}),
      ...(exact?.base === previous.canonical && exact.completePrefixes?.length
        ? { completePrefixes: exact.completePrefixes }
        : {}),
      ...(canonicalProjection ? { canonicalProjection } : {}),
      ...(externalSource !== undefined
        ? { externalSource }
        : historyTarget === undefined
          ? placementRanges
            ? { placementRanges, ...(placementChecks ? { placementChecks } : {}) }
            : {}
          : { historyTarget }),
    };
    if (beforeBridge) this.projectionBridges.set(this.checkpoint, beforeBridge);
    this.checkpoint = change.checkpoint;
    if (canonicalProjection) this.projectionEpoch++;
    this.changes.push(change);
    this.previous = next;
    this.projectedPolicy = policy;
    if (policy) this.journalPolicies.set(this.checkpoint, journalPolicy ?? policy);
    if (bridge) this.projectionBridges.set(this.checkpoint, bridge);
    this.remember(identity);
  }
  private align(
    before: Snapshot,
    after: Snapshot,
  ): {
    patches: readonly Patch[];
    ranges: { from: number; to: number }[];
    placementChecks?: PlacementCheck[];
  } {
    const fallback = () => ({
      patches: patchesBetween(before.canonical, after.canonical),
      ranges: [{ from: 0, to: before.canonical.length }],
    });
    if (!before.blocks || !after.blocks) return fallback();
    const oldById = new Map(before.blocks.map((block, index) => [block.id, { block, index }]));
    const common = after.blocks.flatMap((block) => {
      const old = oldById.get(block.id);
      return old ? [{ old: old.block, next: block, index: old.index }] : [];
    });
    if (common.some((entry, index) => index > 0 && entry.index <= (common[index - 1]?.index ?? -1)))
      return fallback();
    const patches: Patch[] = [],
      ranges: { from: number; to: number }[] = [];
    let oldAt = 0,
      newAt = 0;
    const gap = (oldTo: number, newTo: number, precise: boolean) => {
      const original = before.canonical.slice(oldAt, oldTo),
        replacement = after.canonical.slice(newAt, newTo);
      if (original !== replacement) {
        // A missing cid establishes an exact block removal/insertion domain; changed
        // surviving nodes still require ambiguity checking inside their serializer range.
        const delta = patchesBetween(original, replacement);
        patches.push(
          ...delta.map((patch) => ({
            from: oldAt + patch.from,
            to: oldAt + patch.to,
            insert: patch.insert,
          })),
        );
        for (const patch of delta)
          ranges.push(
            precise && (!original || !replacement)
              ? { from: oldAt + patch.from, to: oldAt + patch.to }
              : { from: oldAt, to: oldTo },
          );
      }
      oldAt = oldTo;
      newAt = newTo;
    };
    for (const entry of common) {
      gap(entry.old.from, entry.next.from, true);
      gap(entry.old.to, entry.next.to, false);
    }
    gap(before.canonical.length, after.canonical.length, true);
    return normalizeTrackedPatches(before.canonical, after.canonical, patches, ranges);
  }
  private attachPlainInput(): void {
    const editor = this.runtime.editor,
      document = editor?.writingArea.ownerDocument;
    if (!editor || !document || this.inputDocuments.has(document)) return;
    this.inputDocuments.add(document);
    const capture = (event: KeyboardEvent | InputEvent) => {
      if (this.suspended() || this.runtime.File?.isLocked) {
        this.pendingInput = undefined;
        this.pendingAction = undefined;
        this.pendingHistorySelection = undefined;
        this.pendingCodeSelection = undefined;
        this.inputTicket++;
        return;
      }
      const active = this.runtime.editor;
      if (!active || active.sourceView.inSourceMode) return;
      const keyboard = event.type === 'keydown';
      const key = event as KeyboardEvent,
        input = event as InputEvent;
      const tab = keyboard && key.key === 'Tab' && !key.metaKey && !key.ctrlKey && !key.altKey;
      const paragraphBreak = keyboard
        ? key.key === 'Enter' &&
          !key.metaKey &&
          !key.ctrlKey &&
          !key.altKey &&
          !key.isComposing &&
          key.keyCode !== 229
        : !input.isComposing && ['insertParagraph', 'insertLineBreak'].includes(input.inputType);
      const relevant =
        tab ||
        paragraphBreak ||
        (keyboard
          ? !key.metaKey &&
            !key.ctrlKey &&
            !key.altKey &&
            !key.shiftKey &&
            ['Backspace', 'Delete'].includes(key.key)
          : [
              'deleteContentBackward',
              'deleteContentForward',
              'insertText',
              'insertReplacementText',
            ].includes(input.inputType));
      const target = event.target as Node | null;
      if (
        !relevant ||
        !target ||
        target.ownerDocument !== active.writingArea.ownerDocument ||
        !active.writingArea.contains(target)
      ) {
        if (this.pendingInput || this.pendingAction || this.pendingHistorySelection)
          this.captureCurrent();
        this.pendingInput = undefined;
        this.pendingAction = undefined;
        this.pendingHistorySelection = undefined;
        this.pendingCodeSelection = undefined;
        this.inputTicket++;
        return;
      }
      if (tab) {
        if (!key.isComposing && key.keyCode !== 229 && !active.isIME) {
          const selection = document.getSelection(),
            element = (node: Node | null | undefined) =>
              node?.nodeType === 1 ? (node as Element) : node?.parentElement,
            cell = element(selection?.anchorNode)?.closest('[mdtype="table_cell"][cid]'),
            focus = element(selection?.focusNode)?.closest('[mdtype="table_cell"][cid]');
          if (cell && cell === focus) {
            const context = readTableRowContext(this.runtime, cell),
              rows = context?.rows.rows,
              first = rows?.[0],
              last = rows?.at(-1),
              id = cell.getAttribute('cid');
            if (key.shiftKey && first?.cells?.[0]?.id === id) {
              this.armAuthorizedTableAction(first.id, 'after');
              return;
            }
            if (!key.shiftKey && last?.cells?.at(-1)?.id === id) {
              this.armAuthorizedTableAction(last.id, 'after');
              return;
            }
          }
        }
        this.armStructuralIndent(key.shiftKey ? 'outdent' : 'indent');
        return;
      }
      if (paragraphBreak) {
        this.armStructuralBreak(
          keyboard ? key.shiftKey : input.inputType === 'insertLineBreak',
          event,
        );
        return;
      }
      if (
        event.isTrusted &&
        !active.isIME &&
        (keyboard
          ? !key.isComposing && key.keyCode !== 229 && ['Backspace', 'Delete'].includes(key.key)
          : !input.isComposing &&
            ['deleteContentBackward', 'deleteContentForward'].includes(input.inputType))
      ) {
        const deletion = captureTableCellSelection(active);
        if (deletion && this.armAuthorizedTableAction(deletion.rowId, deletion.action)) return;
      }
      if (keyboard && key.key === 'Backspace') {
        const selection = document.getSelection();
        const node = selection?.anchorNode;
        const paragraph = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest(
          'p[cid]',
        );
        if (
          selection?.isCollapsed &&
          selection.anchorOffset === 0 &&
          paragraph?.parentElement?.matches('li[cid]') &&
          this.armStructuralIndent('join-item')
        )
          return;
      }
      this.captureCurrent();
      const previous = this.previous;
      if (!previous?.blocks) return;
      const selectionContext = {
        runtime: this.runtime,
        editor: active,
        canonical: previous.canonical,
        blocks: previous.blocks,
        ending: this.runtime.File?.useCRLF ? ('\r\n' as const) : ('\n' as const),
      };
      const activeEntry = active.undo.commandStack[active.undo.index];
      const capturedCode = captureCodeHistorySelection(
        active,
        event,
        activeEntry ? this.codeSelections.get(activeEntry) : undefined,
      );
      if (capturedCode) this.pendingCodeSelection = capturedCode;
      const capturedSelection = captureHistorySelection(selectionContext, event);
      if (capturedSelection) this.pendingHistorySelection = capturedSelection;
      const candidate = capturePlainInput(
        {
          editor: active,
          canonical: previous.canonical,
          blocks: previous.blocks,
          ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
        },
        event,
      );
      if (
        event.type === 'beforeinput' &&
        !candidate &&
        this.pendingInput?.base === previous.canonical
      )
        return;
      this.pendingInput = candidate;
      const ticket = ++this.inputTicket;
      if (!candidate && !this.pendingHistorySelection && !this.pendingCodeSelection) return;
      setTimeout(() => {
        if (ticket !== this.inputTicket) return;
        if (!this.suspended()) this.captureCurrent();
        if (ticket === this.inputTicket) {
          this.pendingInput = undefined;
          this.pendingHistorySelection = undefined;
          this.pendingCodeSelection = undefined;
        }
      }, 0);
    };
    document.addEventListener('keydown', capture, true);
    document.addEventListener('beforeinput', capture, true);
    for (const type of ['compositionstart', 'pointerdown', 'paste', 'drop'])
      document.addEventListener(
        type,
        (event) => {
          this.pendingInput = undefined;
          this.pendingAction = undefined;
          this.pendingHistorySelection = undefined;
          this.pendingCodeSelection = undefined;
          this.inputTicket++;
          if (type !== 'paste' || !(event instanceof ClipboardEvent)) return;
          const target = event.target as Node | null,
            editor = this.runtime.editor,
            data = event.clipboardData;
          if (!editor || !target || !editor.writingArea.contains(target) || !data) return;
          // Plain Markdown may be parsed into several new blocks. Its exact
          // selected source range is stronger evidence than diffing moved cids.
          // Rich/image input keeps its separate semantic conversion path.
          if (data.files.length || data.getData('text/html') || data.getData('text/markhtml'))
            return;
          const text = data.getData('text/plain');
          if (text) this.armAuthorizedReplacement(text, 'insertText');
        },
        true,
      );
  }

  private attach(): void {
    this.attachPlainInput();
    this.attachSourceFindReplace();
    const undo = this.runtime.editor?.undo;
    if (undo && !this.attachedUndo.has(undo)) {
      this.attachedUndo.add(undo);
      for (const name of ['undo', 'redo'] as const) {
        const original = undo[name];
        undo[name] = (...args: unknown[]) => {
          if (!this.suspended() && this.historyDepth === 0) this.captureCurrent();
          if (this.historyDepth === 0) {
            this.pendingUndoSelection = undefined;
            this.pendingHistoryRestore = undefined;
            this.pendingCodeRestore = undefined;
          }
          const entry = undo.commandStack[undo.index];
          const metadata = name === 'undo' && entry ? this.plainSelections.get(entry) : undefined;
          const historySelection =
            name === 'undo' && entry ? this.historySelections.get(entry) : undefined;
          const codeEntry = name === 'undo' ? entry : undo.commandStack[undo.index + 1];
          const historyEditor = this.runtime.editor,
            historyFile = this.runtime.File,
            mathCommands: unknown = codeEntry && Reflect.get(codeEntry, name),
            mathId =
              Array.isArray(mathCommands) &&
              mathCommands.length === 1 &&
              mathCommands[0]?.type === 'fences'
                ? mathCommands[0].id
                : undefined,
            mathContent =
              typeof mathId === 'string' &&
              historyEditor?.getNode(mathId)?.get('type') === 'math_block';
          const codeSelection = codeEntry ? this.codeSelections.get(codeEntry) : undefined;
          this.historyDepth++;
          try {
            return Reflect.apply(original, undo, args);
          } finally {
            try {
              if (historySelection && entry)
                this.pendingHistoryRestore = {
                  entry,
                  selection: historySelection,
                  index: undo.index,
                };
              if (codeSelection && codeEntry)
                this.pendingCodeRestore = {
                  entry: codeEntry,
                  selection: codeSelection,
                  index: undo.index,
                  direction: name,
                };
              if (metadata && entry)
                this.pendingUndoSelection = { metadata, commands: Reflect.get(entry, 'undo') };
              if (!this.suspended() && this.historyDepth === 1) {
                // Native math history changes its CM first. The model is only
                // synchronized by File.sync; reading getMarkdown here would
                // journal the old model against the new history index, before
                // the ordinary SDK state flush exposes the restored formula.
                const canonical =
                  mathContent &&
                  historyFile &&
                  this.runtime.editor === historyEditor &&
                  this.runtime.File === historyFile
                    ? this.read(
                        () => historyFile.sync(false, false, true) ?? historyEditor.getMarkdown(),
                      ).canonical
                    : this.captureCurrent();
                const editor = this.runtime.editor,
                  blocks = this.previous?.blocks,
                  selection = this.pendingUndoSelection;
                if (editor && blocks && selection)
                  restorePlainUndoSelection(
                    {
                      editor,
                      canonical,
                      blocks,
                      ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
                    },
                    selection.metadata,
                    selection.commands,
                  );
                const historyRestore = this.pendingHistoryRestore;
                const codeRestore = this.pendingCodeRestore;
                if (editor && blocks && historyRestore && historyRestore.index === undo.index)
                  restoreHistorySelection(
                    {
                      runtime: this.runtime,
                      editor,
                      canonical,
                      blocks,
                      ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
                    },
                    historyRestore.selection,
                    Reflect.get(historyRestore.entry, 'undo'),
                  );
                if (editor && codeRestore && codeRestore.index === undo.index)
                  restoreCodeHistorySelection(
                    editor,
                    codeRestore.selection,
                    codeRestore.entry,
                    codeRestore.direction,
                  );
                if (name === 'redo' && editor && blocks && codeEntry)
                  repairStructuralHistoryDOM(
                    this.runtime,
                    {
                      editor,
                      canonical,
                      blocks,
                      ending: this.runtime.File?.useCRLF ? '\r\n' : '\n',
                    },
                    codeEntry,
                  );
                this.pendingHistoryRestore = undefined;
                this.pendingCodeRestore = undefined;
                this.pendingUndoSelection = undefined;
              }
            } finally {
              this.historyDepth--;
            }
          }
        };
      }
    }
    const cm = this.runtime.editor?.sourceView.cm;
    if (!cm || this.attached.has(cm)) return;
    this.attached.add(cm);
    let pending: { base: string; patches: readonly Patch[]; history?: boolean } | undefined;
    cm.on('beforeChange', (_editor, change) => {
      if (this.suspended() || !this.runtime.editor?.sourceView.inSourceMode) return;
      const base = cm.getValue();
      // indexFromPos follows the active CodeMirror line separator (verified against base below).
      const from = cm.indexFromPos(change.from),
        to = cm.indexFromPos(change.to);
      const ending = base.includes('\r\n') ? '\r\n' : '\n';
      const find = this.sourceFindReplace;
      pending = {
        base,
        patches:
          find?.cm === cm && find.base === base && change.origin === 'setValue'
            ? find.patches
            : [{ from, to, insert: change.text.join(ending) }],
        history: change.origin === 'undo' || change.origin === 'redo',
      };
    });
    cm.on('change', () => {
      if (this.suspended() || !this.runtime.editor?.sourceView.inSourceMode) {
        pending = undefined;
        return;
      }
      const next = cm.getValue(),
        exact = pending;
      pending = undefined;
      if (exact) {
        if (replayBridge(exact.base, exact.patches) === next) this.record(next, exact);
        else this.record(next);
      } else this.record(next);
    });
  }

  private attachSourceFindReplace(): void {
    const panel = this.runtime.editor?.searchPanel;
    if (!panel || this.findPanels.has(panel)) return;
    const original: unknown = Reflect.get(panel, 'replaceAll');
    if (typeof original !== 'function') return;
    this.findPanels.add(panel);
    Reflect.set(panel, 'replaceAll', (...args: unknown[]) => {
      const editor = this.runtime.editor,
        cm = editor?.sourceView.cm;
      let proof: typeof this.sourceFindReplace;
      if (!this.suspended() && editor?.sourceView.inSourceMode && cm) {
        this.captureCurrent();
        const status: unknown = Reflect.get(panel, 'searchStatus');
        const input = document.querySelector<HTMLInputElement>('#search-panel-replace-input');
        if (status && typeof status === 'object' && input) {
          const hits: unknown = Reflect.get(status, 'hits'),
            regexp: unknown = Reflect.get(status, 'regexp'),
            regex: unknown = Reflect.get(status, 'useRegexp');
          if (
            Array.isArray(hits) &&
            hits.every(
              (hit: unknown) =>
                hit &&
                typeof hit === 'object' &&
                Reflect.get(hit, 'isCm') === cm &&
                Number.isSafeInteger(Reflect.get(hit, 'start')) &&
                Number.isSafeInteger(Reflect.get(hit, 'end')),
            ) &&
            regexp instanceof RegExp
          ) {
            const base = cm.getValue();
            const patches = findReplaceSourcePatches(
              base,
              hits,
              regexp,
              input.value,
              Boolean(regex),
              cm.doc.lineSeparator(),
            );
            if (patches) proof = { cm, base, patches };
          }
        }
      }
      if (editor?.sourceView.inSourceMode && cm && !proof) {
        const status = document.getElementById('search-panel-status');
        if (status) {
          const message = document.createElement('span');
          message.className = 'error-message';
          message.textContent = '无法确认源码替换范围，请重新查找';
          status.replaceChildren(message);
        }
        return;
      }
      const previous = this.sourceFindReplace;
      this.sourceFindReplace = proof;
      try {
        return Reflect.apply(original, panel, args);
      } finally {
        this.sourceFindReplace = previous;
      }
    });
  }
}
