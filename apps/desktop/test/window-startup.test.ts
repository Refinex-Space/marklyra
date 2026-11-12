import { describe, expect, it } from 'vitest';
import { windowStartupSnapshot } from '../src/services/window-startup.js';

const document = {
  id: 'doc',
  path: '/notes/A.md',
  text: '\uFEFFAlpha\r\n中文😀\0',
  encoding: 'UTF-8 BOM',
};
const workspace = { id: 'folder', path: '/notes', name: 'Notes' };
describe('native window startup payload', () => {
  it('retains raw source bytes represented by JS text and fresh native identifiers', () => {
    expect(
      windowStartupSnapshot({ document, workspace, warnings: ['One file was unavailable'] }),
    ).toEqual({
      document,
      workspace,
      warnings: ['One file was unavailable'],
      home: false,
    });
  });
  it('accepts an explicitly empty boot', () => {
    expect(windowStartupSnapshot({ document: null, workspace: null, warnings: [] })).toEqual({
      document: null,
      workspace: null,
      warnings: [],
      home: false,
    });
  });
  it('starts a window opened for a folder on the home view, never one with a document', () => {
    expect(
      windowStartupSnapshot({ document: null, workspace, warnings: [], home: true }).home,
    ).toBe(true);
    expect(windowStartupSnapshot({ document, workspace, warnings: [], home: true }).home).toBe(
      false,
    );
  });
  for (const value of [
    null,
    {},
    { document: undefined, workspace: null, warnings: [] },
    { document: { ...document, id: '' }, workspace: null, warnings: [] },
    { document: { ...document, path: '/notes/\0A.md' }, workspace: null, warnings: [] },
    { document: null, workspace: { ...workspace, path: '' }, warnings: [] },
    { document: null, workspace: null, warnings: [false] },
    { document: null, workspace: null, warnings: new Array(65).fill('warning') },
    { document: null, workspace, warnings: [], home: 'yes' },
  ])
    it(`rejects malformed native shape ${JSON.stringify(value)}`, () => {
      expect(() => windowStartupSnapshot(value)).toThrow('窗口恢复响应无效');
    });
});
it('accepts a transient dirty handoff only over its exact saved baseline', () => {
  const file = { ...document, text: '\uFEFFdisk\r\n' };
  const draft = { text: '\uFEFFdirty\r\n', savedText: file.text };
  expect(windowStartupSnapshot({ document: file, workspace, warnings: [], draft })).toEqual({
    document: file,
    workspace,
    warnings: [],
    draft,
    home: false,
  });
  expect(() =>
    windowStartupSnapshot({
      document: file,
      workspace,
      warnings: [],
      draft: { ...draft, savedText: 'other' },
    }),
  ).toThrow('保存基线');
  expect(() => windowStartupSnapshot({ document: null, workspace, warnings: [], draft })).toThrow(
    '保存基线',
  );
});
