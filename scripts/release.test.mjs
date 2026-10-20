import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assets,
  checkVersions,
  expectedFiles,
  publicKey,
  repository,
  stableVersion,
  verifyDirectory,
  verifySignature,
} from './release.mjs';

const pair = generateKeyPairSync('ed25519');
const id = Buffer.from('0123456789abcdef', 'hex');
const raw = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const key = Buffer.from(
  `untrusted comment: test\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`,
).toString('base64');
function signature(bytes) {
  const sig = sign(null, createHash('blake2b512').update(bytes).digest(), pair.privateKey);
  const packet = Buffer.concat([Buffer.from('ED'), id, sig]).toString('base64');
  const comment = 'timestamp:1\tfile:test\tprehashed';
  const global = sign(null, Buffer.concat([sig, Buffer.from(comment)]), pair.privateKey).toString(
    'base64',
  );
  return Buffer.from(
    `untrusted comment: test\n${packet}\ntrusted comment: ${comment}\n${global}\n`,
  ).toString('base64');
}
test('stable desktop versions are synchronized; malformed keys/tags fail closed', () => {
  assert.equal(checkVersions(), checkVersions(`v${checkVersions()}`));
  for (const version of ['v1.0.0', '1.2', '01.2.3', '1.2.3-beta', '999999.0.0', '1.0.0; echo x'])
    assert.throws(() => stableVersion(version));
  for (const value of [
    '',
    'secret',
    Buffer.from('untrusted comment: private key\nabc').toString('base64'),
  ])
    assert.throws(() => publicKey(value));
});
test('minisign prehashed signatures bind payload, key ID and trusted comment', () => {
  const bytes = Buffer.from('updater package');
  const sig = signature(bytes);
  verifySignature(bytes, sig, key);
  assert.throws(() => verifySignature(Buffer.from('tampered'), sig, key));
  assert.throws(() =>
    verifySignature(
      bytes,
      Buffer.from(
        Buffer.from(sig, 'base64').toString().replace('timestamp:1', 'timestamp:2'),
      ).toString('base64'),
      key,
    ),
  );
});
test('release requires every platform, exact URLs, signature files, source and checksums', () => {
  const directory = mkdtempSync(join(tmpdir(), 'marklyra-release-test-'));
  const version = '1.2.3';
  const commit = 'a'.repeat(40);
  try {
    const platforms = {};
    for (const [platform, entry] of Object.entries(assets(version))) {
      const bytes = Buffer.from(platform);
      const sig = signature(bytes);
      writeFileSync(join(directory, entry.file), bytes);
      writeFileSync(join(directory, `${entry.file}.sig`), sig);
      if (entry.installer) writeFileSync(join(directory, entry.installer), 'installer');
      platforms[platform] = {
        url: `https://github.com/${repository}/releases/download/v${version}/${entry.file}`,
        signature: sig,
      };
    }
    const manifest = { version, pub_date: '2026-10-20T00:00:00Z', platforms };
    writeFileSync(join(directory, 'latest.json'), JSON.stringify(manifest));
    writeFileSync(join(directory, 'source.json'), JSON.stringify({ version, commit }));
    const checksums = () =>
      writeFileSync(
        join(directory, 'SHA256SUMS'),
        expectedFiles(version)
          .filter((name) => name !== 'SHA256SUMS')
          .map(
            (name) =>
              `${createHash('sha256')
                .update(readFileSync(join(directory, name)))
                .digest('hex')}  ${name}\n`,
          )
          .join(''),
      );
    checksums();
    verifyDirectory(directory, version, key, commit);
    assert.throws(() => verifyDirectory(directory, version, key, 'b'.repeat(40)));
    manifest.platforms['windows-x86_64'].url = 'https://evil.invalid/update.exe';
    writeFileSync(join(directory, 'latest.json'), JSON.stringify(manifest));
    checksums();
    assert.throws(() => verifyDirectory(directory, version, key, commit), /URL/);
    rmSync(
      join(
        directory,
        readdirSync(directory).find((name) => name.endsWith('.dmg')),
      ),
    );
    assert.throws(() => verifyDirectory(directory, version, key, commit), /missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verifier accepts real Tauri CLI signatures and rejects a changed package', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const directory = mkdtempSync(join(tmpdir(), 'marklyra-signer-test-'));
  const cli = fileURLToPath(
    new URL('../apps/desktop/node_modules/@tauri-apps/cli/tauri.js', import.meta.url),
  );
  try {
    const keyPath = join(directory, 'temporary.key');
    const file = join(directory, 'package.bin');
    // Disposable fixture only. Never print key material or CLI output.
    execFileSync(
      process.execPath,
      [cli, 'signer', 'generate', '--ci', '-p', 'fixture-password', '-w', keyPath],
      { stdio: 'ignore' },
    );
    writeFileSync(file, 'Tauri update fixture');
    execFileSync(process.execPath, [cli, 'signer', 'sign', '-f', keyPath, file], {
      stdio: 'ignore',
      env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'fixture-password' },
    });
    const encoded = readFileSync(`${keyPath}.pub`, 'utf8');
    const sig = readFileSync(`${file}.sig`, 'utf8');
    verifySignature(readFileSync(file), sig, encoded);
    assert.throws(() => verifySignature(Buffer.from('modified'), sig, encoded));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('version command updates desktop and Rust workspace without changing the editor SDK', async () => {
  const { execFileSync } = await import('node:child_process');
  const { copyFileSync, mkdirSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'marklyra-version-test-'));
  const save = (path, text) => writeFileSync(join(directory, path), text);
  try {
    for (const path of ['scripts', 'apps/desktop/src-tauri/src', 'packages/editor-runtime'])
      mkdirSync(join(directory, path), { recursive: true });
    copyFileSync(new URL('./release.mjs', import.meta.url), join(directory, 'scripts/release.mjs'));
    for (const path of [
      'package.json',
      'apps/desktop/package.json',
      'apps/desktop/src-tauri/tauri.conf.json',
    ])
      save(path, JSON.stringify({ version: '1.0.0' }));
    save('packages/editor-runtime/package.json', JSON.stringify({ version: '0.2.0' }));
    save(
      'Cargo.toml',
      '[workspace]\nmembers = ["apps/desktop/src-tauri"]\nresolver = "2"\n[workspace.package]\nversion = "1.0.0"\n',
    );
    save(
      'apps/desktop/src-tauri/Cargo.toml',
      '[package]\nname = "marklyra-desktop"\nversion.workspace = true\nedition = "2021"\n',
    );
    save('apps/desktop/src-tauri/src/lib.rs', '');
    save(
      'Cargo.lock',
      'version = 4\n\n[[package]]\nname = "marklyra-desktop"\nversion = "1.0.0"\n',
    );
    const cli = join(directory, 'scripts/release.mjs');
    execFileSync(process.execPath, [cli, 'version', '1.1.0'], { stdio: 'ignore' });
    for (const path of [
      'package.json',
      'apps/desktop/package.json',
      'apps/desktop/src-tauri/tauri.conf.json',
    ])
      assert.equal(JSON.parse(readFileSync(join(directory, path), 'utf8')).version, '1.1.0');
    assert.match(readFileSync(join(directory, 'Cargo.lock'), 'utf8'), /version = "1.1.0"/);
    assert.equal(
      JSON.parse(readFileSync(join(directory, 'packages/editor-runtime/package.json'), 'utf8'))
        .version,
      '0.2.0',
    );
    assert.throws(() =>
      execFileSync(process.execPath, [cli, 'version', '1.0.9'], { stdio: 'ignore' }),
    );
    execFileSync(process.execPath, [cli, 'prepare'], {
      stdio: 'ignore',
      env: { ...process.env, GITHUB_REF_TYPE: 'branch', MARKLYRA_UPDATER_PUBLIC_KEY: key },
    });
    const config = JSON.parse(readFileSync(join(directory, '.release/tauri.release.json'), 'utf8'));
    assert.equal(config.bundle.macOS.signingIdentity, '-');
    assert.equal(config.plugins.updater.pubkey, key);
    assert.equal(config.bundle.createUpdaterArtifacts, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
