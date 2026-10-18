import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = resolve(root, 'private/native-titlebar');
export const nativeTitlebarManifest = JSON.parse(
  await readFile(new URL('./native-titlebar-manifest.json', import.meta.url), 'utf8'),
);

/** Exact derived inputs only; no image bytes or original executable enter Git. */
export async function verifyNativeIcons(directory = input) {
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    throw new Error('Native titlebar input directory must be regular');
  const canonical = await realpath(directory);
  for (const entry of nativeTitlebarManifest.assets) {
    const path = resolve(directory, entry.file);
    const [info, target, bytes] = await Promise.all([lstat(path), realpath(path), readFile(path)]);
    if (!info.isFile() || info.isSymbolicLink() || !target.startsWith(`${canonical}${sep}`))
      throw new Error(`Native titlebar icon must be a regular private input: ${entry.file}`);
    if (
      bytes.length !== entry.pngBytes ||
      createHash('sha256').update(bytes).digest('hex') !== entry.sha256 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(16) !== entry.pixelWidth ||
      bytes.readUInt32BE(20) !== entry.pixelHeight
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
    console.log('Native titlebar raster inputs are only required by the macOS host.');
    return;
  }
  const exists = await lstat(input).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (exists?.isSymbolicLink())
    throw new Error('Refusing a linked native titlebar input directory');
  if (!exists) {
    if (args.length || process.platform !== 'darwin')
      throw new Error('Missing private native icons; run pnpm prepare:native-icons on macOS first');
    await mkdir(resolve(root, 'private'), { recursive: true });
    const evidence = await mkdtemp(resolve(root, 'private/native-titlebar-extraction-'));
    const output = resolve(evidence, 'derived');
    const result = spawnSync(
      'swift',
      [
        '-module-cache-path',
        resolve(root, 'private/native-titlebar-swift-cache'),
        'tools/assets/extract-native-titlebar.swift',
        output,
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    await writeFile(resolve(evidence, 'stdout.log'), result.stdout ?? '');
    await writeFile(resolve(evidence, 'stderr.log'), result.stderr ?? '');
    if (result.error || result.status !== 0)
      throw new Error(`Native icon extraction failed; inspect private evidence: ${evidence}`);
    await verifyNativeIcons(output);
    await mkdir(input);
    for (const entry of nativeTitlebarManifest.assets)
      await copyFile(resolve(output, entry.file), resolve(input, entry.file));
    await writeFile(
      resolve(input, 'provenance.json'),
      `${JSON.stringify(
        {
          ...nativeTitlebarManifest,
          evidence,
        },
        null,
        2,
      )}\n`,
    );
  }
  const count = await verifyNativeIcons();
  console.log(`Verified ${count} private native titlebar icons; no source upload.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
