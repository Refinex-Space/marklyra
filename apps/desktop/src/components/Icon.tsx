const paths = {
  newWindow: 'M3 5h13v14H3z M7 2h14v13 M9.5 9v6 M6.5 12h6',
  sidebar: 'M3 3h18v18H3z M9 3v18',
  open: 'M3 7V4h7l2 3h9v13H3z M3 10h18',
  save: 'M4 3h13l4 4v14H3V3z M7 3v6h9V3 M7 21v-8h10v8',
  export: 'M12 15V3 M8 7l4-4 4 4 M5 13v8h14v-8',
  print: 'M6 8V3h12v5 M6 17H3V8h18v9h-3 M6 13h12v8H6z',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  history: 'M4 8a9 9 0 1 1-1 8 M4 3v6h6 M12 7v5l3 2',
  recovery: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
  refresh: 'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5',
  image: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01',
  table: 'M3 4h18v16H3z M3 9h18 M3 14h18 M9 4v16 M15 4v16',
  code: 'M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bold: 'M6 3h7a4.5 4.5 0 0 1 0 9H6 M6 12h8a4.5 4.5 0 0 1 0 9H6V3',
  italic: 'M10 3h10 M4 21h10 M15 3L9 21',
  formula: 'M18 3H8l6 9-6 9h10',
  source: 'M8 6l-6 6 6 6 M16 6l6 6-6 6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  format: 'M4 4h16 M12 4v16 M8 20h8',
  scrollTop: 'M5 4h14 M7 13l5-5 5 5 M12 8v13',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="ui-icon"
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
