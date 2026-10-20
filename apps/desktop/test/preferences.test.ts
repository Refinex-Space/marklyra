import { describe, expect, it } from 'vitest';
import { defaultPreferences, normalizePreferences } from '../src/features/settings/preferences.js';

describe('desktop preferences validation', () => {
  it.each([
    null,
    [],
    'bad',
    3,
    { wordsPerMinute: '900', sidebarWidth: Infinity, statisticsUnit: 'unknown', formatToolbar: 0 },
  ])('ignores malformed storage %j', (value) => {
    expect(normalizePreferences(value)).toEqual(defaultPreferences);
  });
  it('bounds persisted sidebars while keeping supported settings', () => {
    expect(
      normalizePreferences({
        sidebarWidth: 700,
        wordsPerMinute: 999,
        statisticsUnit: 'lines',
        formatToolbar: false,
      }),
    ).toEqual({
      ...defaultPreferences,
      sidebarWidth: 700,
      wordsPerMinute: 999,
      statisticsUnit: 'lines',
      formatToolbar: false,
    });
    expect(normalizePreferences({ sidebarWidth: 20, wordsPerMinute: 0 }).sidebarWidth).toBe(160);
    expect(normalizePreferences({ wordsPerMinute: 1.5 }).wordsPerMinute).toBe(382);
  });
  it('migrates legacy settings and retains validated portable editor preferences', () => {
    expect(normalizePreferences({}).editorPreferences).toEqual(defaultMarkLyraEditorPreferences);
    expect(
      normalizePreferences({ editorPreferences: { noPairingMatch: true, customFontSize: 18 } })
        .editorPreferences,
    ).toEqual({ ...defaultMarkLyraEditorPreferences, noPairingMatch: true, customFontSize: 18 });
    expect(
      normalizePreferences({ editorPreferences: { codeIndentSize: 2, shiftTabAutoIndent: true } })
        .editorPreferences,
    ).toEqual({ ...defaultMarkLyraEditorPreferences, codeIndentSize: 2, shiftTabAutoIndent: true });
    expect(
      normalizePreferences({
        editorPreferences: {
          showLineNumbersForFence: true,
          noLineWrapping: true,
          lineWiseCopyCut: true,
        },
      }).editorPreferences,
    ).toEqual({
      ...defaultMarkLyraEditorPreferences,
      showLineNumbersForFence: true,
      noLineWrapping: true,
      lineWiseCopyCut: true,
    });
    for (const editorPreferences of [
      null,
      [],
      { customFontSize: 100 },
      { arbitraryScript: 'run()' },
      { codeIndentSize: '2' },
      { codeIndentSize: -1 },
    ]) {
      expect(normalizePreferences({ wordsPerMinute: 400, editorPreferences })).toEqual({
        ...defaultPreferences,
        wordsPerMinute: 400,
      });
    }
  });
  it('persists independent article and tree presentation without accepting malformed settings', () => {
    const fileSidebar = {
      view: 'tree',
      treeSort: -10,
      articleSort: -2,
      treeNoGroup: true,
      articleNoGroup: false,
      showDocumentCounts: false,
    };
    expect(normalizePreferences({ fileSidebar }).fileSidebar).toEqual(fileSidebar);
    expect(normalizePreferences({}).fileSidebar).toEqual(defaultPreferences.fileSidebar);
    expect(
      normalizePreferences({ fileSidebar: { view: 'script', articleSort: 99 } }).fileSidebar,
    ).toEqual(defaultPreferences.fileSidebar);
  });
});

import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
