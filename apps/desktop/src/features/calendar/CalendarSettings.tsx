import { useId, useState } from 'react';
import {
  Card,
  Row,
  Segmented,
  Select,
  Switch,
  TextArea,
  TextField,
} from '../export/settings/controls.js';
import { usePreferences } from '../settings/usePreferences.js';
import { todayKey, weekKey } from './daily-dates.js';
import {
  applyDailyTemplate,
  DAILY_TEMPLATE_LIMIT,
  type DailyPreferences,
  dailyFolderError,
  dailyRelativePath,
} from './daily-preferences.js';
import '../export/settings/export-settings.css';

/** 日程 settings: stored with the shell preferences, so every window follows at once. */
export function DailySettings({ dark }: { dark: boolean }) {
  const [preferences, setPreferences] = usePreferences();
  const daily = preferences.daily;
  const [folderError, setFolderError] = useState('');
  const folderId = useId();
  const folderHint = useId();
  const templateId = useId();
  const update = (change: Partial<DailyPreferences>) =>
    setPreferences((current) => ({ ...current, daily: { ...current.daily, ...change } }));
  const today = todayKey();
  const off = !daily.enabled;
  return (
    <section className="es" aria-label="日程设置" data-dark={dark}>
      <div className="es-scroll">
        <div className="es-content">
          <header className="es-heading">
            <div>
              <h1>日程</h1>
              <p>
                {
                  '每天一份 Markdown 笔记，保存在当前打开的文件夹中。点击日历上的日期即可查看或记录，只有写下内容后才会创建文件。'
                }
              </p>
            </div>
          </header>
          <Card>
            <Row label="启用日程" hint="关闭后隐藏日历、今日日程和相关菜单；已有文件不受影响。">
              <Switch
                label="启用日程"
                checked={daily.enabled}
                onChange={(enabled) => update({ enabled })}
              />
            </Row>
          </Card>
          <Card
            title="存储"
            description="日程文件名是日期本身，任何 Markdown 工具都能直接读写；MarkLyra 不会在文件夹中写入索引或配置。"
          >
            <Row
              label="日程目录"
              htmlFor={folderId}
              hint={
                folderError ? (
                  <span className="es-field-error" id={folderHint}>
                    {folderError}
                  </span>
                ) : (
                  <span id={folderHint}>相对当前文件夹，用 / 分隔，例如 Daily 或 笔记/日程。</span>
                )
              }
            >
              <TextField
                id={folderId}
                label="日程目录"
                value={daily.folder}
                disabled={off}
                invalid={!!folderError}
                describedBy={folderHint}
                maxLength={200}
                onCommit={(value) => {
                  const error = dailyFolderError(value);
                  setFolderError(error ?? '');
                  if (!error) update({ folder: value });
                }}
              />
            </Row>
            <Row
              label="目录结构"
              hint={`今天的日程：${dailyRelativePath(daily.folder, daily.layout, today)}`}
            >
              <Segmented
                label="目录结构"
                value={daily.layout}
                disabled={off}
                options={[
                  { value: 'nested', label: '按年/月分层' },
                  { value: 'flat', label: '平铺' },
                ]}
                onChange={(layout) => update({ layout })}
              />
            </Row>
            <Row
              label="周记"
              hint={`点击日历上的周数打开 ${dailyRelativePath(daily.folder, daily.layout, weekKey(today))}`}
            >
              <Switch
                label="周记"
                checked={daily.weekly}
                disabled={off}
                onChange={(weekly) => update({ weekly })}
              />
            </Row>
          </Card>
          <Card
            title="新日程模板"
            description="新的一天以此为初始内容；未改动的模板不会保存成文件。可用变量：{{date}} {{weekday}} {{week}} {{title}} {{lunar}}。"
          >
            <Row
              stacked
              label="初始内容"
              htmlFor={templateId}
              hint={
                daily.template
                  ? `预览（今天）首行：${applyDailyTemplate(daily.template, today).split('\n')[0] || '（空行）'}`
                  : '留空时，新的一天从空白开始。'
              }
            >
              <TextArea
                id={templateId}
                label="新日程模板"
                rows={6}
                value={daily.template}
                maxLength={DAILY_TEMPLATE_LIMIT}
                placeholder={'## 待办\n- [ ] \n\n## 记录\n'}
                onCommit={(template) => update({ template })}
              />
            </Row>
          </Card>
          <Card title="日历">
            <Row label="日历形态" hint="也可以在日历标题栏切换；收起时只显示今天。">
              <Segmented
                label="日历形态"
                value={daily.calendarView}
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
                value={daily.weekStart}
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
                checked={daily.showWeekNumbers}
                disabled={off}
                onChange={(showWeekNumbers) => update({ showWeekNumbers })}
              />
            </Row>
            <Row label="标记有日程的日期">
              <Switch
                label="标记有日程的日期"
                checked={daily.markNotes}
                disabled={off}
                onChange={(markNotes) => update({ markNotes })}
              />
            </Row>
            <Row label="突出有未完成待办的日期" hint="以强调色圆点标出仍有 - [ ] 待办的日期。">
              <Switch
                label="突出有未完成待办的日期"
                checked={daily.markOpenTasks}
                disabled={off}
                onChange={(markOpenTasks) => update({ markOpenTasks })}
              />
            </Row>
            <Row label="农历" hint="离线计算，不需要网络。">
              <Select
                label="农历"
                value={daily.lunar}
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
