import type { ImageHostAction } from '../images/contracts.js';
import type { ClipboardContent, ContextAction } from './contracts.js';

/** Runtime target and bookmarks stay inside the frame. */
export interface ContextExecutionRequest {
  requestId: string;
  actionId: ContextAction;
  clipboard?: ClipboardContent;
}
export type ContextEffect =
  | { type: 'clipboard'; content: ClipboardContent; cutToken?: string }
  | { type: 'openLink'; url: string };
export interface ImageContextEffect {
  type: 'imageAction';
  requestId: string;
  action: ImageHostAction;
  source: string;
  reference: string;
  referenceRoot: string;
  storageFolder?: string;
}
export interface ContextExecutionResult {
  effect?: ContextEffect | ImageContextEffect;
}
/** Valid only after the parent has successfully written the prepared payload. */
export interface ContextCutCommit {
  token: string;
}
