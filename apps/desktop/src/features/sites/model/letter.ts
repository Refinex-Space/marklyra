/** The mark shown while a site has no icon: its first letter or Chinese character. */
export function letterMark(title: string): string {
  const match = /[\p{Script=Han}]|[\p{L}\p{N}]/u.exec(title.trim());
  return match ? match[0].toUpperCase() : '?';
}
