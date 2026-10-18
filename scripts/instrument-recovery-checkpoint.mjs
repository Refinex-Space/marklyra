import { createHash } from 'node:crypto';
import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  instrumentRecoveryIndex,
  instrumentRecoveryModule,
} from './lib/recovery-checkpoint-probe.mjs';

const [input, output, phase, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length)
  throw Error(
    'Usage: node scripts/instrument-recovery-checkpoint.mjs <frontend> <NEW frontend> <before-dispatch|after-commit>',
  );
const source = resolve(input),
  destination = resolve(output);
if (source === destination || destination.startsWith(`${source}/`))
  throw Error('Separate new destination required');
try {
  await stat(destination);
  throw Error('Destination already exists; refusing to overwrite');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const original = await readFile(`${source}/index.html`, 'utf8');
const result = instrumentRecoveryIndex(original, phase);
const modules = [...original.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/gu)];
if (modules.length !== 1) throw Error('Expected one frontend module entry');
const asset = modules[0][1].replace(/^\//u, '');
const modulePath = resolve(source, asset);
if (!modulePath.startsWith(`${source}/`)) throw Error('Module entry outside frontend');
const originalModule = await readFile(modulePath, 'utf8');
const instrumentedModule = instrumentRecoveryModule(originalModule);
await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
await writeFile(`${destination}/index.html`, result.html);
await writeFile(resolve(destination, asset), instrumentedModule);
await writeFile(`${destination}/checkpoint-probe.js`, result.script, { flag: 'wx' });
await writeFile(
  `${destination}/checkpoint-probe.json`,
  JSON.stringify(
    {
      diagnosticOnly: true,
      instrumentedAsset: asset,
      originalModuleSha256: createHash('sha256').update(originalModule).digest('hex'),
      instrumentedModuleSha256: createHash('sha256').update(instrumentedModule).digest('hex'),
      phase,
      originalIndexSha256: createHash('sha256').update(original).digest('hex'),
      scriptSha256: createHash('sha256').update(result.script).digest('hex'),
      boundary:
        'One existing checkpoint dispatch/receipt withheld in an isolated build; no product source or user clipboard access',
    },
    null,
    2,
  ),
);
console.log('Prepared isolated diagnostic frontend; product sources unchanged');
