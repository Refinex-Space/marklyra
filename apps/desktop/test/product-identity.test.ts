import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('uses MarkLyra names and an independent product data-store identity', () => {
  const config = JSON.parse(
    readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  expect(config.productName).toBe('MarkLyra');
  expect(config.identifier).toBe('dev.refinex.marklyra');
  const desktop = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(desktop.name).toBe('@marklyra/desktop');
});
