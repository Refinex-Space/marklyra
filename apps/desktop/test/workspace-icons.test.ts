import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships the two folder SVGs required by the explorer without executable content', () => {
  const root = new URL('../public/icons/workspace/', import.meta.url);
  expect(
    readdirSync(root)
      .filter((name) => name.endsWith('.svg'))
      .sort(),
  ).toEqual(['folder-open.svg', 'folder.svg']);
  for (const file of ['folder-open.svg', 'folder.svg']) {
    const svg = readFileSync(new URL(file, root), 'utf8');
    expect(svg).toMatch(/<svg\b/);
    expect(svg).toMatch(/\bviewBox=["'][^"']+["']/);
    expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href=["']https?:/i);
  }
});
