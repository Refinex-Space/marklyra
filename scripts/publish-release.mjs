import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVersions, expectedFiles, repository, verifyDirectory } from './release.mjs';

const tag = process.env.RELEASE_TAG;
const version = checkVersions(tag);
if (tag !== `v${version}`) throw Error('RELEASE_TAG is required');
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const release = JSON.parse(
  gh(
    'release',
    'view',
    tag,
    '--repo',
    repository,
    '--json',
    'isDraft,isPrerelease,tagName,assets,body',
  ),
);
if (!release.isDraft || release.isPrerelease || release.tagName !== tag || !release.body.trim())
  throw Error('Expected a documented stable draft release');
if (
  JSON.stringify(release.assets.map((asset) => asset.name).sort()) !==
  JSON.stringify(expectedFiles(version))
)
  throw Error('Incomplete or unexpected remote release assets');
const commit = gh('api', `repos/${repository}/commits/${tag}`, '--jq', '.sha');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== commit) throw Error('Checked out source does not match remote release tag');
const directory = mkdtempSync(join(tmpdir(), 'marklyra-release-'));
try {
  gh('release', 'download', tag, '--repo', repository, '--dir', directory);
  verifyDirectory(directory, version, process.env.MARKLYRA_UPDATER_PUBLIC_KEY, commit);
  if (process.argv.includes('--publish')) {
    gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest');
    console.log(`Published ${repository} ${tag}`);
  } else console.log(`Verified ${repository} ${tag}; still a draft.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
