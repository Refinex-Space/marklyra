import { verifyRuntimeSources } from './lib/runtime-resources.mjs';

const resources = await verifyRuntimeSources();
console.log(`Verified ${resources.size} tracked editor and native source resources.`);
