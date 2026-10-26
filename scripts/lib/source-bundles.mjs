import { lstat, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';

// The settings page still uses its own legacy source layout. The editor engine
// is built independently from its standard JavaScript entry points.
export const bundleManifests = [
  'apps/desktop/src/features/settings/runtime-preferences/page/static/js/bundles.json',
];

function relativePath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))
  )
    throw new Error(`Invalid source bundle path: ${path}`);
  return path;
}

/** Read only regular files, including every ancestor, inside this checkout. */
async function readSource(root, path) {
  const parts = relativePath(path).split('/');
  for (let index = 1; index <= parts.length; index++) {
    const info = await lstat(resolve(root, ...parts.slice(0, index)));
    if (info.isSymbolicLink() || (index === parts.length ? !info.isFile() : !info.isDirectory()))
      throw new Error(`Source bundle input must be regular: ${path}`);
  }
  return readFile(resolve(root, path));
}

/** Explicit order is executable behavior. Never sort parts or discover load order by glob. */
export async function loadSourceBundlePlans(root) {
  const plans = [];
  const outputs = new Set();
  const entries = new Set();
  for (const manifestPath of bundleManifests) {
    let bytes;
    try {
      bytes = await readSource(root, manifestPath);
    } catch (error) {
      // Small boundary-test workspaces need not contain either application.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const manifest = JSON.parse(bytes);
    if (manifest.schema !== 1 || !Array.isArray(manifest.bundles) || !manifest.bundles.length)
      throw new Error(`Invalid source bundle manifest: ${manifestPath}`);
    const local = (path) => posix.join(posix.dirname(manifestPath), relativePath(path));
    for (const bundle of manifest.bundles) {
      const entry = local(bundle.entry);
      const output = relativePath(bundle.output);
      if (
        entries.has(entry) ||
        outputs.has(output) ||
        !Array.isArray(bundle.slots) ||
        !bundle.slots.length
      )
        throw new Error(`Duplicate or invalid source bundle: ${entry}`);
      entries.add(entry);
      outputs.add(output);
      const names = new Set();
      const parts = new Set();
      const slots = bundle.slots.map((slot) => {
        if (
          !/^__MARKLYRA_[A-Z_]+__$/.test(slot.name) ||
          names.has(slot.name) ||
          !['sequence', 'array', 'json'].includes(slot.kind) ||
          !Array.isArray(slot.parts) ||
          !slot.parts.length ||
          (slot.kind === 'json' && slot.parts.length !== 1)
        )
          throw new Error(`Invalid source bundle slot: ${entry}`);
        names.add(slot.name);
        return {
          name: slot.name,
          kind: slot.kind,
          parts: slot.parts.map((path) => {
            if (path === null && slot.kind === 'array') return null;
            const full = local(path);
            if (parts.has(full) || full === entry || full === manifestPath)
              throw new Error(`Duplicate source bundle part: ${full}`);
            parts.add(full);
            return full;
          }),
        };
      });
      plans.push({ manifestPath, entry, output, slots });
    }
  }
  return plans;
}

export function sourceBundleInputs(plan) {
  return [
    plan.manifestPath,
    plan.entry,
    ...plan.slots.flatMap((slot) => slot.parts.filter(Boolean)),
  ];
}

function walk(node, visit) {
  visit(node);
  for (const value of Object.values(node))
    for (const child of Array.isArray(value) ? value : [value])
      if (child && typeof child.type === 'string') walk(child, visit);
}

/** Assemble classic scripts without importing factories, rebinding this, or changing scope. */
export async function assembleSourceBundle(root, plan) {
  const { parse } = await import('acorn');
  const sources = new Map();
  for (const path of sourceBundleInputs(plan)) sources.set(path, await readSource(root, path));
  const entry = sources.get(plan.entry).toString('utf8');
  const ast = parse(entry, { ecmaVersion: 'latest', sourceType: 'script' });
  const replacements = [];
  for (const slot of plan.slots) {
    const found = [];
    walk(ast, (node) => {
      if (node.type === 'Identifier' && node.name === slot.name) found.push(node);
    });
    if (found.length !== 1) throw new Error(`Expected exactly one ${slot.name} in ${plan.entry}`);
    const expressions = slot.parts.map((path) => {
      if (path === null) return '';
      const text = sources.get(path).toString('utf8');
      if (slot.kind === 'json') {
        JSON.parse(text);
        return text.trim();
      }
      const body = parse(text, { ecmaVersion: 'latest', sourceType: 'script' }).body;
      if (body.length !== 1 || body[0].type !== 'ExpressionStatement' || body[0].directive)
        throw new Error(`Expected one expression in source bundle part: ${path}`);
      // Keep surrounding comments. Parenthesize each expression so sequence-valued
      // parts cannot accidentally change a Webpack array's indices or outer scope.
      const expression = body[0].expression;
      return `${text.slice(0, body[0].start)}(${text.slice(expression.start, expression.end)})${text.slice(body[0].end)}`;
    });
    const joined = expressions.join(',\n');
    const value =
      slot.kind === 'array' ? `[${joined}${slot.parts.at(-1) === null ? ',' : ''}]` : `(${joined})`;
    replacements.push({ ...found[0], value });
  }
  let code = entry;
  for (const { start, end, value } of replacements.sort((a, b) => b.start - a.start))
    code = code.slice(0, start) + value + code.slice(end);
  const finalAst = parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  walk(finalAst, (node) => {
    if (node.type === 'Identifier' && plan.slots.some((slot) => slot.name === node.name))
      throw new Error(`Unresolved source bundle slot: ${node.name}`);
  });
  return { code };
}

export async function assembleSourceBundles(root) {
  const outputs = new Map();
  for (const plan of await loadSourceBundlePlans(root))
    outputs.set(plan.output, { ...plan, ...(await assembleSourceBundle(root, plan)) });
  return outputs;
}
