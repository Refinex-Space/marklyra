import type { Category, Status } from '../../services/tasks.js';

/** Status and dictionary colours resolve through CSS variables in tasks.css. */
export const colorVar = (color: string) =>
  /^[a-z-]+$/.test(color) ? `var(--task-c-${color}, var(--task-c-gray))` : 'var(--task-c-gray)';

const C = 2 * Math.PI * 2.6;
function pie(color: string, fraction: number, ring = 1) {
  return (
    <>
      <circle cx="8" cy="8" r="6.2" stroke={color} strokeWidth="1.6" fill="none" opacity={ring} />
      {fraction > 0 && (
        <circle
          cx="8"
          cy="8"
          r="2.6"
          stroke={color}
          strokeWidth="5.2"
          fill="none"
          strokeDasharray={`${(C * Math.min(1, fraction)).toFixed(2)} ${C.toFixed(2)}`}
          transform="rotate(-90 8 8)"
        />
      )}
    </>
  );
}
const body: Record<Category, (c: string) => React.ReactNode> = {
  backlog: (c) => (
    <circle
      cx="8"
      cy="8"
      r="6.2"
      stroke={c}
      strokeWidth="1.6"
      fill="none"
      strokeDasharray="2.1 2.2"
    />
  ),
  unstarted: (c) => <circle cx="8" cy="8" r="6.2" stroke={c} strokeWidth="1.6" fill="none" />,
  started: (c) => pie(c, 0.5),
  review: (c) => pie(c, 0.75),
  completed: (c) => (
    <>
      <circle cx="8" cy="8" r="7" fill={c} />
      <path
        d="M5 8.2l2 2 4-4.2"
        stroke="var(--task-on-color)"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  cancelled: (c) => (
    <>
      <circle cx="8" cy="8" r="7" fill={c} />
      <path
        d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
        stroke="var(--task-on-color)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>
  ),
};

export function StatusGlyph({ status, size = 14 }: { status: Status; size?: number }) {
  return (
    <svg className="task-glyph" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {body[status.category](colorVar(status.color))}
    </svg>
  );
}

export function PriorityGlyph({ value }: { value: number }) {
  if (value === 1)
    return (
      <svg className="task-glyph" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="var(--task-c-urgent)" />
        <path
          d="M8 4.6v4.3M8 11.3h.01"
          stroke="var(--task-on-color)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  if (value === 0)
    return (
      <svg className="task-glyph task-faint" viewBox="0 0 16 16" aria-hidden="true">
        {[3.5, 8, 12.5].map((x) => (
          <circle key={x} cx={x} cy="8" r="1.1" fill="currentColor" />
        ))}
      </svg>
    );
  const level = ({ 2: 3, 3: 2, 4: 1 } as Record<number, number>)[value] ?? 0;
  return (
    <svg className="task-glyph task-muted" viewBox="0 0 16 16" aria-hidden="true">
      {[5, 8, 11].map((h, i) => (
        <rect
          key={h}
          x={2 + i * 4.5}
          y={13.5 - h}
          width="3"
          height={h}
          rx="1"
          fill="currentColor"
          opacity={i < level ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

export function ProgressPie({ fraction, size = 14 }: { fraction: number; size?: number }) {
  return (
    <svg className="task-glyph" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {pie('var(--task-c-done)', fraction, 0.45)}
    </svg>
  );
}

const paths = {
  folder: 'M3 6.5V5h6.5l2 2H21v12H3z',
  tag: 'M3.5 12.2V3.5h8.7l8.3 8.3-8.7 8.7zM8 8h.01',
  type: 'M12 3.5l3 3-3 3-3-3zM6.5 9l3 3-3 3-3-3zM17.5 9l3 3-3 3-3-3zM12 14.5l3 3-3 3-3-3z',
  layers: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5L12 21l8.5-4.5',
  subtask: 'M6 4v11a2 2 0 0 0 2 2h4M6 9h6M15 9h5M15 17h5',
  blocked: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  comment: 'M4 5h16v11H9.5L5 20z',
  tasks: 'M4 6l1.5 1.5L8 5M4 12.5L5.5 14 8 11.5M11 6.5h9M11 13h9M11 19h9M4.5 19h.01',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  board: 'M4 4h4.5v16H4zM10 4h4.5v11H10zM16 4h4v8h-4z',
  calendar: 'M4 5.5h16V20H4zM4 10h16M8.5 3v4M15.5 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.2 13.4l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.9 1.1L14.9 21h-3.6l-.3-2a7 7 0 0 1-1.9-1.1l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.8L5.4 10.3l1.8-3.1 1.9.7A7 7 0 0 1 11 6.8l.3-1.8h3.6l.3 1.8a7 7 0 0 1 1.9 1.1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.8z',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  pie: 'M12 3a9 9 0 1 0 9 9h-9z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  cycle: 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3.5v3.6h-3.6M5.5 20.5v-3.6h3.6',
  template: 'M5 3.5h14v17H5zM8.5 8h7M8.5 12h7M8.5 16h4',
  import: 'M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 15.5V20h15v-4.5',
  book: 'M4.5 5.5c2.6-1.3 5.2-1.3 7.5 0v14c-2.3-1.3-4.9-1.3-7.5 0zM12 5.5c2.3-1.3 4.9-1.3 7.5 0v14c-2.6-1.3-5.2-1.3-7.5 0z',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 10v9',
  branch: 'M7 4.5v15M7 15.5c0-4 10-3 10-7M7 4.5h.01M17 8.5h.01M7 19.5h.01',
  spark:
    'M10.5 4l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4L4.5 10l4.4-1.6zM17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
} as const;
export type TaskIconName = keyof typeof paths;
export function TaskIcon({ name, color }: { name: TaskIconName; color?: string }) {
  return (
    <svg
      className="task-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={color ? { color: colorVar(color) } : undefined}
    >
      <path d={paths[name]} />
    </svg>
  );
}
