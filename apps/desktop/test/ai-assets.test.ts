import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships the branded SVG assets required by the agent catalog', () => {
  const root = new URL('../public/agents/', import.meta.url);
  const catalog = JSON.parse(
    readFileSync(new URL('../src-tauri/resources/agents/catalog.json', import.meta.url), 'utf8'),
  ) as { agents: { id: string }[] };
  expect(
    readdirSync(root)
      .filter((name) => name.endsWith('.svg'))
      .sort(),
  ).toEqual(catalog.agents.map((agent) => `${agent.id}.svg`).sort());
  for (const agent of catalog.agents) {
    const svg = readFileSync(new URL(`${agent.id}.svg`, root), 'utf8');
    expect(svg).toMatch(/<svg\b/);
    expect(svg).not.toMatch(/<script|<foreignObject|\son[a-z]+=|href=["']https?:/i);
  }
});
