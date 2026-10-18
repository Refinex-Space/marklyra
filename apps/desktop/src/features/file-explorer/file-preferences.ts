export const fileSortTypes = [0, -10, 1, -1, 2, -2, 3, -3] as const;
export type FileSidebarPlatform = 'macos' | 'windows' | 'browser';
export type FileSortType = (typeof fileSortTypes)[number];
export interface FileSidebarPreferences {
  view: 'tree' | 'articles';
  treeSort: FileSortType;
  articleSort: FileSortType;
  treeNoGroup: boolean;
  articleNoGroup: boolean;
}
export const defaultFileSidebarPreferences: Readonly<FileSidebarPreferences> = Object.freeze({
  view: 'articles',
  treeSort: 0,
  articleSort: 0,
  treeNoGroup: false,
  articleNoGroup: false,
});
export function normalizeFileSidebarPreferences(value: unknown): FileSidebarPreferences {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const sort = (value: unknown): FileSortType =>
    typeof value === 'number' && fileSortTypes.includes(value as FileSortType)
      ? (value as FileSortType)
      : 0;
  return {
    view: input.view === 'tree' ? 'tree' : 'articles',
    treeSort: sort(input.treeSort),
    articleSort: sort(input.articleSort),
    treeNoGroup: input.treeNoGroup === true,
    articleNoGroup: input.articleNoGroup === true,
  };
}
