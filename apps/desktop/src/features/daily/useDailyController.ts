import type { DailyLocation } from '../../services/daily.js';
import type { DocumentFile } from '../../services/documents.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import type { DailyDraft, DocumentAction } from '../documents/useDocumentSession.js';
import { addDays, parseDayKey, parseWeekKey, weekKey, weekMonday } from './daily-dates.js';
import {
  applyDailyTemplate,
  type DailyPreferences,
  dailyKeyForPath,
  workspaceRelativePath,
} from './daily-preferences.js';
import { useToday } from './useDailyNotes.js';

interface DailyDocument {
  file: DocumentFile | null;
  dailyDraft: DailyDraft | null;
  request(action: DocumentAction): Promise<void>;
  setMessage(message: string): void;
}

/** One place that knows which day is open and how to open another. */
export function useDailyController(
  doc: DailyDocument,
  workspace: WorkspaceFolder | null,
  preferences: DailyPreferences,
  focusEditor: () => void,
) {
  const today = useToday();
  const location: DailyLocation | null =
    workspace && preferences.enabled
      ? { workspaceId: workspace.id, folder: preferences.folder, layout: preferences.layout }
      : null;
  let activeKey: string | null = null;
  if (location && doc.dailyDraft) {
    const draft = doc.dailyDraft.location;
    if (
      draft.workspaceId === location.workspaceId &&
      draft.folder === location.folder &&
      draft.layout === location.layout
    )
      activeKey = doc.dailyDraft.key;
  } else if (location && workspace && doc.file) {
    const relative = workspaceRelativePath(workspace.path, doc.file.path);
    if (relative) activeKey = dailyKeyForPath(relative, location.folder, location.layout);
  }
  const activeDay = activeKey && parseDayKey(activeKey) ? activeKey : null;
  const open = (key: string) => {
    if (!preferences.enabled) {
      doc.setMessage('日程已在设置中关闭');
      return;
    }
    if (!location) {
      doc.setMessage('请先在侧栏打开一个文件夹，日程保存在该文件夹中');
      return;
    }
    if (key === activeKey) {
      focusEditor();
      return;
    }
    void doc.request({
      kind: 'daily',
      location,
      key,
      template: parseDayKey(key) ? applyDailyTemplate(preferences.template, key) : '',
    });
  };
  return {
    today,
    location,
    activeKey,
    activeDay,
    open,
    openToday: () => open(today),
    /** Previous/next day (or week) from the open note; nothing when none is open. */
    step: (direction: -1 | 1) => {
      if (activeDay) open(addDays(activeDay, direction));
      else if (activeKey && parseWeekKey(activeKey))
        open(weekKey(addDays(weekMonday(activeKey), direction * 7)));
    },
  };
}
