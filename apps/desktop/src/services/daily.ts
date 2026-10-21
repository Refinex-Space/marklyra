import { invoke } from '@tauri-apps/api/core';
import type { DailyLayout } from '../features/daily/daily-preferences.js';
import type { DocumentFile } from './documents.js';

export interface DailyLocation {
  workspaceId: string;
  folder: string;
  layout: DailyLayout;
}
export interface DailyNote {
  /** `YYYY-MM-DD` or ISO week `YYYY-Www`. */
  key: string;
  relativePath: string;
  size: number;
  modifiedAt: number | null;
  /** Absent for large or non-UTF-8 files; they still count as existing notes. */
  text: string | null;
}
/** The host computes every path from the key; the renderer never names a file. */
export const dailyNotes = {
  /** Existing notes among at most 64 keys, in key order. Missing days are not errors. */
  read: ({ workspaceId, folder, layout }: DailyLocation, keys: string[]) =>
    invoke<DailyNote[]>('read_daily_notes', { workspaceId, folder, layout, keys }),
  /** Exclusive creation: an existing file is never overwritten. */
  create: ({ workspaceId, folder, layout }: DailyLocation, key: string, text: string) =>
    invoke<DocumentFile>('create_daily_note', { workspaceId, folder, layout, key, text }),
};
export const DAILY_EXISTS = '该日期的日程文件已存在';
