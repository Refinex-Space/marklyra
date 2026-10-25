import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, release as osRelease, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const release = process.argv.includes('--release');
const output = resolve(root, 'artifacts/knowledge-graph', release ? 'native-release' : 'native');
await mkdir(output, { recursive: true });
const files = [...new Set([
  ...execFileSync('git', ['diff', '--name-only'], {encoding:'utf8'}).trim().split('\n'),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {encoding:'utf8'}).trim().split('\n'),
  'Cargo.lock', 'pnpm-lock.yaml',
])].filter(file => /\.(rs|ts|tsx|css|mjs|svg|toml|lock|yaml)$/.test(file)).sort();
const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file,createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')])));
await writeFile(resolve(output,'source.json'),JSON.stringify({createdAt:new Date().toISOString(),profile:release?'release':'debug',gitRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),platform:process.platform,architecture:arch(),osRelease:osRelease(),totalMemoryBytes:totalmem(),node:process.version,sourceSha256:hashes},null,2));
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}
await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['prepare:runtime']);
await build({
  configFile: false,
  root: resolve(root, 'apps/desktop'),
  worker: { format: 'iife' },
  build: {
    outDir: resolve(output, 'web'), emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'apps/desktop/src/features/knowledge-graph/test/native.html') },
  },
});
await run('cargo', ['test', ...(release ? ['--release'] : []), '-p', 'marklyra-desktop', '--test', 'knowledge-native'], {
  ...process.env,
  MARKLYRA_KNOWLEDGE_ASSETS: resolve(output, 'web'),
  MARKLYRA_KNOWLEDGE_REPORT: resolve(output, 'report.json'),
});
