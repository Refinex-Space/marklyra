import { SkeletonRows } from '../../components/Skeleton.js';
import type { TaskMeta } from '../../services/tasks.js';
import { dayLabel, lunarLabel } from '../calendar/calendar-dates.js';
import type { LunarDisplay } from '../calendar/calendar-preferences.js';
import type { TaskAgenda } from '../calendar/useTaskAgenda.js';
import { StatusGlyph } from '../tasks/glyphs.js';
import { daysUntil } from '../tasks/model/query.js';

const SHOWN = 6;

/** Today on the home view: open tasks that are overdue or due today, each one opens its page. */
export function HomeTasks({
  agenda,
  today,
  lunar,
  mac,
  onOpenTask,
  onOpenDay,
  onNewTask,
}: {
  agenda: TaskAgenda;
  today: string;
  lunar: LunarDisplay;
  mac: boolean;
  onOpenTask(id: string): void;
  /** Today's due tasks in the workbench. */
  onOpenDay(): void;
  onNewTask(): void;
}) {
  const { catalog, status, error, retry } = agenda;
  const dueToday = (agenda.byDay.get(today) ?? []).filter((task) => catalog?.isOpen(task));
  const pending: TaskMeta[] = [...agenda.overdue, ...dueToday];
  const doneToday = (agenda.byDay.get(today)?.length ?? 0) - dueToday.length;
  const subtitle = [dayLabel(today), lunar === 'off' ? '' : lunarLabel(today)]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className="home-section home-today" aria-labelledby="home-today">
      <div className="home-section-head">
        <h2 id="home-today">
          今天 <span className="home-today-date">{subtitle}</span>
        </h2>
        <button type="button" className="home-link" onClick={onNewTask}>
          <span className="home-today-action">新建任务</span>
          <kbd>{mac ? '⌘⌥N' : 'Ctrl Alt N'}</kbd>
        </button>
      </div>
      {status === 'error' && !catalog ? (
        <div className="home-empty" role="alert">
          无法读取任务：{error}
          <button type="button" className="home-link" onClick={retry}>
            重试
          </button>
        </div>
      ) : !catalog ? (
        <SkeletonRows
          className="home-recent home-recent-skeleton"
          rows={2}
          icon
          height={40}
          label="正在读取今天的任务"
        />
      ) : !pending.length ? (
        <div className="home-empty">
          {doneToday > 0 ? `今天到期的 ${doneToday} 项任务都已完成。` : '今天没有到期的任务。'}
        </div>
      ) : (
        <ul className="home-recent home-today-list" aria-label="今天的任务">
          {pending.slice(0, SHOWN).map((task) => {
            const late = task.due && task.due < today ? -daysUntil(task.due) : 0;
            const project = catalog.project(task.project);
            return (
              <li key={task.id}>
                <button type="button" onClick={() => onOpenTask(task.id)}>
                  <span className="home-recent-icon" aria-hidden="true">
                    <StatusGlyph status={catalog.status(task.status)} size={14} />
                  </span>
                  <span className="home-task-id">{catalog.humanId(task)}</span>
                  <span className="home-recent-name">{task.title}</span>
                  {project && <span className="home-recent-where">{project.name}</span>}
                  <span className={late ? 'home-task-due late' : 'home-task-due'}>
                    {late ? `逾期 ${late} 天` : '今天'}
                  </span>
                </button>
              </li>
            );
          })}
          {pending.length > SHOWN && (
            <li>
              <button type="button" className="home-today-more" onClick={onOpenDay}>
                还有 {pending.length - SHOWN} 项，在任务中查看
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
