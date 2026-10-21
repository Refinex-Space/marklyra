const paths = {
  branch: 'M6 3v12 M18 9a3 3 0 1 0 0-.01 M6 21a3 3 0 1 0 0-.01 M18 12c0 4-6 3-11 6',
  commit: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M3 12h6 M15 12h6',
  merge: 'M6 3v18 M6 9c0 5 6 6 12 6 M18 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  push: 'M12 20V5 M6 11l6-6 6 6 M5 3h14',
  pull: 'M12 4v15 M6 13l6 6 6-6 M5 21h14',
  fetch: 'M4 12a8 8 0 0 1 14-5 M20 4v4h-4 M12 9v8 M9 14l3 3 3-3',
  sync: 'M20 8a8 8 0 0 0-14-3L4 7 M4 3v4h4 M4 16a8 8 0 0 0 14 3l2-2 M20 21v-4h-4',
  tag: 'M3 3h8l10 10-8 8L3 11z M7.5 7.5h.01',
  stash: 'M4 7h16v4H4z M6 11v8h12v-8 M10 15h4',
  remote:
    'M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  conflict: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  folder: 'M3 6h6l2 2h10v11H3z',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  diff: 'M8 3v10 M3 8h10 M14 17h7 M17 21V3',
  history: 'M12 7v5l3 2 M4 12a8 8 0 1 0 2.3-5.6L4 8.7 M4 4v5h5',
  rollback: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  check: 'M4 12l5 5L20 6',
  close: 'M6 6l12 12 M18 6L6 18',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M18 13l-6 6-6-6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  refresh: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12l2-1-1-3-2 .2-1.3-1.3.2-2-3-1-1 2h-1.8l-1-2-3 1 .2 2L6 7.2 4 7l-1 3 2 1v2l-2 1 1 3 2-.2 1.3 1.3-.2 2 3 1 1-2h1.8l1 2 3-1-.2-2 1.3-1.3 2 .2 1-3-2-1z',
  plus: 'M12 5v14 M5 12h14',
  arrowLeft: 'M20 12H4 M10 6l-6 6 6 6',
  arrowRight: 'M4 12h16 M14 6l6 6-6 6',
  columns: 'M3 4h18v16H3z M12 4v16',
  rows: 'M3 4h18v16H3z M3 12h18',
  whitespace: 'M4 17h16 M4 17v-3 M20 17v-3 M9 7h6 M12 7v7',
  fold: 'M4 6h16 M4 18h16 M12 9v6 M9 12l3 3 3-3',
  copy: 'M9 9h12v12H9z M5 15H3V3h12v2',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
} as const;
export type GitGlyphName = keyof typeof paths;
export function GitGlyph({
  name,
  className,
}: {
  name: GitGlyphName;
  className?: string | undefined;
}) {
  return (
    <svg
      className={className ? `ui-icon git-glyph ${className}` : 'ui-icon git-glyph'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
