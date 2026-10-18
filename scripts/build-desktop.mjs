import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../apps/desktop', import.meta.url));
const args = process.argv.slice(2);
const allowed = new Set([
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'universal-apple-darwin',
  'x86_64-pc-windows-msvc',
]);
let target;
const options = [];
for (let index = 0; index < args.length; index++) {
  const value = args[index];
  if (value === '--target') {
    target = args[++index];
    if (!allowed.has(target)) {
      throw new Error('Unsupported target. Use a documented macOS or Windows x64 target.');
    }
  } else if (value === '--debug' || value === '--no-bundle') {
    options.push(value);
  } else if (value === '--help') {
    console.log('node scripts/build-desktop.mjs [--target TARGET] [--debug] [--no-bundle]');
    console.log(`Targets: ${[...allowed].join(', ')}`);
    process.exit(0);
  } else {
    throw new Error(`Unknown build option: ${value}`);
  }
}
if (process.platform !== 'darwin' && process.platform !== 'win32') {
  throw new Error('Desktop delivery currently targets macOS and Windows hosts only.');
}
target ??=
  process.platform === 'win32'
    ? 'x86_64-pc-windows-msvc'
    : process.arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : 'x86_64-apple-darwin';
if (
  (target.endsWith('apple-darwin') && process.platform !== 'darwin') ||
  (target.endsWith('windows-msvc') && process.platform !== 'win32')
) {
  throw new Error(
    'Run this target on its native OS; configuration alone does not validate cross-platform delivery.',
  );
}
// Explicitly skip signing for reproducible development bundles. Release signing
// and notarization require a separately reviewed local/CI release procedure.
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const command = [
  'exec',
  'tauri',
  'build',
  '--target',
  target,
  '--no-sign',
  ...options,
  '--',
  '--locked',
];
console.log(
  `Building ${target} on ${process.platform}/${process.arch}; development bundle, no release signing.`,
);
const child = spawn(executable, command, {
  cwd: directory,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.once('error', (error) => {
  console.error(`Cannot start desktop build: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
