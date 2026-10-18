import { defaultMarkLyraEditorPreferences } from '@marklyra/editor-runtime';
import { describe, expect, it } from 'vitest';
import { editorSessionPreferences } from '../src/features/settings/editor-session-preferences.js';

describe('original settings lifetime in one desktop window', () => {
  it('keeps line numbers and wrapping at startup values without blocking live controls', () => {
    const startup = { ...defaultMarkLyraEditorPreferences };
    const stored = {
      ...startup,
      showLineNumbersForFence: true,
      noLineWrapping: true,
      lineWiseCopyCut: true,
      shiftTabAutoIndent: true,
      codeIndentSize: 2 as const,
    };
    expect(editorSessionPreferences(stored, startup)).toEqual({
      ...stored,
      showLineNumbersForFence: false,
      noLineWrapping: false,
    });
    expect(stored.showLineNumbersForFence).toBe(true);
    expect(startup.lineWiseCopyCut).toBe(false);
  });
  it('uses persisted values when a new window starts and freezes them in both directions', () => {
    const startup = {
      ...defaultMarkLyraEditorPreferences,
      showLineNumbersForFence: true,
      noLineWrapping: true,
    };
    expect(editorSessionPreferences(startup, startup)).toBe(startup);
    expect(editorSessionPreferences({ ...defaultMarkLyraEditorPreferences }, startup)).toEqual(
      startup,
    );
  });
});
