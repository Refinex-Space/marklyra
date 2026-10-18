export { commandTransaction } from './commands.js';
export { EditorSession } from './session.js';
export type {
  SourceMirrorCanonicalProjection,
  SourceMirrorHint,
  SourceMirrorOptions,
  SourceMirrorRebase,
  SourceMirrorUpdate,
} from './source-mirror.js';
export { diffText, SourceMirror, SourceMirrorError } from './source-mirror.js';
export type { SourceMirrorCompletePrefix } from './source-mirror-prefixes.js';
export {
  applyTransaction,
  assertPosition,
  assertSelection,
  assertWellFormedText,
  mapPosition,
  mapSelection,
} from './transaction.js';
export type {
  EditorCommand,
  EditorState,
  HistoryStats,
  Patch,
  PositionAffinity,
  Selection,
  Transaction,
} from './types.js';
export { TransactionError } from './types.js';
