import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import type { DailyLocation } from '../../services/daily.js';
import { type AgendaItem, orderedAgenda } from './daily-agenda.js';
import { dayLabel, lunarLabel } from './daily-dates.js';
import type { LunarDisplay } from './daily-preferences.js';
import { useDailyNotes } from './useDailyNotes.js';
import './calendar.css';

const SHOWN = 6;

/** Today's unfinished items on the home view; read-only, each one opens its line. */
export function HomeToday({
  location,
  today,
  lunar,
  mac,
  onOpenDay,
  onOpenItem,
}: {
  location: DailyLocation;
  today: string;
  lunar: LunarDisplay;
  mac: boolean;
  onOpenDay(): void;
  onOpenItem(relativePath: string, item: AgendaItem): void;
}) {
  const { notes, status, error, retry } = useDailyNotes(location, [today], 0);
  const note = notes.get(today);
  const pending = orderedAgenda(note?.agenda?.items ?? []).filter((item) => item.checked !== true);
  const agenda = note?.agenda;
  const subtitle = [dayLabel(today), lunar === 'off' ? '' : lunarLabel(today)]
    .filter(Boolean)
    .join(' · ');
  const loading = status !== 'ready' && status !== 'error' && !note;
  return (
    <section className="home-section home-today" aria-labelledby="home-today">
      <div className="home-section-head">
        <h2 id="home-today">
          今日日程 <span className="home-today-date">{subtitle}</span>
        </h2>
        <button type="button" className="home-link" onClick={onOpenDay}>
          {note ? '打开' : '开始记录'}
          <kbd>{mac ? '⌘⇧D' : 'Ctrl Shift D'}</kbd>
        </button>
      </div>
      {status === 'error' && !note ? (
        <div className="home-empty" role="alert">
          无法读取今日日程：{error}
          <button type="button" className="home-link" onClick={retry}>
            重试
          </button>
        </div>
      ) : loading ? (
        <SkeletonRows
          className="home-recent home-recent-skeleton"
          rows={2}
          icon
          height={40}
          label="正在读取今日日程"
        />
      ) : !note ? (
        <div className="home-empty">
          今天还没有日程。写下第一件要做的事，日程会保存在当前文件夹。
        </div>
      ) : !pending.length ? (
        <div className="home-empty">
          {agenda && agenda.done > 0
            ? `今天的 ${agenda.done} 项待办已全部完成。`
            : agenda
              ? '今天已有记录，暂无待办。'
              : '今天已有记录。'}
        </div>
      ) : (
        <ul className="home-recent home-today-list">
          {pending.slice(0, SHOWN).map((item) => (
            <li key={`${item.line}:${item.column}`}>
              <button type="button" onClick={() => onOpenItem(note.relativePath, item)}>
                <span className="home-recent-icon" aria-hidden="true">
                  <Icon name={item.checked === false ? 'checkbox' : 'calendar'} />
                </span>
                {item.start && (
                  <time className="home-today-time">
                    {item.start}
                    {item.end ? `–${item.end}` : ''}
                  </time>
                )}
                <span className="home-recent-name">{item.text || '（空白待办）'}</span>
              </button>
            </li>
          ))}
          {pending.length > SHOWN && (
            <li>
              <button type="button" className="home-today-more" onClick={onOpenDay}>
                还有 {pending.length - SHOWN} 项，打开今日日程查看
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
