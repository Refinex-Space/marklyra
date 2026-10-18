import type { ImageContextMessage } from '../images/contracts.js';
import type { RuntimeState } from '../protocol.js';

export interface ReloadFromDiskOptions {
  /** Last authoritative source shown when the host authorized replacing this document. */
  expectedSource: string;
  /** SDK revision captured with that source, before any asynchronous disk operation. */
  expectedRevision: number;
}
export interface RuntimeReloadRequest {
  source: string;
  expectedSource: string;
  expected: Pick<RuntimeState, 'canonical' | 'sequence'> & { checkpoint: number };
  images: ImageContextMessage;
}
export interface RuntimeReloadResult {
  applied: boolean;
  state: RuntimeState;
  reason?: string;
}
export function validateReload(source: string, options: ReloadFromDiskOptions): void {
  if (
    typeof source !== 'string' ||
    !options ||
    typeof options.expectedSource !== 'string' ||
    !Number.isSafeInteger(options.expectedRevision) ||
    options.expectedRevision < 0
  )
    throw new Error('重载需要明确的源文本和编辑版本条件');
}
