import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const builtinThemeIds = ['marklyra-light', 'marklyra-dark'];
const retired = ['github', 'gothic', 'night', 'newsprint', 'pixyll', 'whitey'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Only generated runtime files are retired. Vendor inputs and user theme folders are untouched. */
export async function prepareBuiltinThemes(root, output, github) {
  const directory = resolve(output, 'style/themes');
  await mkdir(directory, { recursive: true });
  for (const id of retired) await rm(resolve(directory, `${id}.css`), { force: true });
  await rm(resolve(directory, 'night'), { recursive: true, force: true });
  const common = await readFile(resolve(root, 'packages/editor-themes/marklyra.css'), 'utf8');
  // Export is already self-contained; never retain the original remote font directive.
  const base = github.replace(/^@include-when-export[^;]+;\s*/m, '');
  const resources = [];
  for (const id of builtinThemeIds) {
    const palette = await readFile(resolve(root, `packages/editor-themes/${id}.css`), 'utf8');
    const css = `${base}\n${palette}\n${common}`;
    const path = `style/themes/${id}.css`;
    await writeFile(resolve(output, path), css);
    resources.push({ path, originalSha256: hash(github), runtimeSha256: hash(css) });
  }
  return resources;
}
