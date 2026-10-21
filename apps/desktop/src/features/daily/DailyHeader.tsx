import { Icon } from '../../components/Icon.js';
import {
  addDays,
  dayLabel,
  lunarLabel,
  parseDayKey,
  relativeDayLabel,
  weekLabel,
  weekMonday,
} from './daily-dates.js';
import type { LunarDisplay } from './daily-preferences.js';
import './calendar.css';

/** The open day (or week) above the editor, with stepping to its neighbours. */
export function DailyHeader({
  noteKey,
  today,
  lunar,
  draftPath,
  disabled,
  onStep,
  onToday,
}: {
  noteKey: string;
  today: string;
  lunar: LunarDisplay;
  /** Where an unsaved day will be created; absent once the file exists. */
  draftPath: string | null;
  disabled: boolean;
  onStep(direction: -1 | 1): void;
  onToday(): void;
}) {
  const day = parseDayKey(noteKey) !== null;
  const monday = day ? null : weekMonday(noteKey);
  const title = day
    ? dayLabel(noteKey, noteKey.slice(0, 4) !== today.slice(0, 4))
    : weekLabel(noteKey);
  const detail = day
    ? [relativeDayLabel(noteKey, today), lunar === 'off' ? '' : lunarLabel(noteKey)]
    : monday
      ? [`${dayLabel(monday)} – ${dayLabel(addDays(monday, 6))}`]
      : [];
  const unit = day ? '天' : '周';
  return (
    <nav className="daily-header" aria-label={`日程：${title}`}>
      <button
        type="button"
        aria-label={`前一${unit}`}
        title={`前一${unit}`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onStep(-1)}
      >
        <Icon name="chevronLeft" />
      </button>
      <div className="daily-header-title">
        <strong>{title}</strong>
        <span>{detail.filter(Boolean).join(' · ')}</span>
      </div>
      <button
        type="button"
        aria-label={`后一${unit}`}
        title={`后一${unit}`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onStep(1)}
      >
        <Icon name="chevronRight" />
      </button>
      {day && noteKey !== today && (
        <button
          type="button"
          className="daily-header-today"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToday}
        >
          今天
        </button>
      )}
      {draftPath && (
        <span className="daily-header-draft" title={`输入内容并保存后创建 ${draftPath}`}>
          尚未创建 · 输入后保存到 {draftPath}
        </span>
      )}
    </nav>
  );
}
