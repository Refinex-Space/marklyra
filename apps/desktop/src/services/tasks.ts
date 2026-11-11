import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Mirrors `task_store::Category`. Order is the display order of status groups. */
export type Category = 'backlog' | 'unstarted' | 'started' | 'review' | 'completed' | 'cancelled';
export const CATEGORIES: readonly Category[] = [
  'backlog',
  'unstarted',
  'started',
  'review',
  'completed',
  'cancelled',
];
export const isOpenCategory = (category: Category) =>
  category !== 'completed' && category !== 'cancelled';

export interface TaskMeta {
  id: string;
  title: string;
  project: string | null;
  number: number;
  status: string;
  /** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
  priority: number;
  type: string | null;
  labels: string[];
  bucket: string | null;
  cycle: number | null;
  /** When the task joined its cycle; at or before the cycle's `started` it was planned. */
  cycleAdded: string | null;
  parent: string | null;
  due: string | null;
  created: string;
  updated: string;
  completed: string | null;
  previousIds: string[];
  archived: boolean;
  order: number;
  blockedBy: string[];
  related: string[];
  hasDescription: boolean;
  comments: number;
  revision: string;
}
export interface Project {
  id: string;
  name: string;
  key: string;
  previousKeys: string[];
  icon: string;
  color: string;
  state: 'active' | 'completed' | 'archived' | string;
  order: number;
  pinned: boolean;
  description: string;
  created: string;
  /** `null` offers every workspace value. */
  statuses: string[] | null;
  labels: string[] | null;
  buckets: string[] | null;
  /** Saved views shown as tabs. */
  views: string[];
  /** Template that pre-fills new tasks in this project. */
  defaultTemplate: string | null;
  revision: string;
}
export type ViewLayout = 'list' | 'board';
export interface SavedView {
  id: string;
  name: string;
  icon: string;
  query: string;
  /** Belongs to one project; `null` can be added anywhere. */
  project: string | null;
  layout: ViewLayout;
  groupBy: string;
  orderBy: string;
  order: number;
  revision: string;
}
export type DictionaryKind = 'labels' | 'types' | 'buckets' | 'statuses';
export interface Status {
  id: string;
  name: string;
  category: Category;
  color: string;
  builtin: boolean;
  order: number;
}
export interface Dictionary {
  id: string;
  name: string;
  color: string;
  order: number;
  addLabels: string[];
  setPriority: number;
}
export interface TaskSettings {
  unassignedKey: string;
  comments: boolean;
  cyclesEnabled: boolean;
  /** 1–4. */
  cycleWeeks: number;
  /** ISO weekday: 1 Monday … 7 Sunday. */
  cycleStartDay: number;
}
export interface CycleSummary {
  planned: number;
  added: number;
  completed: string[];
  cancelled: string[];
  unfinished: string[];
}
export interface Cycle {
  number: number;
  name: string | null;
  /** Local calendar days, end inclusive. */
  start: string;
  end: string;
  state: 'active' | 'upcoming' | 'completed';
  started: string | null;
  completedAt: string | null;
  /** Frozen when the cycle completes. */
  summary: CycleSummary | null;
  revision: string;
}
export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  status: string | null;
  priority: number;
  type: string | null;
  labels: string[];
  bucket: string | null;
  subtasks: string[];
  description: string;
  order: number;
  revision: string;
}
export interface TaskSnapshot {
  generation: number;
  initialized: boolean;
  tasks: TaskMeta[];
  projects: Project[];
  statuses: Status[];
  labels: Dictionary[];
  types: Dictionary[];
  buckets: Dictionary[];
  views: SavedView[];
  cycles: Cycle[];
  templates: TaskTemplate[];
  settings: TaskSettings;
  invalid: { path: string; error: string }[];
  truncated: boolean;
}
export interface TaskDraft {
  title: string;
  project: string | null;
  status?: string;
  priority?: number;
  type?: string | null;
  labels?: string[];
  bucket?: string | null;
  cycle?: number | null;
  due?: string | null;
  parent?: string | null;
  description?: string;
  subtasks?: string[];
}
/** Fields a patch may set; `null` clears. */
export interface TaskFields {
  title: string;
  status: string;
  priority: number;
  type: string | null;
  labels: string[];
  bucket: string | null;
  cycle: number | null;
  parent: string | null;
  due: string | null;
  archived: boolean;
  order: number;
  blockedBy: string[];
  related: string[];
  project: string | null;
}
export type TaskMutation =
  | { kind: 'createTask'; draft: TaskDraft }
  | { kind: 'patch'; ids: string[]; revisions: string[]; set: Partial<TaskFields> }
  | { kind: 'setDescription'; id: string; revision: string; body: string }
  | { kind: 'delete'; ids: string[]; revisions: string[] }
  | { kind: 'comment'; id: string; body: string }
  | {
      kind: 'createProject';
      name: string;
      key: string;
      icon?: string;
      color?: string;
      description?: string;
    }
  | { kind: 'updateProject'; id: string; revision: string; set: Record<string, unknown> }
  | {
      kind: 'upsertDictionary';
      dictionary: DictionaryKind;
      id?: string;
      set: Record<string, unknown>;
    }
  | { kind: 'deleteDictionary'; dictionary: DictionaryKind; id: string }
  /** `today` (local `YYYY-MM-DD`) places the first cycle; it is not stored. */
  | { kind: 'updateSettings'; set: Partial<TaskSettings> & { today?: string } }
  | { kind: 'saveView'; id?: string; set: Record<string, unknown> }
  | { kind: 'deleteView'; id: string }
  | { kind: 'saveTemplate'; id?: string; set: Record<string, unknown> }
  | { kind: 'deleteTemplate'; id: string }
  | {
      kind: 'completeCycle';
      number: number;
      today: string;
      /** Unfinished task id → `next` (default) or `none`. */
      moves: Record<string, 'next' | 'none'>;
    };
export interface MutationResult {
  generation: number;
  applied: string[];
  conflicts: string[];
  created: string[];
}
export interface TaskComment {
  id: string;
  created: string;
  body: string;
}
export interface TaskEvent {
  id: string;
  at: string;
  type: 'created' | 'status' | 'priority' | 'cycle' | 'project' | 'archived' | 'restored' | string;
  from?: string;
  /** Who made the change when it was not the person: `ai:<agent>`, `cli`. */
  by?: string;
  to?: unknown;
}
export interface TaskDetail {
  id: string;
  body: string;
  revision: string;
  comments: TaskComment[];
  activity: TaskEvent[];
}

export interface TaskMention {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
}

/** Errors arrive as `[code] message`; the code drives the follow-up in the UI. */
export const taskErrorCode = (error: unknown) => /^\[([a-z-]+)\]/.exec(String(error))?.[1] ?? 'io';
export const taskErrorMessage = (error: unknown) => String(error).replace(/^\[[a-z-]+\]\s*/, '');

export const tasks = {
  snapshot: (workspaceId: string) => invoke<TaskSnapshot>('tasks_snapshot', { workspaceId }),
  mutate: (workspaceId: string, mutation: TaskMutation) =>
    invoke<MutationResult>('tasks_mutate', { workspaceId, mutation }),
  /** Ids whose title or description contains every term. */
  search: (workspaceId: string, text: string) =>
    invoke<string[]>('tasks_search', { workspaceId, text }),
  detail: (workspaceId: string, id: string) =>
    invoke<TaskDetail>('tasks_detail', { workspaceId, id }),
  /** Places in workspace notes that link to the task. */
  mentions: (workspaceId: string, id: string) =>
    invoke<TaskMention[]>('tasks_mentions', { workspaceId, id }),
};
export type ImportKind = 'github' | 'csv' | 'octarine' | 'notes';
export interface ImportOptions {
  project: string | null;
  createLabels: boolean;
  includeClosed: boolean;
}
export interface ImportRow {
  index: number;
  title: string;
  sourceRef: string;
  outcome: 'new' | 'skip' | 'problem';
  reason: string | null;
  status: string;
  project: string;
  labels: string[];
  unknownLabels: string[];
  parent: string | null;
}
export interface ImportPreview {
  kind: ImportKind;
  label: string;
  rows: ImportRow[];
  new: number;
  skip: number;
  problem: number;
  projectsToCreate: string[];
  labelsToCreate: string[];
  unknownLabels: string[];
  warnings: string[];
  includeClosedDefault: boolean;
}
export interface ImportOpened {
  token: string;
  preview: ImportPreview;
}
export interface ImportResult {
  created: number;
  receipt: ImportReceipt;
  linked: number;
  unlinkedNotes: string[];
}
export interface ImportReceipt {
  id: string;
  at: string;
  kind: ImportKind;
  label: string;
  tasks: string[];
  projects: string[];
  labels: string[];
  undone: boolean;
}

/** Imports: the host reads the source and keeps it; the renderer previews and applies by token. */
export const taskImports = {
  /** Native file (or folder) dialog; `null` when cancelled. */
  pick: (workspaceId: string, kind: Exclude<ImportKind, 'notes'>) =>
    invoke<ImportOpened | null>('tasks_import_pick', { workspaceId, kind }),
  /** Checklist items in one note or folder (workspace-relative), or the whole workspace. */
  notes: (workspaceId: string, relative: string | null) =>
    invoke<ImportOpened>('tasks_import_notes', { workspaceId, relative }),
  preview: (workspaceId: string, token: string, options: ImportOptions) =>
    invoke<ImportPreview>('tasks_import_preview', { workspaceId, token, options }),
  apply: (workspaceId: string, token: string, options: ImportOptions, skipNotes: string[]) =>
    invoke<ImportResult>('tasks_import_apply', { workspaceId, token, options, skipNotes }),
  receipts: (workspaceId: string) =>
    invoke<ImportReceipt[]>('tasks_import_receipts', { workspaceId }),
  undo: (workspaceId: string, id: string) =>
    invoke<number>('tasks_import_undo', { workspaceId, id }),
};

export const onTasksChanged = (handler: (generation: number) => void): Promise<UnlistenFn> =>
  listen<{ generation: number }>('marklyra:tasks-changed', (event) =>
    handler(event.payload.generation),
  );
