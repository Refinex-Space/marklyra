import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nativeTitlebarManifest, verifyNativeIcons } from './prepare-native-icons.mjs';

const input = fileURLToPath(new URL('../apps/desktop/src-tauri/icons/titlebar', import.meta.url));

test('all four tracked raster inputs retain their recorded identity and dimensions', async () => {
  assert.equal(await verifyNativeIcons(), 4);
  assert.equal(new Set(nativeTitlebarManifest.assets.map((entry) => entry.file)).size, 4);
});

test('changed bytes cannot become a trusted native image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'icons-corrupt-'));
  try {
    await cp(input, root, { recursive: true });
    const path = join(root, nativeTitlebarManifest.assets[0].file);
    const bytes = await readFile(path);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(path, bytes);
    await assert.rejects(verifyNativeIcons(root), /identity mismatch/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('a symlink cannot supply a tracked native image or the input directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'icons-linked-'));
  try {
    const directory = join(root, 'inputs');
    await cp(input, directory, { recursive: true });
    const name = nativeTitlebarManifest.assets[0].file;
    await rm(join(directory, name));
    await symlink(join(input, name), join(directory, name));
    await assert.rejects(verifyNativeIcons(directory), /regular source input/);
    await symlink(input, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(verifyNativeIcons(join(root, 'linked')), /directory must be regular/);
  } finally {
    await rm(root, { recursive: true });
  }
});
