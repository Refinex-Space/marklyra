import { VIRTUAL_DOCUMENT_PATH } from '../images/contracts.js';
import type { LegacyFile } from './legacy-types.js';

/** The image sandbox's synthetic document.md is not a host-provided filename.
 * Shadow only this proven virtual metadata during the synchronous read. */
export function originalSuggestedName(file: LegacyFile): string {
  const bundle = file.bundle;
  let name: string;
  if (bundle.filePath !== VIRTUAL_DOCUMENT_PATH) name = file.getSuggestedFileName();
  else {
    const descriptor = Object.getOwnPropertyDescriptor(bundle, 'fileName');
    if (
      !descriptor ||
      !('value' in descriptor) ||
      (!descriptor.writable && !descriptor.configurable)
    )
      throw new Error('无法隔离虚拟文件名元数据');
    Object.defineProperty(bundle, 'fileName', { ...descriptor, value: '' });
    try {
      name = file.getSuggestedFileName();
    } finally {
      Object.defineProperty(bundle, 'fileName', descriptor);
    }
  }
  // The UTF-16 length cap can cut an emoji in half. A filename crossing
  // a JSON/native boundary must remain Unicode; the document itself is untouched.
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) name = name.slice(0, -1);
  return name || 'Untitled';
}
