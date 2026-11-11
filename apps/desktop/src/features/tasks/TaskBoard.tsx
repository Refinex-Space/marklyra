import { useLayoutEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/Icon.js';
import type { TaskFields, TaskMeta } from '../../services/tasks.js';
import { colorVar, PriorityGlyph, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import type { Catalog } from './model/catalog.js';
import { daysUntil } from './model/query.js';
import { boardColumns, comparator, type Display } from './model/view.js';
import { formatDay } from './pickers.js';

interface Props {
  catalog: Catalog;
  tasks: TaskMeta[];
  project: string | null;
  display: Display;
  active: string | null;
  setActive(id: string | null, scroll?: boolean): void;
  open(id: string, order: string[]): void;
  createIn(defaults: Partial<TaskFields>): void;
  /** Applies a drop: the column's field and a manual order between the neighbours. */
  move(task: TaskMeta, set: Partial<TaskFields>): void;
  onLayout(order: string[]): void;
}
interface Column {
  key: string;
  name: string;
  glyph: React.ReactNode;
  set: Partial<TaskFields>;
  tasks: TaskMeta[];
}

/** Pointer travel before a press becomes a drag, so clicks still open cards. */
const DRAG_SLOP = 5;

export function TaskBoard(props: Props) {
  const { catalog } = props;
  const by = boardColumns(props.display.groupBy);
  const columns = useMemo<Column[]>(() => {
    const compare = comparator(props.display.orderBy);
    const pick = (match: (t: TaskMeta) => boolean) => props.tasks.filter(match).sort(compare);
    if (by === 'bucket')
      return [
        ...catalog.bucketsFor(props.project).map((b) => ({
          key: b.id,
          name: b.name,
          glyph: <TaskIcon name="layers" color={b.color} />,
          set: { bucket: b.id },
          tasks: pick((t) => t.bucket === b.id),
        })),
        {
          key: '∅',
          name: '无队列',
          glyph: <TaskIcon name="layers" />,
          set: { bucket: null },
          tasks: pick((t) => !t.bucket || !catalog.bucket(t.bucket)),
        },
      ];
    return catalog.statusesFor(props.project).map((s) => ({
      key: s.id,
      name: s.name,
      glyph: <StatusGlyph status={s} />,
      set: { status: s.id },
      tasks: pick((t) => t.status === s.id),
    }));
  }, [by, catalog, props.tasks, props.project, props.display.orderBy]);
  const order = columns.flatMap((c) => c.tasks.map((t) => t.id));
  const reported = useRef('');
  if (reported.current !== order.join(',')) {
    reported.current = order.join(',');
    queueMicrotask(() => props.onLayout(order));
  }
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    task: TaskMeta;
    card: HTMLElement;
    ghost: HTMLElement | null;
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  // Cards that changed column after a drop slide from where they were.
  const positions = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const root = board.current;
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const card of root.querySelectorAll<HTMLElement>('.task-card[data-id]')) {
      const before = positions.current.get(card.dataset.id ?? '');
      if (!before) continue;
      const after = card.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) continue;
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
    positions.current.clear();
  });
  const remember = () => {
    for (const card of board.current?.querySelectorAll<HTMLElement>('.task-card[data-id]') ?? [])
      positions.current.set(card.dataset.id ?? '', card.getBoundingClientRect());
  };
  const placeholder = useRef<HTMLElement | null>(null);

  // Window listeners, not pointer capture: the lifted card leaves the layout mid-drag.
  const pointerDown = (event: React.PointerEvent, task: TaskMeta) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    // Keeps the drag from selecting text across the board.
    event.preventDefault();
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    drag.current = {
      task,
      card,
      ghost: null,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
    };
    const move = (e: PointerEvent) => pointerMove(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      pointerUp();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const pointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < DRAG_SLOP) return;
      d.moved = true;
      const ghost = d.card.cloneNode(true) as HTMLElement;
      ghost.classList.add('dragging');
      ghost.style.width = `${d.card.offsetWidth}px`;
      document.body.appendChild(ghost);
      d.ghost = ghost;
      const slot = document.createElement('div');
      slot.className = 'task-card-slot';
      slot.style.height = `${d.card.offsetHeight}px`;
      d.card.after(slot);
      d.card.classList.add('lifted');
      placeholder.current = slot;
    }
    if (d.ghost)
      d.ghost.style.transform = `translate(${event.clientX - d.dx}px, ${event.clientY - d.dy}px) rotate(1.5deg)`;
    const column = (document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el) => el.classList.contains('task-column')) ?? null) as HTMLElement | null;
    for (const c of board.current?.querySelectorAll('.task-column.drop') ?? [])
      if (c !== column) c.classList.remove('drop');
    const slot = placeholder.current;
    if (!column || !slot) return;
    column.classList.add('drop');
    const body = column.querySelector('.task-column-body');
    if (!body) return;
    const cards = [...body.querySelectorAll<HTMLElement>('.task-card[data-id]:not(.lifted)')];
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return event.clientY < r.top + r.height / 2;
    });
    if (
      (before && slot.nextElementSibling === before) ||
      (!before && slot.parentElement === body && !slot.nextElementSibling)
    )
      return;
    const first = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
    if (before) body.insertBefore(slot, before);
    else body.appendChild(slot);
    for (const c of cards) {
      const dy = (first.get(c) ?? 0) - c.getBoundingClientRect().top;
      if (dy)
        c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          duration: 160,
          easing: 'ease-out',
        });
    }
  };
  const pointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      props.open(d.task.id, order);
      return;
    }
    d.ghost?.remove();
    d.card.classList.remove('lifted');
    const slot = placeholder.current;
    placeholder.current = null;
    for (const c of board.current?.querySelectorAll('.task-column.drop') ?? [])
      c.classList.remove('drop');
    const column = slot?.closest<HTMLElement>('.task-column');
    const target = columns.find((c) => c.key === column?.dataset.column);
    if (!slot || !target) {
      slot?.remove();
      return;
    }
    const neighbours = [...(slot.parentElement?.children ?? [])];
    const index = neighbours.indexOf(slot);
    const prev = catalog.task((neighbours[index - 1] as HTMLElement | undefined)?.dataset.id);
    const next = catalog.task((neighbours[index + 1] as HTMLElement | undefined)?.dataset.id);
    slot.remove();
    const orderValue =
      prev && next
        ? (prev.order + next.order) / 2
        : prev
          ? prev.order + 1
          : next
            ? next.order - 1
            : d.task.order;
    remember();
    props.move(d.task, { ...target.set, order: orderValue });
  };

  return (
    <div className="task-board" ref={board}>
      {columns.map((column) => (
        <section
          key={column.key}
          className="task-column"
          data-column={column.key}
          aria-label={column.name}
        >
          <div className="task-column-head">
            {column.glyph}
            <span>{column.name}</span>
            <span className="task-count">{column.tasks.length}</span>
            <span className="task-spacer" />
            <button
              type="button"
              className="task-icon-btn"
              aria-label={`在${column.name}中新建任务`}
              onClick={() => props.createIn(column.set)}
            >
              <Icon name="add" />
            </button>
          </div>
          <div className="task-column-body">
            {column.tasks.map((task) => (
              <Card
                key={task.id}
                task={task}
                catalog={catalog}
                active={props.active === task.id}
                onPointerDown={pointerDown}
                hover={() => props.setActive(task.id, false)}
              />
            ))}
            {!column.tasks.length && <div className="task-column-empty" />}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({
  task,
  catalog,
  active,
  onPointerDown,
  hover,
}: {
  task: TaskMeta;
  catalog: Catalog;
  active: boolean;
  onPointerDown(event: React.PointerEvent, task: TaskMeta): void;
  hover(): void;
}) {
  const parent = catalog.task(task.parent);
  const kids = catalog.children(task.id);
  const done = kids.filter((k) => !catalog.isOpen(k)).length;
  const due = task.due ? daysUntil(task.due) : null;
  const open = catalog.isOpen(task);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer drag; the keyboard opens cards with Enter and changes fields with S/B.
    <div
      className={open ? 'task-card' : 'task-card closed'}
      data-id={task.id}
      data-active={active}
      onPointerDown={(e) => onPointerDown(e, task)}
      onMouseEnter={hover}
    >
      {parent && (
        <div className="task-card-parent">
          <TaskIcon name="subtask" />
          <span className="mono">{catalog.humanId(parent)}</span>
          <span>{parent.title}</span>
        </div>
      )}
      <div className="task-card-top">
        <span className="mono">{catalog.humanId(task)}</span>
        <span className="task-spacer" />
        <StatusGlyph status={catalog.status(task.status)} />
        <PriorityGlyph value={task.priority} />
      </div>
      <div className="task-card-title">{task.title}</div>
      <div className="task-card-foot">
        {kids.length > 0 && (
          <span className="task-subprog">
            <ProgressPie fraction={done / kids.length} size={12} />
            {done}/{kids.length}
          </span>
        )}
        {task.labels.slice(0, 3).map((id) => {
          const label = catalog.label(id);
          return (
            label && (
              <span key={id} className="task-pill">
                <i className="task-dot" style={{ background: colorVar(label.color) }} />
                {label.name}
              </span>
            )
          );
        })}
        {catalog.isBlocked(task) && (
          <span className="task-pill danger">
            <TaskIcon name="blocked" />
            被阻塞
          </span>
        )}
        {task.due && (
          <span className={`task-pill ${open && due !== null && due < 0 ? 'danger' : ''}`}>
            <TaskIcon name="flag" />
            {formatDay(task.due)}
          </span>
        )}
      </div>
    </div>
  );
}
