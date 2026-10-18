import { checkRepository } from './lib/provenance.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || args.some((value) => !['--tracked', '--history'].includes(value)))
  throw new Error('Usage: node scripts/check-provenance.mjs [--tracked|--history]');
const mode = args[0] === '--history' ? 'history' : args[0] === '--tracked' ? 'tracked' : 'staged';
const result = await checkRepository(process.cwd(), mode);
console.log(JSON.stringify(result));
console.log(
  'Checked actual Git object bytes. Exact-byte/path gates do not approve provenance, licenses, snippets or public release.',
);
