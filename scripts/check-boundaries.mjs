import { readdir, readFile } from 'node:fs/promises';

const rules = {
  'editor-core': /(?:from\s*|import\s*\()["'](?:react|@tauri-apps\/|node:)/,
  'editor-markdown': /(?:from\s*|import\s*\()["'](?:react|@tauri-apps\/|node:)/,
};
const packages = await readdir('packages');
let count = 0;
for (const name of packages) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  if (!manifest.private || manifest.license !== 'Apache-2.0')
    throw new Error(`${name}: private package/root Apache-2.0 declaration missing`);
  let files = [];
  try {
    files = await readdir(`packages/${name}/src`, { recursive: true });
  } catch {
    continue;
  }
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = await readFile(`packages/${name}/src/${file}`, 'utf8');
    if (/(?:from\s*|import\s*\()["'][^"']*(?:apps\/|private\/|@tauri-apps\/|node:)/.test(source))
      throw new Error(`${name}/${file}: forbidden host dependency`);
    if (rules[name]?.test(source)) throw new Error(`${name}/${file}: forbidden dependency`);
    count++;
  }
}
// A dependency graph check covers transitive package cycles.
const graph = new Map();
for (const name of packages) {
  const m = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  graph.set(
    m.name,
    Object.keys(m.dependencies ?? {}).filter((dep) => dep.startsWith('@marklyra/')),
  );
}
function visit(name, path = []) {
  if (path.includes(name)) throw new Error(`Cycle: ${[...path, name].join(' → ')}`);
  for (const child of graph.get(name) ?? []) visit(child, [...path, name]);
}
for (const name of graph.keys()) visit(name);
console.log(`Dependency boundaries passed: ${count} TypeScript sources; ${graph.size} packages.`);
