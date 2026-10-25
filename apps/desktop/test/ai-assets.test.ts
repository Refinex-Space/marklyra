import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships exactly the supported branded assets with pinned identities', () => {
  const root = new URL('../public/agents/', import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL('./fixtures/agent-icon-identities.json', import.meta.url), 'utf8'),
  ) as { files: { file: string; sha256: string }[] };
  const catalog = JSON.parse(
    readFileSync(new URL('../src-tauri/resources/agents/catalog.json', import.meta.url), 'utf8'),
  ) as { agents: { id: string }[] };
  expect(
    readdirSync(root)
      .filter((name) => name.endsWith('.svg'))
      .sort(),
  ).toEqual(catalog.agents.map((agent) => `${agent.id}.svg`).sort());
  for (const entry of manifest.files) {
    const bytes = readFileSync(new URL(entry.file, root));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    expect(bytes.toString()).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href=["']https?:/i);
  }
});
