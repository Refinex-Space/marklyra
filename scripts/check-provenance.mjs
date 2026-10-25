import { checkRepository } from './lib/provenance.mjs';

const args = process.argv.slice(2);
if (
  args.length > 1 ||
  args.some((value) => !['--tracked', '--history', '--worktree'].includes(value))
)
  throw new Error('Usage: node scripts/check-provenance.mjs [--tracked|--history|--worktree]');
const mode = args[0]?.slice(2) ?? 'staged';
const result = await checkRepository(process.cwd(), mode);
console.log(JSON.stringify(result));
console.log('Checked source identities and file boundaries for the selected repository view.');
