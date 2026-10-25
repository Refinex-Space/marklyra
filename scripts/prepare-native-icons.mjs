import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = resolve(root, 'apps/desktop/src-tauri/icons/titlebar');
export const nativeTitlebarManifest = JSON.parse(
  await readFile(new URL('./native-titlebar-manifest.json', import.meta.url), 'utf8'),
);

/** Verify the tracked SVG inputs before embedding them in the native host. */
export async function verifyNativeIcons(directory = input) {
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    throw new Error('Native titlebar input directory must be regular');
  const canonical = await realpath(directory);
  for (const entry of nativeTitlebarManifest.assets) {
    const path = resolve(directory, entry.file);
    const [info, target, bytes] = await Promise.all([lstat(path), realpath(path), readFile(path)]);
    if (!info.isFile() || info.isSymbolicLink() || !target.startsWith(`${canonical}${sep}`))
      throw new Error(`Native titlebar icon must be a regular source input: ${entry.file}`);
    if (
      bytes.length !== entry.svgBytes ||
      createHash('sha256').update(bytes).digest('hex') !== entry.sha256 ||
      !bytes.toString('utf8').includes(`viewBox="0 0 ${entry.viewBoxWidth} ${entry.viewBoxHeight}"`)
    )
      throw new Error(`Native titlebar icon identity mismatch: ${entry.file}`);
  }
  return nativeTitlebarManifest.assets.length;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--check') || args.length > 1)
    throw new Error('Usage: node scripts/prepare-native-icons.mjs [--check]');
  if (process.platform !== 'darwin' && !args.length) {
    console.log('Native titlebar SVG inputs are only required by the macOS host.');
    return;
  }
  const count = await verifyNativeIcons();
  console.log(`Verified ${count} tracked native titlebar icons.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
