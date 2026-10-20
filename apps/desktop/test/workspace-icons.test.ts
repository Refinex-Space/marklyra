import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships the two selected Tabler folder assets with fixed identities and their license', () => {
  const root = new URL('../public/icons/workspace/', import.meta.url);
  const manifest = JSON.parse(
    readFileSync(
      new URL('../../../licenses/icons/workspace-provenance.json', import.meta.url),
      'utf8',
    ),
  ) as { name: string; sha256: string }[];
  expect(
    readdirSync(root)
      .filter((name) => name.endsWith('.svg'))
      .sort(),
  ).toEqual(['folder-open.svg', 'folder.svg']);
  for (const item of manifest) {
    const bytes = readFileSync(new URL(`${item.name}.svg`, root));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
    expect(bytes.toString()).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href=["']https?:/i);
  }
  expect(readFileSync(new URL('LICENSE.txt', root), 'utf8')).toContain(
    'Copyright (c) 2020-2026 Paweł Kuna',
  );
});
