export const fileSortTypes = [0, -10, 1, -1, 2, -2, 3, -3] as const;
export type FileSidebarPlatform = 'macos' | 'windows' | 'browser';
/** What each system calls the place deleted items go. */
export const trashName = (platform: FileSidebarPlatform | undefined) =>
  platform === 'windows' ? '回收站' : '废纸篓';
/** The menu label for showing an item in the system file manager. */
export const revealLabel = (platform: FileSidebarPlatform | undefined) =>
  platform === 'windows'
    ? '在文件资源管理器中显示'
    : platform === 'macos'
      ? '在 Finder 中显示'
      : '在文件管理器中显示';
export type FileSortType = (typeof fileSortTypes)[number];
export interface FileSidebarPreferences {
  view: 'tree' | 'articles';
  treeSort: FileSortType;
  articleSort: FileSortType;
  treeNoGroup: boolean;
  articleNoGroup: boolean;
  /** Show how many documents each folder holds (everything below it) beside its name. */
  showDocumentCounts: boolean;
}
export const defaultFileSidebarPreferences: Readonly<FileSidebarPreferences> = Object.freeze({
  view: 'articles',
  treeSort: 0,
  articleSort: 0,
  treeNoGroup: false,
  articleNoGroup: false,
  showDocumentCounts: true,
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
    showDocumentCounts: input.showDocumentCounts !== false,
  };
}
