import { useState } from 'react';
import { useModalFocus } from '../../components/useModalFocus.js';
import { ImageStorageSettings } from './ImageStorageSettings.js';
import type { Preferences, StatisticsUnit } from './preferences.js';

interface Props {
  value: Preferences;
  update: (value: Preferences) => void;
  theme: string;
  themes: readonly string[];
  setTheme: (theme: string) => void;
  autosave: boolean;
  setAutosave: (enabled: boolean) => void;
  desktop: boolean;
  close: () => void;
  closing: boolean;
}
export function PreferencesPanel(props: Props) {
  const [speedDraft, setSpeedDraft] = useState(String(props.value.wordsPerMinute));
  const panel = useModalFocus(true, props.close, props.closing, props.closing);
  const change = (patch: Partial<Preferences>) => props.update({ ...props.value, ...patch });
  return (
    <div className="modal-backdrop">
      <section
        className="preferences-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        ref={panel}
      >
        <header className="panel-heading">
          <h2 id="preferences-title">偏好设置</h2>
          <button type="button" disabled={props.closing} onClick={props.close}>
            完成
          </button>
        </header>
        <fieldset>
          <legend>外观</legend>
          <label className="preference-row">
            <span>主题</span>
            <select
              aria-label="主题"
              value={props.theme}
              onChange={(event) => props.setTheme(event.target.value)}
            >
              {props.themes.map((theme) => (
                <option key={theme}>{theme}</option>
              ))}
            </select>
          </label>
          <label className="preference-row">
            <span>显示格式工具栏</span>
            <input
              type="checkbox"
              checked={props.value.formatToolbar}
              onChange={(event) => change({ formatToolbar: event.target.checked })}
            />
          </label>
        </fieldset>
        {props.desktop && (
          <ImageStorageSettings
            value={props.value.imageStorageFolder}
            change={(imageStorageFolder) => change({ imageStorageFolder })}
          />
        )}
        <fieldset>
          <legend>文档统计</legend>
          <label className="preference-row">
            <span>状态栏主要单位</span>
            <select
              value={props.value.statisticsUnit}
              onChange={(event) => change({ statisticsUnit: event.target.value as StatisticsUnit })}
            >
              <option value="words">词数</option>
              <option value="characters">字符</option>
              <option value="lines">行数</option>
              <option value="readingMinutes">阅读时间</option>
            </select>
          </label>
          <label className="preference-row">
            <span>阅读速度（词 / 分钟）</span>
            <input
              type="number"
              min="1"
              max="999"
              step="1"
              value={speedDraft}
              onBlur={() => setSpeedDraft(String(props.value.wordsPerMinute))}
              onChange={(event) => {
                setSpeedDraft(event.target.value);
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 999)
                  change({ wordsPerMinute: value });
              }}
            />
          </label>
        </fieldset>
        {props.desktop && (
          <fieldset>
            <legend>保存</legend>
            <label className="preference-row">
              <span>自动保存文件</span>
              <input
                type="checkbox"
                checked={props.autosave}
                onChange={(event) => props.setAutosave(event.target.checked)}
              />
            </label>
            <p>
              编辑暂停后保存已命名文件。磁盘冲突或未完成的输入法候选会暂停保存；未命名稿仍保留恢复副本。
            </p>
          </fieldset>
        )}
      </section>
    </div>
  );
}
