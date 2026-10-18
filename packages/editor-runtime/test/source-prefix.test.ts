import { expect, test } from 'vitest';
import { parserSource } from '../src/runtime/source-prefix.js';

test('only one declared file prefix is withheld from parser input', () => {
  expect(parserSource('\uFEFF---\r\ntitle: x\n---', 'metadata')).toBe('---\r\ntitle: x\n---');
  expect(parserSource('\uFEFF\uFEFFx', undefined)).toBe('\uFEFFx');
  expect(parserSource('a\uFEFFb', 'metadata')).toBe('a\uFEFFb');
  expect(parserSource('\uFEFFx', 'text')).toBe('\uFEFFx');
  expect(parserSource('', 'metadata')).toBe('');
});
