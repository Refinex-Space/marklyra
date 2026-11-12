import { Card, Row, Segmented, Select, Switch } from '../export/settings/controls.js';
import { usePreferences } from '../settings/usePreferences.js';
import type { CalendarPreferences } from './calendar-preferences.js';
import '../export/settings/export-settings.css';

/** 日历 settings: stored with the shell preferences, so every window follows at once. */
export function CalendarSettings({ dark }: { dark: boolean }) {
  const [preferences, setPreferences] = usePreferences();
  const calendar = preferences.calendar;
  const update = (change: Partial<CalendarPreferences>) =>
    setPreferences((current) => ({ ...current, calendar: { ...current.calendar, ...change } }));
  const off = !calendar.enabled;
  return (
    <section className="es" aria-label="日历设置" data-dark={dark}>
      <div className="es-scroll">
        <div className="es-content">
          <header className="es-heading">
            <div>
              <h1>日历</h1>
              <p>侧栏日历按到期日标出任务；点击日期查看当天到期的任务，右键可新建。</p>
            </div>
          </header>
          <Card>
            <Row label="显示日历" hint="关闭后侧栏不再显示日历；任务与到期日不受影响。">
              <Switch
                label="显示日历"
                checked={calendar.enabled}
                onChange={(enabled) => update({ enabled })}
              />
            </Row>
          </Card>
          <Card title="显示">
            <Row label="日历形态" hint="也可以在日历标题栏切换；收起时只显示今天。">
              <Segmented
                label="日历形态"
                value={calendar.calendarView}
                disabled={off}
                options={[
                  { value: 'month', label: '月视图' },
                  { value: 'week', label: '周视图' },
                  { value: 'collapsed', label: '收起' },
                ]}
                onChange={(calendarView) =>
                  update({
                    calendarView,
                    ...(calendarView === 'collapsed' ? {} : { expandedView: calendarView }),
                  })
                }
              />
            </Row>
            <Row label="一周开始于">
              <Select
                label="一周开始于"
                value={calendar.weekStart}
                disabled={off}
                options={[
                  { value: 'system', label: '跟随系统' },
                  { value: 'monday', label: '周一' },
                  { value: 'sunday', label: '周日' },
                ]}
                onChange={(weekStart) => update({ weekStart })}
              />
            </Row>
            <Row label="显示周数" hint="按 ISO 8601 计算；侧栏较窄时自动隐藏。">
              <Switch
                label="显示周数"
                checked={calendar.showWeekNumbers}
                disabled={off}
                onChange={(showWeekNumbers) => update({ showWeekNumbers })}
              />
            </Row>
            <Row
              label="标记有任务到期的日期"
              hint="强调色表示仍有未完成任务，红色表示已逾期，灰色表示都已完成。"
            >
              <Switch
                label="标记有任务到期的日期"
                checked={calendar.markTasks}
                disabled={off}
                onChange={(markTasks) => update({ markTasks })}
              />
            </Row>
            <Row label="农历" hint="离线计算，不需要网络。">
              <Select
                label="农历"
                value={calendar.lunar}
                disabled={off}
                options={[
                  { value: 'off', label: '不显示' },
                  { value: 'hover', label: '悬停提示与日期栏' },
                  { value: 'cell', label: '同时显示在日期格中' },
                ]}
                onChange={(lunar) => update({ lunar })}
              />
            </Row>
          </Card>
        </div>
      </div>
    </section>
  );
}
