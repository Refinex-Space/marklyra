import { describe, expect, it } from 'vitest';
import { conversionExportActions } from '../src/features/export/useDocumentExport.js';

describe('finite formats', () => {
  it('only dispatches the original nine default converter formats', () => {
    expect([...conversionExportActions].sort()).toEqual(
      ['docx', 'odt', 'rtf', 'epub', 'latex', 'wiki', 'rst', 'textile', 'opml']
        .map((key) => `export-${key}`)
        .sort(),
    );
    expect(conversionExportActions.has('export-image' as never)).toBe(false);
  });
});
