import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  children.push(child);
  child.once('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
start(process.execPath, ['scripts/runtime-server.mjs'], root);
start(
  process.execPath,
  [vite, '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  `${root}apps/editor-playground`,
);
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
