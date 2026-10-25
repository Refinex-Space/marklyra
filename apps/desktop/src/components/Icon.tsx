const paths = {
  graph:
    'M6.4 6.5l3.4 3.7 M13.6 10.6l3.7-2.5 M13 14l2.8 3.4 M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M14 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0 M21 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M19 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  rename: 'M4 20l4-1 12-12-3-3L5 16z M14 7l3 3',
  archive: 'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',
  restore: 'M4 10h16v11H4z M12 16V3 M8 7l4-4 4 4',
  delete: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  attachment: 'M8 13l7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9',
  document: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',
  close: 'M6 6l12 12 M18 6L6 18',
  copy: 'M9 9h12v12H9z M5 15H3V3h12v2',
  check: 'M4 12l5 5L20 6',
  send: 'M12 20V4 M5 11l7-7 7 7',
  stop: 'M6 6h12v12H6z',
  add: 'M12 4v16 M4 12h16',
  arrowRight: 'M4 12h16 M14 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  calendarWeek: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4 M7 15h10',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  checkbox: 'M5 5h14v14H5z',
  home: 'M3 11l9-8 9 8 M5 9.5V21h5v-6h4v6h5V9.5',
  ai: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z M20 2v4 M18 4h4',
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
  menu: 'M4 6h16 M4 12h16 M4 18h16',
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
