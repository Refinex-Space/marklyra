import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digest, loadPolicy } from './provenance.mjs';

export const repositoryRoot = resolve(import.meta.dirname, '../..');

/** Verify tracked input bytes before creating any runtime output. */
export async function verifyRuntimeSources(root = repositoryRoot) {
  const { resources } = await loadPolicy(root);
  const directories = new Set();
  for (const [path, record] of resources) {
    const parts = path.split('/');
    try {
      for (let length = 1; length < parts.length; length++) {
        const directory = resolve(root, ...parts.slice(0, length));
        if (directories.has(directory)) continue;
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new Error('source directory must be regular');
        directories.add(directory);
      }
      const full = resolve(root, path);
      const info = await lstat(full);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('source must be a regular file');
      const bytes = await readFile(full);
      if (bytes.length !== record.size || digest(bytes) !== record.sha256)
        throw new Error('source identity mismatch');
    } catch (error) {
      throw new Error(
        `Runtime source unavailable (${path}): ${error.message}. Check the declared package/app input and config/runtime-source.json; restore the matching tracked file or update its reviewed identity.`,
        { cause: error },
      );
    }
  }
  return resources;
}
