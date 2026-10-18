import type { RuntimeConfiguration } from '../protocol.js';

/** A file BOM is metadata; a second FEFF or a host-decoded FEFF is content.
 * This only prepares parser input. Parent raw text and native snapshots remain
 * untouched so saving, rejected loads and history keep the exact source. */
export function parserSource(source: string, policy: RuntimeConfiguration['sourceBOM']): string {
  return policy !== 'text' && source.startsWith('\uFEFF') ? source.slice(1) : source;
}
