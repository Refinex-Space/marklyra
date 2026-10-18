import { expect, it } from 'vitest';
import { type ReloadFromDiskOptions, validateReload } from '../src/reload/contracts.js';

it('requires explicit source and revision conditions for external reload', () => {
  expect(() =>
    validateReload('next', { expectedSource: 'previous', expectedRevision: 0 }),
  ).not.toThrow();
  for (const options of [
    {},
    { expectedSource: 'x' },
    { expectedSource: 'x', expectedRevision: -1 },
    { expectedSource: 'x', expectedRevision: NaN },
    { expectedSource: 'x', expectedRevision: 1.5 },
  ])
    expect(() => validateReload('next', options as ReloadFromDiskOptions)).toThrow();
});
