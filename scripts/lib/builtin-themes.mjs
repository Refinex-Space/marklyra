import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const builtinThemeIds = ['marklyra-light', 'marklyra-dark'];
const retired = ['github', 'gothic', 'night', 'newsprint', 'pixyll', 'whitey'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Compile the theme package typography and two product palettes. */
export async function prepareBuiltinThemes(root, output) {
  const directory = resolve(output, 'style/themes');
  await mkdir(directory, { recursive: true });
  for (const id of retired) await rm(resolve(directory, `${id}.css`), { force: true });
  await rm(resolve(directory, 'night'), { recursive: true, force: true });
  const common = await readFile(resolve(root, 'packages/editor-themes/marklyra.css'), 'utf8');
  // Export is already self-contained; never retain the remote font directive.
  const base = await readFile(resolve(root, 'packages/editor-themes/base.css'), 'utf8');
  const resources = [];
  for (const id of builtinThemeIds) {
    const palette = await readFile(resolve(root, `packages/editor-themes/${id}.css`), 'utf8');
    const css = `${base}\n${palette}\n${common}`;
    const path = `style/themes/${id}.css`;
    await writeFile(resolve(output, path), css);
    resources.push({ path, runtimeSha256: hash(css) });
  }
  return resources;
}
