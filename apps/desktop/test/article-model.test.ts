import { describe, expect, it } from 'vitest';
import {
  articleSummary,
  compareFiles,
  groupedArticles,
  naturalModifiedDate,
  sortedDirectory,
  workspacePathIsActive,
} from '../src/features/file-explorer/article-model.js';
import {
  defaultFileSidebarPreferences,
  fileSortTypes,
  normalizeFileSidebarPreferences,
} from '../src/features/file-explorer/file-preferences.js';
import type { WorkspaceDocument } from '../src/services/workspaces.js';
import dateCases from './fixtures/article-date.json';
import sortCases from './fixtures/article-sort.json';
import summaryCases from './fixtures/article-summary.json';

// These synthetic input/output facts were measured against isolated shipped helpers;
// the implementation is independently written. Windows rows cover its source branch only.
describe('article projection', () => {
  for (const row of summaryCases.rows)
    it(`${row.id} strict=${row.strict}`, () => {
      expect(articleSummary(row.input, row.strict)).toBe(row.output);
    });
  it('never evaluates YAML tags or markup', () => {
    const text = '---\ntitle: !!js/function > alert(1)\n---\n<script>window.pwned=true</script>';
    expect(articleSummary(text)).toContain('!!js/function > alert(1)');
    expect(articleSummary(text)).toContain('<script>window.pwned=true</script>');
  });
});

describe('file sorting', () => {
  // The fixture was recorded under an English default locale; the app itself follows the
  // person's language (zh-CN collation orders é before e), so the recording locale is pinned.
  const english = new Intl.Collator('en').compare;
  for (const row of sortCases.rows)
    it(`${row.left} / ${row.right}`, () => {
      const left = { name: row.left, modifiedAt: 1000, createdAt: 5000 };
      const right = { name: row.right, modifiedAt: 2000, createdAt: 1000 };
      for (const sort of fileSortTypes) {
        expect(Math.sign(compareFiles(left, right, sort, false, english)) || 0).toBe(
          Math.sign(row.mac[String(sort) as keyof typeof row.mac]),
        );
        expect(Math.sign(compareFiles(left, right, sort, true, english)) || 0).toBe(
          Math.sign(row.winBranch[String(sort) as keyof typeof row.winBranch]),
        );
      }
    });
  it('keeps ties in arrival order and direct-parent grouping in arrival order', () => {
    const item = (name: string, folderRelativePath: string): WorkspaceDocument => ({
      name,
      relativePath: `${folderRelativePath}/${name}`,
      folderRelativePath,
      folderName: folderRelativePath,
      size: 10,
      modifiedAt: 0,
      createdAt: 0,
      summary: '',
      summaryTruncated: false,
    });
    const input = [
      item('a10.md', 'B'),
      item('A2.md', 'A'),
      item('a2.md', 'B'),
      item('a02.md', 'B'),
    ];
    expect(
      groupedArticles(input, 0, false, false).map((g) => [
        g.folderRelativePath,
        g.entries.map((e) => e.name),
      ]),
    ).toEqual([
      ['B', ['a2.md', 'a02.md', 'a10.md']],
      ['A', ['A2.md']],
    ]);
    expect(groupedArticles(input, 0, true, false)[0]?.entries.map((e) => e.name)).toEqual([
      'A2.md',
      'a2.md',
      'a02.md',
      'a10.md',
    ]);
    expect(input.map((e) => e.name)).toEqual(['a10.md', 'A2.md', 'a2.md', 'a02.md']);
  });
  it('groups tree folders first unless grouping is disabled', () => {
    const entries = [
      { name: 'A.md', relativePath: 'A.md', kind: 'file' as const, size: 0 },
      { name: 'Z', relativePath: 'Z', kind: 'directory' as const, size: null },
    ];
    expect(sortedDirectory(entries, 0, false, false).map((e) => e.name)).toEqual(['Z', 'A.md']);
    expect(sortedDirectory(entries, 0, true, false).map((e) => e.name)).toEqual(['A.md', 'Z']);
  });
  it('does not invent a name fallback for missing dates', () =>
    expect(compareFiles({ name: 'a' }, { name: 'z' }, 2)).toBeNaN());
});

it('normalizes preferences without sharing mutable defaults', () => {
  expect(normalizeFileSidebarPreferences(null)).toEqual(defaultFileSidebarPreferences);
  expect(
    normalizeFileSidebarPreferences({
      view: 'tree',
      treeSort: -10,
      articleSort: 4,
      treeNoGroup: true,
      articleNoGroup: 'true',
    }),
  ).toEqual({
    view: 'tree',
    treeSort: -10,
    articleSort: 0,
    treeNoGroup: true,
    articleNoGroup: false,
    showDocumentCounts: true,
  });
  // Folder document counts are on unless the stored value is explicitly false.
  expect(normalizeFileSidebarPreferences({}).showDocumentCounts).toBe(true);
  expect(normalizeFileSidebarPreferences({ showDocumentCounts: 'no' }).showDocumentCounts).toBe(
    true,
  );
  expect(normalizeFileSidebarPreferences({ showDocumentCounts: false }).showDocumentCounts).toBe(
    false,
  );
});
it('matches observed English relative-date boundaries', () => {
  const now = new Date(2026, 9, 15, 12, 0, 0);
  const ago = (seconds: number) => naturalModifiedDate(now.getTime() - seconds * 1000, now);
  expect(ago(29)).toBe('just now');
  expect(ago(30)).toBe('1 minutes ago');
  expect(ago(90)).toBe('2 minutes ago');
  expect(ago(3600)).toBe('11:00');
  expect(ago(6 * 3600)).toBe('0 days ago');
  expect(ago(86400)).toBe('Yesterday');
  expect(ago(2 * 86400)).toBe('2 days ago');
  expect(ago(6 * 86400)).toBe('Oct 09');
  expect(naturalModifiedDate(null, now)).toBe('');
});

for (const row of dateCases.rows)
  it(`date oracle ${row.now} - ${row.seconds}s`, () => {
    const now = new Date(row.now.slice(0, 19));
    expect(naturalModifiedDate(now.getTime() - row.seconds * 1000, now)).toBe(row.compact);
  });

it('keeps a final solitary dot when choosing an alphabetic stem', () => {
  for (const other of ['a!.md', 'a-.md', 'a..md']) {
    expect(Math.sign(compareFiles({ name: 'a.' }, { name: other }, 1))).toBe(1);
    expect(Math.sign(compareFiles({ name: other }, { name: 'a.' }, 1))).toBe(-1);
  }
});
it('normalizes Windows separators only with an explicit Windows platform', () => {
  expect(workspacePathIsActive('/mock\\literal', 'a.md', '/mock\\literal/a.md', 'macos')).toBe(
    true,
  );
  expect(workspacePathIsActive('/mock\\literal', 'a.md', '/mock/literal/a.md', 'macos')).toBe(
    false,
  );
  expect(workspacePathIsActive('C:\\mock', 'a.md', 'C:/mock/a.md', 'windows')).toBe(true);
  expect(workspacePathIsActive('/mock\\', 'a.md', '/mock\\/a.md', 'macos')).toBe(true);
  expect(workspacePathIsActive('/mock', 'Café.md', '/MOCK/Cafe\u0301.MD', 'macos')).toBe(true);
  expect(workspacePathIsActive('/mock', 'Café.md', '/MOCK/Cafe\u0301.MD', 'browser')).toBe(false);
});
