import type { Patch, SourceMirrorCompletePrefix } from '@marklyra/editor-core';
import type { MarkLyraMarkdownPreferences } from './markdown-preferences.js';
import type { MarkLyraMenuState } from './menu-state.js';
export const PROTOCOL = 'marklyra/editor/v1';
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface CursorBookmark {
  [key: string]: JsonValue;
}
export interface RuntimeSelection {
  bookmark: CursorBookmark | null;
  text: string;
}
export interface OutlineEntry {
  id: string;
  level: number;
  text: string;
}
export interface RuntimeChange {
  baseCheckpoint: number;
  checkpoint: number;
  baseProjectionEpoch?: number;
  patches: readonly Patch[];
  /** Proven content operation before serializer-only normalization. */
  editPatches?: readonly Patch[];
  /** Exact primary syntax components proved against the actual block operation. */
  completePrefixes?: readonly SourceMirrorCompletePrefix[];
  /** Serializer-only change proved by the isolated policy oracle or by exact
   * identity-bound bodies and container changes of the operation. */
  canonicalProjection?: {
    baseProjectionEpoch: number;
    baseCanonical: string;
    patches: readonly Patch[];
  };
  /** Changes serializer coordinates, never raw content or native Undo history. */
  normalization?: true;
  placementRanges?: readonly { from: number; to: number }[];
  placementChecks?: readonly {
    patch: Patch;
    range: { from: number; to: number };
  }[];
  historyTarget?: number;
  /** Exact raw text for a proven reload or image-destination transaction. */
  externalSource?: string;
}
export interface RuntimeTracking {
  checkpoint: number;
  changes: readonly RuntimeChange[];
  projectionEpoch?: number;
}
export interface RuntimeState {
  tracking: RuntimeTracking;
  canonical: string;
  sequence: number;
  composing: boolean;
  sourceMode: boolean;
  selection: RuntimeSelection;
  outline: OutlineEntry[];
  canUndo: boolean;
  canRedo: boolean;
  /** Optional for compatibility with older hosts and recorded fixtures. */
  menu?: MarkLyraMenuState;
  menuSequence?: number;
}
export interface MarkdownPreferencesResolution {
  token: number;
  committed: boolean;
  preferences: MarkLyraMarkdownPreferences;
  state: RuntimeState;
}
export type MarkLyraCommand =
  | {
      type:
        | 'undo'
        | 'redo'
        | 'toggleSource'
        | 'toggleFocus'
        | 'toggleTypewriter'
        | 'scrollToTop'
        | 'insertTable'
        | 'codeBlock'
        | 'mathBlock'
        | 'horizontalRule'
        | 'indent'
        | 'outdent';
    }
  | { type: 'insertText'; text: string }
  | { type: 'find'; text?: string; replace?: boolean }
  | { type: 'sourcePosition'; line: number; column: number }
  | { type: 'heading'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'list'; style: 'ul' | 'ol' | 'tasklist' | 'blockquote' }
  | {
      type: 'format';
      style:
        | 'strong'
        | 'em'
        | 'del'
        | 'code'
        | 'underline'
        | 'highlight'
        | 'subscript'
        | 'superscript'
        | 'inline_math'
        | 'link'
        | 'image';
    }
  | { type: 'setTheme'; theme: 'marklyra-light' | 'marklyra-dark' }
  | { type: 'jumpToBlock'; id: string; preserveSelection?: boolean }
  | { type: 'restoreSelection'; bookmark: CursorBookmark }
  | { type: 'insertLink'; url: string; title: string };
export interface RuntimeConfiguration {
  nativeMenus: boolean;
  platform: 'macos' | 'windows' | 'browser';
  locale: 'en' | 'zh-Hans';
  theme: 'marklyra-light' | 'marklyra-dark';
  /** metadata: preserve one file BOM outside parser input (default).
   * text: the host has already decoded encoding metadata; FEFF is literal text. */
  sourceBOM?: 'metadata' | 'text';
  contextMenu?: { clipboardRead: boolean; clipboardWrite: boolean; openExternal: boolean };
}
export type HostAction =
  | 'zoom-in'
  | 'zoom-out'
  | 'open'
  | 'save'
  | 'save-as'
  | 'new'
  | 'new-window'
  | 'close';
export interface Envelope {
  protocol: typeof PROTOCOL;
  channel: string;
  kind: string;
  id?: number;
  operation?: string;
  payload?: unknown;
  error?: string;
}
export function isEnvelope(value: unknown, channel: string): value is Envelope {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<Envelope>;
  return (
    message.protocol === PROTOCOL && message.channel === channel && typeof message.kind === 'string'
  );
}

export interface RuntimeStatisticsPacket {
  state: RuntimeState;
  renderEpoch: number;
  words: number;
  selection: { words: number; characters: number } | null;
}
