import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon.js';
import { SkeletonRows } from '../../components/Skeleton.js';
import { type TaskFields, type TaskMeta, tasks as taskApi } from '../../services/tasks.js';
import type { WorkspaceFolder, WorkspaceMatchPosition } from '../../services/workspaces.js';
import { notify } from '../notices/notices.js';
import { CompleteCycleDialog, CycleOverview } from './cycles.js';
import {
  applyTemplate,
  ConfirmDialog,
  type DraftState,
  NewProjectDialog,
  NewTaskDialog,
} from './dialogs.js';
import { ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import type { Catalog } from './model/catalog.js';
import { cycleTiming, cycleTitle, timingText } from './model/cycle.js';
import { rememberTaskProject } from './model/last-project.js';
import type { LinkTarget } from './model/links.js';
import { parseQuery, serializeQuery } from './model/query.js';
import { DEFAULT_DISPLAY, type Display, type GroupBy, type OrderBy } from './model/view.js';
import { ProjectOverview } from './ProjectOverview.js';
import {
  changeMessage,
  formatRange,
  isoDay,
  PICKER_KEYS,
  PickerHost,
  type PickerKind,
  usePicker,
} from './pickers.js';
import { EditProjectDialog, ViewNameDialog } from './projectDialogs.js';
import { type ListState, newListState, TaskList } from './TaskList.js';
import { TaskPage } from './TaskPage.js';
import { type ConfirmRequest, TaskSettings } from './TaskSettings.js';
import { useTaskStore } from './useTaskStore.js';
import './tasks.css';

type Scope =
  | { kind: 'project'; id: string }
  | { kind: 'cycle'; number: number }
  | { kind: 'none' }
  | { kind: 'all' };
type Tab = 'overview' | 'all' | `view:${string}`;
type Route =
  | { view: 'list'; scope: Scope; tab: Tab }
  | { view: 'task'; id: string; scope: Scope; tab: Tab }
  | { view: 'settings'; scope: Scope; tab: Tab };
const START: Route = { view: 'list', scope: { kind: 'all' }, tab: 'all' };
/** Where each workspace's workbench was, so closing and reopening returns there. */
const remembered = new Map<string, { route: Route; lists: Map<string, ListState> }>();
const scopeKey = (scope: Scope) =>
  scope.kind === 'project'
    ? `p:${scope.id}`
    : scope.kind === 'cycle'
      ? `c:${scope.number}`
      : scope.kind;
const inScope = (scope: Scope, catalog: Catalog | null) => (t: TaskMeta) => {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'none':
      return t.project === null;
    case 'project':
      return t.project === scope.id;
    case 'cycle': {
      // A finished cycle keeps the tasks it had, even those moved on since.
      const s = catalog?.cycle(scope.number)?.summary;
      return s
        ? s.completed.includes(t.id) || s.cancelled.includes(t.id) || s.unfinished.includes(t.id)
        : t.cycle === scope.number;
    }
  }
};

interface Props {
  workspace: WorkspaceFolder;
  onClose(): void;
  /** Increments when the native "new task" command arrives. */
  newTaskRequest: number;
  /** A clicked note link; `seq` changes for every click. */
  openRequest: { seq: number; target: LinkTarget } | null;
  /** Leaves the workbench and opens a workspace note at a mention. */
  openNote(relativePath: string, match?: WorkspaceMatchPosition): void;
  /** The window sidebar's slot for the task navigation; without it the navigation stays
   * inside the workbench (sidebar hidden). */
  navHost?: HTMLElement | null;
  /** The open note (workspace-relative) and whether it has unsaved edits, for imports. */
  currentNote?: string | null;
  currentNoteDirty?: boolean;
}

export default function TasksWorkbench({
  workspace,
  onClose,
  newTaskRequest,
  openRequest,
  openNote,
  navHost = null,
  currentNote = null,
  currentNoteDirty = false,
}: Props) {
  const store = useTaskStore(workspace.id);
  const { catalog } = store;
  const memory = remembered.get(workspace.id);
  const [route, setRoute] = useState<Route>(memory?.route ?? START);
  const lists = useRef(memory?.lists ?? new Map<string, ListState>());
  useEffect(() => {
    remembered.set(workspace.id, { route, lists: lists.current });
    if (route.scope.kind === 'project' || route.scope.kind === 'none')
      rememberTaskProject(workspace.id, route.scope.kind === 'project' ? route.scope.id : null);
  }, [workspace.id, route]);
  const [editProject, setEditProject] = useState(false);
  const [viewDialog, setViewDialog] = useState<null | { mode: 'create' | 'rename' }>(null);
  const [projectMenu, setProjectMenu] = useState(false);
  const [, bump] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [active, setActiveState] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const order = useRef<string[]>([]);
  const [taskOrder, setTaskOrder] = useState<string[]>([]);
  const [propsOpen, setPropsOpen] = useState(true);
  const [createMore, setCreateMore] = useState(false);
  const [newTask, setNewTask] = useState<DraftState | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [confirm, setConfirm] = useState<null | ConfirmRequest>(null);
  const picker = usePicker();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [completing, setCompleting] = useState<number | null>(null);
  // A remembered project or cycle may be gone meanwhile.
  const scope: Scope =
    catalog &&
    ((route.scope.kind === 'project' && !catalog.project(route.scope.id)) ||
      (route.scope.kind === 'cycle' && (!catalog.cyclesOn || !catalog.cycle(route.scope.number))))
      ? { kind: 'all' }
      : route.scope;
  const viewId = route.tab.startsWith('view:') ? route.tab.slice(5) : null;
  const savedView = viewId && catalog ? catalog.view(viewId) : undefined;
  const key = `${scopeKey(scope)}:${route.tab}`;
  /** A view tab starts from its saved query and display. */
  const baseState = (): ListState => {
    const base = newListState();
    if (!savedView) return base;
    return {
      ...base,
      query: parseQuery(savedView.query),
      display: {
        layout: savedView.layout,
        groupBy: (savedView.groupBy as GroupBy) ?? DEFAULT_DISPLAY.groupBy,
        orderBy: (savedView.orderBy as OrderBy) ?? DEFAULT_DISPLAY.orderBy,
      },
    };
  };
  const listState = lists.current.get(key) ?? baseState();
  const setListState = (update: (s: ListState) => ListState) => {
    lists.current.set(key, update(lists.current.get(key) ?? baseState()));
    bump((n) => n + 1);
  };
  useLayoutEffect(() => root.current?.focus({ preventScroll: true }), []);
  // After the modal restores focus, so the workbench keeps the keyboard.
  const focusRoot = () =>
    requestAnimationFrame(() => {
      // Only reclaim focus that fell out of the workbench; never steal it from a field.
      const current = document.activeElement;
      if (!current || current === document.body || !root.current?.contains(current))
        root.current?.focus({ preventScroll: true });
    });
  const setActive = useCallback((id: string | null, scroll = true) => {
    setActiveState(id);
    if (scroll && id)
      requestAnimationFrame(() =>
        root.current
          ?.querySelector(`.task-row[data-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
  }, []);
  const go = (next: Route) => {
    setRoute(next);
    setProjectMenu(false);
    if (next.view !== 'task') {
      setSelection(new Set());
      focusRoot();
    }
  };
  const toList = (s: Scope, tab: Tab = 'all') => go({ view: 'list', scope: s, tab });
  const back = () => toList(scope, route.tab);
  const scoped = useMemo(
    () => (catalog ? catalog.tasks.filter(inScope(scope, catalog)) : []),
    [catalog, scope],
  );
  const openTask = (id: string, list = order.current) => {
    setTaskOrder(list);
    setActive(id, false);
    setRoute({ view: 'task', id, scope, tab: route.tab });
    focusRoot();
  };
  const defaultsFor = (catalog: Catalog, extra: Partial<TaskFields> = {}): DraftState => {
    const project =
      'project' in extra
        ? (extra.project ?? null)
        : scope.kind === 'project'
          ? scope.id
          : scope.kind === 'none'
            ? null
            : (catalog.snapshot.projects.find((p) => p.state === 'active')?.id ?? null);
    const cycle =
      'cycle' in extra
        ? (extra.cycle ?? null)
        : scope.kind === 'cycle' && catalog.cycle(scope.number)?.state !== 'completed'
          ? scope.number
          : null;
    const draft: DraftState = {
      title: '',
      project,
      status: extra.status ?? 'todo',
      priority: extra.priority ?? 0,
      type: extra.type ?? null,
      labels: extra.labels ?? [],
      bucket: extra.bucket ?? null,
      due: extra.due ?? null,
      cycle,
      description: '',
      parent: null,
      subtasks: [],
      template: null,
    };
    // A project's default template pre-fills; the column or group a task starts in still wins.
    const fallback = catalog.template(catalog.project(project)?.defaultTemplate);
    if (!fallback) return draft;
    const filled = applyTemplate(draft, fallback, catalog);
    return { ...filled, ...extra, cycle, project } as DraftState;
  };
  const createIn = (extra: Partial<TaskFields> = {}) =>
    catalog && setNewTask(defaultsFor(catalog, extra));
  // A note link opens its task or project once the snapshot is in.
  const handledLink = useRef(0);
  useEffect(() => {
    if (!openRequest || !catalog || handledLink.current === openRequest.seq) return;
    handledLink.current = openRequest.seq;
    const { kind, id } = openRequest.target;
    if (kind === 'task') {
      if (!catalog.task(id)) return notify('链接的任务已不存在', 'info');
      setTaskOrder([id]);
      setActive(id, false);
      setRoute({ view: 'task', id, scope: { kind: 'all' }, tab: 'all' });
    } else {
      if (!catalog.project(id)) return notify('链接的项目已不存在', 'info');
      setRoute({ view: 'list', scope: { kind: 'project', id }, tab: 'overview' });
    }
    focusRoot();
  });
  const lastRequest = useRef(newTaskRequest);
  useEffect(() => {
    if (newTaskRequest !== lastRequest.current && catalog) {
      lastRequest.current = newTaskRequest;
      setNewTask(defaultsFor(catalog));
    }
  });

  const setStatus = useCallback(
    (targets: TaskMeta[], status: string) => {
      if (!catalog) return;
      const closing = !['backlog', 'unstarted', 'started', 'review'].includes(
        catalog.status(status).category,
      );
      const ids = new Set(targets.map((t) => t.id));
      const openKids = closing
        ? targets.flatMap((t) =>
            catalog.children(t.id).filter((k) => catalog.isOpen(k) && !ids.has(k.id)),
          )
        : [];
      const apply = (list: TaskMeta[]) =>
        void store.patch(
          list.map((t) => t.id),
          { status },
          changeMessage('status', list, catalog),
        );
      if (!openKids.length) return apply(targets);
      setConfirm({
        title: '同时完成子任务？',
        body: `${targets.length === 1 ? `「${targets[0]?.title}」` : `${targets.length} 个任务`}还有 ${openKids.length} 个未完成的子任务，它们也会被标记为${catalog.status(status).name}。`,
        confirm: `全部${catalog.status(status).name}`,
        run: () => apply([...targets, ...openKids]),
      });
    },
    [catalog, store],
  );
  const commit = (kind: PickerKind, value: unknown, targets: TaskMeta[]) => {
    if (!catalog || !targets.length) return;
    if (kind === 'status') return setStatus(targets, String(value));
    if (kind === 'blockedBy' || kind === 'related') {
      const [t] = targets;
      if (!t) return;
      const id = String(value);
      const list = t[kind];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      void store.patch([t.id], { [kind]: next }, changeMessage(kind, [t], catalog));
      return;
    }
    if (kind === 'label') {
      const id = String(value);
      const all = targets.every((t) => t.labels.includes(id));
      // Tasks keep their other labels, so tasks with different label sets patch separately.
      const groups = new Map<string, TaskMeta[]>();
      for (const t of targets) {
        const next = all
          ? t.labels.filter((l) => l !== id)
          : t.labels.includes(id)
            ? t.labels
            : [...t.labels, id];
        const k = JSON.stringify(next);
        groups.set(k, [...(groups.get(k) ?? []), t]);
      }
      for (const [k, list] of groups)
        void store.patch(
          list.map((t) => t.id),
          { labels: JSON.parse(k) as string[] },
        );
      return;
    }
    const field = kind as keyof TaskFields;
    void store.patch(
      targets.map((t) => t.id),
      { [field]: value } as Partial<TaskFields>,
      kind === 'project'
        ? `已移动 ${targets.length} 个任务；移动后会取得新编号，旧编号仍可搜索`
        : changeMessage(kind, targets, catalog),
    );
  };
  const currentTargets = (): TaskMeta[] => {
    if (!catalog) return [];
    if (route.view === 'task') return [catalog.task(route.id)].filter((t): t is TaskMeta => !!t);
    const ids = selection.size ? [...selection] : active ? [active] : [];
    return ids.map((id) => catalog.task(id)).filter((t): t is TaskMeta => !!t);
  };
  const pick = (
    kind: PickerKind,
    targets = currentTargets(),
    anchorElement: Element | null = null,
  ) => {
    if (!targets.length) return;
    if (kind === 'project' && targets.every((t) => t.parent)) {
      notify('子任务跟随父任务的项目', 'info');
      return;
    }
    picker.open(kind, targets, anchorElement);
  };
  const remove = (task: TaskMeta) => {
    if (!catalog) return;
    const kids = catalog.children(task.id).length;
    setConfirm({
      title: `永久删除 ${catalog.humanId(task)}？`,
      body: `将同时删除${kids ? ` ${kids} 个子任务、` : ''}${task.comments} 条评论和全部动态，无法撤销。只想隐藏它时请使用归档。`,
      confirm: '永久删除',
      danger: true,
      run: async () => {
        const result = await store.run({
          kind: 'delete',
          ids: [task.id],
          revisions: [task.revision],
        });
        if (result?.applied.length) {
          notify(`${catalog.humanId(task)} 已删除`, 'success');
          back();
        }
      },
    });
  };
  /** Board drop: the column's field and order; closing a parent still asks first. */
  const move = (task: TaskMeta, set: Partial<TaskFields>) => {
    if (!catalog) return;
    if (set.status && set.status !== task.status) {
      const closing = ['completed', 'cancelled'].includes(catalog.status(set.status).category);
      if (closing && catalog.children(task.id).some((k) => catalog.isOpen(k)))
        return setStatus([task], set.status);
    }
    const field =
      'status' in set
        ? catalog.status(set.status ?? '').name
        : (catalog.bucket(set.bucket ?? null)?.name ?? '无队列');
    const changed = 'status' in set ? set.status !== task.status : set.bucket !== task.bucket;
    void store.patch(
      [task.id],
      set,
      changed ? `${catalog.humanId(task)} 已移到「${field}」` : undefined,
    );
  };
  const searchText = useCallback(
    (text: string) => taskApi.search(workspace.id, text),
    [workspace.id],
  );
  const updateProject = async (id: string, set: Record<string, unknown>, message?: string) => {
    const project = catalog?.project(id);
    if (!project) return false;
    const result = await store.run({ kind: 'updateProject', id, revision: project.revision, set });
    if (result && message) notify(message, 'success');
    return !!result;
  };
  const toggleSelected = (id: string, extend: boolean) => {
    setSelection((current) => {
      const next = new Set(current);
      if (extend && anchor.current) {
        const a = order.current.indexOf(anchor.current);
        const b = order.current.indexOf(id);
        if (a >= 0 && b >= 0)
          for (const x of order.current.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
      } else if (!next.delete(id)) next.add(id);
      anchor.current = id;
      return next;
    });
    setActive(id, false);
  };

  const keyDown = (event: React.KeyboardEvent | KeyboardEvent) => {
    const composing = 'nativeEvent' in event ? event.nativeEvent.isComposing : event.isComposing;
    if (composing || picker.target || newTask || newProject || confirm) return;
    const target = event.target as HTMLElement;
    // Dialogs and pickers are portaled layers with their own keys; React still bubbles to here.
    if (
      target.closest(
        '.task-layer, input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]',
      )
    )
      return;
    const mod = event.metaKey || event.ctrlKey;
    const k = event.key;
    if (mod && k.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      void store.undo();
      return;
    }
    if (mod || event.altKey) {
      if (route.view === 'list' && mod && k.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(new Set(order.current));
      }
      return;
    }
    const kind = PICKER_KEYS[k.toLowerCase()];
    if (
      kind &&
      (kind !== 'cycle' || catalog?.cyclesOn) &&
      route.view !== 'settings' &&
      route.tab !== 'overview'
    ) {
      event.preventDefault();
      pick(kind);
      return;
    }
    if (route.view === 'settings') {
      if (k === 'Escape') {
        event.preventDefault();
        back();
      }
      return;
    }
    if (route.view === 'task') {
      const i = taskOrder.indexOf(route.id);
      if (k === 'Escape') {
        event.preventDefault();
        back();
      } else if ((k === 'j' || k === 'k') && i >= 0) {
        const next = taskOrder[i + (k === 'j' ? 1 : -1)];
        if (next) openTask(next, taskOrder);
      } else if (k === 'c') {
        event.preventDefault();
        root.current?.querySelector<HTMLTextAreaElement>('.task-composer textarea')?.focus();
      } else if (k === 'e') {
        event.preventDefault();
        root.current?.querySelector<HTMLElement>('.task-title-edit')?.focus();
      }
      return;
    }
    const ids = order.current;
    const index = active ? ids.indexOf(active) : -1;
    if (k === 'j' || k === 'J' || k === 'ArrowDown' || k === 'k' || k === 'K' || k === 'ArrowUp') {
      event.preventDefault();
      const down = k.toLowerCase() === 'j' || k === 'ArrowDown';
      const next =
        ids[Math.max(0, Math.min(ids.length - 1, index < 0 ? 0 : index + (down ? 1 : -1)))];
      if (!next) return;
      if (event.shiftKey && active) {
        setSelection((s) => new Set([...s, active, next]));
        anchor.current ??= active;
      }
      setActive(next);
    } else if ((k === 'Enter' || k === 'o') && active) {
      event.preventDefault();
      openTask(active);
    } else if (k === 'x' && active) {
      event.preventDefault();
      toggleSelected(active, false);
    } else if (k === 'c') {
      event.preventDefault();
      createIn();
    } else if (k === '/' || event.code === 'Slash') {
      // With a Chinese input method on, the slash key reports '、'; the physical key is stable.
      event.preventDefault();
      search.current?.focus();
    } else if (k === 'Escape' && selection.size) {
      event.preventDefault();
      setSelection(new Set());
    }
  };

  // When a closed dialog leaves focus on <body>, keys still belong to the workbench.
  const keyHandler = useRef(keyDown);
  keyHandler.current = keyDown;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target !== document.body || event.defaultPrevented) return;
      keyHandler.current(event);
      // Unless the key itself moved focus, such as `/` into search.
      if (event.defaultPrevented && document.activeElement === document.body)
        root.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** In the window sidebar when there is one, so the pane keeps the card's full width. */
  const placeNav = (nav: React.ReactNode) =>
    navHost ? createPortal(<div className="task-sidebar">{nav}</div>, navHost) : nav;
  if (store.load.state === 'loading' || !catalog)
    return (
      <div className="task-workbench knowledge-surface" ref={root} tabIndex={-1}>
        {store.load.state === 'error' ? (
          <div className="task-empty">
            <h3>无法读取任务</h3>
            <p className="task-muted">{store.load.error}</p>
            <button type="button" className="task-btn" onClick={() => void store.refresh()}>
              重试
            </button>
          </div>
        ) : (
          <>
            {placeNav(
              <nav className="task-nav">
                <SkeletonRows rows={4} icon height={30} />
              </nav>,
            )}
            <main className="task-pane">
              <SkeletonRows rows={8} icon height={34} />
            </main>
          </>
        )}
      </div>
    );

  const snapshot = catalog.snapshot;
  const projects = snapshot.projects.filter((p) => p.state !== 'archived');
  const archived = snapshot.projects.filter((p) => p.state === 'archived');
  const unassigned = catalog.tasks.some((t) => t.project === null && !t.archived);
  const project = scope.kind === 'project' ? catalog.project(scope.id) : undefined;
  const cycle = scope.kind === 'cycle' ? catalog.cycle(scope.number) : undefined;
  const today = () => isoDay(new Date());
  const navItem = (
    s: Scope,
    label: React.ReactNode,
    count: number,
    icon: React.ReactNode,
    extra?: React.ReactNode,
  ) => (
    <button
      key={scopeKey(s)}
      type="button"
      className="task-nav-item"
      aria-current={route.view !== 'settings' && scopeKey(s) === scopeKey(scope)}
      onClick={() => toList(s)}
    >
      {icon}
      <span className="task-nav-label">{label}</span>
      {extra}
      <span className="task-count">{count}</span>
    </button>
  );
  const projectItem = (p: (typeof snapshot.projects)[number]) => {
    const all = catalog.tasks.filter((t) => t.project === p.id && !t.archived);
    const done = all.filter((t) => catalog.category(t) === 'completed').length;
    return navItem(
      { kind: 'project', id: p.id },
      p.name,
      catalog.openCount((t) => t.project === p.id),
      <TaskIcon name="folder" color={p.color} />,
      all.length > 0 && (
        <span className="task-nav-progress" title={`${done} / ${all.length} 已完成`}>
          <ProgressPie fraction={done / all.length} size={12} />
        </span>
      ),
    );
  };
  const selected = [...selection].map((id) => catalog.task(id)).filter((t): t is TaskMeta => !!t);
  const routeTask = route.view === 'task' ? catalog.task(route.id) : undefined;
  const tabs: { id: Tab; name: string; removable: boolean }[] = cycle
    ? [
        { id: 'overview', name: '概览', removable: false },
        { id: 'all', name: '任务', removable: false },
      ]
    : project
      ? [
          { id: 'overview', name: '概览', removable: false },
          { id: 'all', name: '全部任务', removable: false },
          ...project.views
            .map((v) => catalog.view(v))
            .filter((v) => !!v)
            .map((v) => ({ id: `view:${v.id}` as Tab, name: v.name, removable: true })),
        ]
      : scope.kind === 'all'
        ? [
            { id: 'all', name: '全部任务', removable: false },
            ...snapshot.views
              .filter((v) => !v.project)
              .map((v) => ({ id: `view:${v.id}` as Tab, name: v.name, removable: false })),
          ]
        : [];
  const addable = project
    ? snapshot.views.filter(
        (v) => (!v.project || v.project === project.id) && !project.views.includes(v.id),
      )
    : [];
  const currentQuery = serializeQuery(listState.query);
  const baseDisplay: Display = savedView
    ? {
        layout: savedView.layout,
        groupBy: savedView.groupBy as GroupBy,
        orderBy: savedView.orderBy as OrderBy,
      }
    : DEFAULT_DISPLAY;
  const dirty =
    currentQuery !== (savedView?.query ?? '') ||
    JSON.stringify(listState.display) !== JSON.stringify(baseDisplay);
  const viewSet = () => ({
    query: currentQuery,
    layout: listState.display.layout,
    groupBy: listState.display.groupBy,
    orderBy: listState.display.orderBy,
  });
  const saveNewView = async (name: string) => {
    const result = await store.run({
      kind: 'saveView',
      set: { name, ...viewSet(), project: project?.id ?? null },
    });
    const id = result?.created[0];
    if (!id) return false;
    if (project) await updateProject(project.id, { views: [...project.views, id] });
    lists.current.delete(`${scopeKey(scope)}:view:${id}`);
    toList(scope, `view:${id}`);
    notify(`已保存视图「${name}」`, 'success');
    return true;
  };
  const viewToolbar =
    route.tab === 'overview' ? null : savedView ? (
      <span className="task-view-actions">
        {dirty && (
          <>
            <button
              type="button"
              className="task-btn"
              onClick={() => void store.run({ kind: 'saveView', id: savedView.id, set: viewSet() })}
            >
              保存视图
            </button>
            <button
              type="button"
              className="task-icon-btn"
              title="还原为已保存的视图"
              aria-label="还原为已保存的视图"
              onClick={() => {
                lists.current.delete(key);
                bump((n) => n + 1);
              }}
            >
              <Icon name="history" />
            </button>
          </>
        )}
        <span className="task-menu-wrap">
          <button
            type="button"
            className="task-icon-btn"
            aria-label="视图操作"
            aria-expanded={projectMenu}
            onClick={() => setProjectMenu((v) => !v)}
          >
            <Icon name="more" />
          </button>
          {projectMenu && (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
              <div className="task-scrim clear" onMouseDown={() => setProjectMenu(false)} />
              <div className="task-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => (setProjectMenu(false), setViewDialog({ mode: 'create' }))}
                >
                  <Icon name="copy" />
                  <span className="task-option-label">另存为新视图…</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="task-option"
                  onClick={() => (setProjectMenu(false), setViewDialog({ mode: 'rename' }))}
                >
                  <Icon name="rename" />
                  <span className="task-option-label">重命名…</span>
                </button>
                <div className="task-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="task-option danger"
                  onClick={() => {
                    setProjectMenu(false);
                    setConfirm({
                      title: `删除视图「${savedView.name}」？`,
                      body: '视图会从所有项目的标签页中移除，任务本身不受影响。',
                      confirm: '删除视图',
                      danger: true,
                      run: async () => {
                        if (await store.run({ kind: 'deleteView', id: savedView.id }))
                          toList(scope, 'all');
                      },
                    });
                  }}
                >
                  <Icon name="delete" />
                  <span className="task-option-label">删除视图</span>
                </button>
              </div>
            </>
          )}
        </span>
      </span>
    ) : dirty && currentQuery ? (
      <button type="button" className="task-btn" onClick={() => setViewDialog({ mode: 'create' })}>
        保存为视图
      </button>
    ) : null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: single-key shortcuts for the whole workbench, ignored inside text fields.
    <div className="task-workbench knowledge-surface" ref={root} tabIndex={-1} onKeyDown={keyDown}>
      {placeNav(
        <nav className="task-nav" aria-label="项目">
          <div className="task-nav-head">
            <TaskIcon name="tasks" />
            <span>任务</span>
            <span className="task-spacer" />
            <button
              type="button"
              className="task-icon-btn"
              onClick={onClose}
              title="返回文档 ⌘⌥T"
              aria-label="关闭任务"
            >
              <Icon name="close" />
            </button>
          </div>
          {navItem(
            { kind: 'all' },
            '全部任务',
            catalog.openCount(() => true),
            <TaskIcon name="list" />,
          )}
          {catalog.cyclesOn && (
            <>
              <div className="task-nav-section">
                <span>迭代</span>
              </div>
              {[catalog.activeCycle, catalog.upcomingCycle]
                .filter((c) => c !== undefined)
                .map((c) =>
                  navItem(
                    { kind: 'cycle', number: c.number },
                    <>
                      {c.state === 'active' ? cycleTitle(c) : '下一迭代'}
                      <span className="task-nav-sub">{formatRange(c.start, c.end)}</span>
                    </>,
                    catalog.openCount((t) => t.cycle === c.number),
                    <TaskIcon name="cycle" />,
                  ),
                )}
              {snapshot.cycles
                .filter((c) => c.state === 'completed')
                .slice(-3)
                .reverse()
                .map((c) =>
                  navItem(
                    { kind: 'cycle', number: c.number },
                    <span className="task-muted">{cycleTitle(c)}</span>,
                    c.summary?.completed.length ?? 0,
                    <TaskIcon name="check" />,
                  ),
                )}
            </>
          )}
          <div className="task-nav-section">
            <span>项目</span>
            <button
              type="button"
              className="task-icon-btn"
              onClick={() => setNewProject(true)}
              title="新建项目"
              aria-label="新建项目"
            >
              <Icon name="add" />
            </button>
          </div>
          {projects.map(projectItem)}
          {!projects.length && (
            <button
              type="button"
              className="task-nav-item task-muted"
              onClick={() => setNewProject(true)}
            >
              <Icon name="add" />
              <span className="task-nav-label">新建第一个项目</span>
            </button>
          )}
          {unassigned &&
            navItem(
              { kind: 'none' },
              '无项目',
              catalog.openCount((t) => t.project === null),
              <TaskIcon name="blocked" />,
            )}
          {archived.length > 0 && (
            <>
              <div className="task-nav-section">
                <span>已归档</span>
              </div>
              {archived.map(projectItem)}
            </>
          )}
          <span className="task-spacer" />
          {snapshot.invalid.length > 0 && (
            <div
              className="task-nav-warning"
              title={snapshot.invalid.map((f) => `${f.path}：${f.error}`).join('\n')}
            >
              <Icon name="warning" />
              {snapshot.invalid.length} 个任务文件无法读取
            </div>
          )}
          <button
            type="button"
            className="task-nav-item"
            aria-current={route.view === 'settings'}
            onClick={() => go({ view: 'settings', scope, tab: route.tab })}
          >
            <TaskIcon name="gear" />
            <span className="task-nav-label">任务设置</span>
          </button>
        </nav>,
      )}
      <main className="task-pane">
        {route.view === 'task' && routeTask ? (
          <TaskPage
            workspaceId={workspace.id}
            catalog={catalog}
            store={store}
            task={routeTask}
            order={taskOrder}
            propsOpen={propsOpen}
            toggleProps={() => setPropsOpen((v) => !v)}
            back={back}
            open={(id) => openTask(id, taskOrder)}
            openNote={openNote}
            pick={(kind, el) => pick(kind, [routeTask], el)}
            setStatus={setStatus}
            remove={remove}
          />
        ) : route.view === 'settings' ? (
          <>
            <div className="task-pane-head">
              <h2 className="task-pane-title">
                <TaskIcon name="gear" />
                任务设置
              </h2>
              <span className="task-spacer" />
              <button
                type="button"
                className="task-icon-btn"
                onClick={back}
                title="返回 Esc"
                aria-label="返回"
              >
                <Icon name="close" />
              </button>
            </div>
            <TaskSettings
              catalog={catalog}
              run={(m) => store.run(m)}
              confirm={setConfirm}
              importContext={{ workspaceId: workspace.id, currentNote, currentNoteDirty }}
              guideActions={{
                newTask: () => createIn(),
                newProject: () => setNewProject(true),
                openAll: () => go({ view: 'list', scope: { kind: 'all' }, tab: 'all' }),
              }}
            />
          </>
        ) : (
          <>
            <div className="task-pane-head">
              <h2 className="task-pane-title">
                {project ? (
                  <>
                    <TaskIcon name="folder" color={project.color} />
                    {project.name}
                    <span className="task-key mono">{project.key}</span>
                    {project.state !== 'active' && (
                      <span className="task-badge">
                        {project.state === 'archived' ? '已归档' : '已完成'}
                      </span>
                    )}
                  </>
                ) : cycle ? (
                  <>
                    <TaskIcon name="cycle" />
                    {cycleTitle(cycle)}
                    <span className="task-key">{formatRange(cycle.start, cycle.end)}</span>
                    <span
                      className={
                        cycleTiming(cycle).kind === 'overrun' ? 'task-badge danger' : 'task-badge'
                      }
                    >
                      {cycle.state === 'upcoming' ? '即将开始' : timingText(cycleTiming(cycle))}
                    </span>
                  </>
                ) : scope.kind === 'none' ? (
                  '无项目'
                ) : (
                  '全部任务'
                )}
              </h2>
              {project && (
                <span className="task-menu-wrap">
                  <button
                    type="button"
                    className="task-icon-btn"
                    aria-label="项目操作"
                    aria-expanded={projectMenu && route.tab === 'overview'}
                    onClick={() => setProjectMenu((v) => !v)}
                  >
                    <Icon name="more" />
                  </button>
                  {projectMenu && !savedView && (
                    <>
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
                      <div className="task-scrim clear" onMouseDown={() => setProjectMenu(false)} />
                      <div className="task-menu task-menu-left" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="task-option"
                          onClick={() => (setProjectMenu(false), setEditProject(true))}
                        >
                          <Icon name="rename" />
                          <span className="task-option-label">编辑项目…</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="task-option"
                          onClick={() => {
                            setProjectMenu(false);
                            const done = project.state === 'completed';
                            void updateProject(
                              project.id,
                              { state: done ? 'active' : 'completed' },
                              done ? '项目已重新打开' : '项目已标记完成',
                            );
                          }}
                        >
                          <Icon name="check" />
                          <span className="task-option-label">
                            {project.state === 'completed' ? '重新打开项目' : '标记项目完成'}
                          </span>
                        </button>
                        <div className="task-menu-sep" />
                        <button
                          type="button"
                          role="menuitem"
                          className="task-option"
                          onClick={() => {
                            setProjectMenu(false);
                            if (project.state === 'archived') {
                              void updateProject(project.id, { state: 'active' }, '项目已恢复');
                              return;
                            }
                            const open = catalog.openCount((t) => t.project === project.id);
                            setConfirm({
                              title: `归档「${project.name}」？`,
                              body: `${open ? `项目里还有 ${open} 个未关闭的任务。` : ''}归档后项目移到侧栏底部，任务与历史都会保留，随时可以恢复。`,
                              confirm: '归档',
                              run: () =>
                                void updateProject(project.id, { state: 'archived' }, '项目已归档'),
                            });
                          }}
                        >
                          <Icon name={project.state === 'archived' ? 'restore' : 'archive'} />
                          <span className="task-option-label">
                            {project.state === 'archived' ? '恢复项目' : '归档项目…'}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </span>
              )}
              <span className="task-spacer" />
              {cycle?.state === 'active' && (
                <button
                  type="button"
                  className="task-btn"
                  onClick={() => setCompleting(cycle.number)}
                >
                  <TaskIcon name="check" />
                  完成迭代
                </button>
              )}
              {cycle?.state !== 'completed' && (
                <button type="button" className="task-btn primary" onClick={() => createIn()}>
                  <Icon name="add" />
                  新建任务 <kbd>C</kbd>
                </button>
              )}
            </div>
            {tabs.length > 1 && (
              <div className="task-tabs" role="tablist" aria-label="视图">
                {tabs.map((t) => (
                  <span key={t.id} className="task-tab-wrap">
                    <button
                      type="button"
                      role="tab"
                      className="task-tab"
                      aria-selected={route.tab === t.id}
                      onClick={() => toList(scope, t.id)}
                    >
                      {t.name}
                    </button>
                    {t.removable && project && (
                      <button
                        type="button"
                        className="task-tab-x"
                        aria-label={`从项目移除视图 ${t.name}`}
                        title="从项目移除"
                        onClick={() => {
                          const id = t.id.slice(5);
                          void updateProject(project.id, {
                            views: project.views.filter((v) => v !== id),
                          });
                          if (route.tab === t.id) toList(scope, 'all');
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </span>
                ))}
                {project && addable.length > 0 && (
                  <AddViewTab
                    views={addable}
                    add={async (id) => {
                      if (await updateProject(project.id, { views: [...project.views, id] }))
                        toList(scope, `view:${id}`);
                    }}
                  />
                )}
              </div>
            )}
            {route.tab === 'overview' && cycle ? (
              <CycleOverview
                catalog={catalog}
                cycle={cycle}
                openTask={(id) => openTask(id, [id])}
                showStatus={(status) => {
                  lists.current.set(`${scopeKey(scope)}:all`, {
                    ...newListState(),
                    query: {
                      chips: [{ key: 'status', negated: false, values: [status] }],
                      text: '',
                    },
                  });
                  toList(scope, 'all');
                }}
              />
            ) : route.tab === 'overview' && project ? (
              <ProjectOverview
                catalog={catalog}
                project={project}
                saveDescription={(description) => updateProject(project.id, { description })}
                showStatus={(status) => {
                  lists.current.set(`${scopeKey(scope)}:all`, {
                    ...newListState(),
                    query: {
                      chips: [{ key: 'status', negated: false, values: [status] }],
                      text: '',
                    },
                  });
                  toList(scope, 'all');
                }}
              />
            ) : (
              <TaskList
                key={key}
                catalog={catalog}
                tasks={scoped}
                project={scope.kind === 'project' ? scope.id : null}
                state={listState}
                setState={setListState}
                selection={selection}
                active={active}
                setActive={setActive}
                toggleSelected={toggleSelected}
                open={(id, list) => openTask(id, list)}
                pick={(kind, task, el) =>
                  pick(kind, selection.has(task.id) ? selected : [task], el)
                }
                createIn={createIn}
                onLayout={(ids) => {
                  order.current = ids;
                }}
                searchRef={search}
                move={move}
                searchText={searchText}
                toolbarExtra={viewToolbar}
              />
            )}
            {selected.length > 0 && (
              <div className="task-bulkbar" role="toolbar" aria-label="批量操作">
                <button
                  type="button"
                  className="task-icon-btn"
                  onClick={() => setSelection(new Set())}
                  aria-label="清除选择"
                >
                  <Icon name="close" />
                </button>
                <span className="task-bulk-count">已选 {selected.length}</span>
                <span className="task-bulk-sep" />
                {(
                  [
                    ['status', '状态', 'S'],
                    ['priority', '优先级', 'P'],
                    ['label', '标签', 'L'],
                    ['type', '类型', 'T'],
                    ['due', '到期', 'D'],
                    ...(selected.some((t) => !t.parent) ? [['project', '项目', 'M']] : []),
                    ['bucket', '队列', 'B'],
                    ...(catalog.cyclesOn ? [['cycle', '迭代', 'Y']] : []),
                  ] as [PickerKind, string, string][]
                ).map(([kind, label, hotkey]) => (
                  <button
                    type="button"
                    key={kind}
                    className="task-bulk-btn"
                    title={`${label}（${hotkey}）`}
                    onClick={(e) => pick(kind, selected, e.currentTarget)}
                  >
                    {kind === 'status' ? (
                      <StatusGlyph status={catalog.status('in-progress')} />
                    ) : null}
                    {label}
                  </button>
                ))}
                <span className="task-bulk-sep" />
                <button
                  type="button"
                  className="task-bulk-btn danger"
                  onClick={() => {
                    void store.patch(
                      selected.map((t) => t.id),
                      { archived: true },
                      `已归档 ${selected.length} 个任务`,
                    );
                    setSelection(new Set());
                  }}
                >
                  <Icon name="archive" />
                  归档
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {picker.target && (
        <PickerHost
          target={picker.target}
          catalog={catalog}
          close={() => {
            picker.close();
            focusRoot();
          }}
          commit={(kind, value) => {
            const fresh = picker.target?.tasks.map((t) => catalog.task(t.id) ?? t) ?? [];
            commit(kind, value, fresh);
            if (kind === 'blockedBy' || kind === 'related') {
              const id = String(value);
              picker.set(
                (t) =>
                  t && {
                    ...t,
                    tasks: fresh.map((x) => ({
                      ...x,
                      [kind]: x[kind].includes(id)
                        ? x[kind].filter((v) => v !== id)
                        : [...x[kind], id],
                    })),
                  },
              );
            }
            if (kind === 'label') {
              const id = String(value);
              const all = fresh.every((t) => t.labels.includes(id));
              picker.set(
                (t) =>
                  t && {
                    ...t,
                    tasks: fresh.map((x) => ({
                      ...x,
                      labels: all
                        ? x.labels.filter((l) => l !== id)
                        : [...new Set([...x.labels, id])],
                    })),
                  },
              );
            }
          }}
        />
      )}
      {newTask && (
        <NewTaskDialog
          catalog={catalog}
          initial={newTask}
          createMore={createMore}
          setCreateMore={setCreateMore}
          onClose={() => {
            setNewTask(null);
            focusRoot();
          }}
          submit={async (draft) => {
            const result = await store.run({
              kind: 'createTask',
              draft: {
                title: draft.title.trim(),
                project: draft.project,
                status: draft.status,
                priority: draft.priority,
                type: draft.type,
                labels: draft.labels,
                bucket: draft.bucket,
                due: draft.due,
                cycle: draft.cycle,
                description: draft.description,
                subtasks: draft.subtasks,
                ...(draft.parent ? { parent: draft.parent } : {}),
              },
            });
            const id = result?.applied[0];
            const created = id ?? null;
            if (created) {
              notify(`已创建任务`, 'success', {
                actions: [{ label: '打开', run: () => openTask(created) }],
              });
              setActive(created);
            }
            return !!created;
          }}
        />
      )}
      {newProject && (
        <NewProjectDialog
          catalog={catalog}
          onClose={() => {
            setNewProject(false);
            focusRoot();
          }}
          submit={async (name, projectKey) => {
            const result = await store.run({ kind: 'createProject', name, key: projectKey });
            const id = result?.created[0];
            if (id) toList({ kind: 'project', id }, 'all');
            return !!id;
          }}
        />
      )}
      {editProject && project && (
        <EditProjectDialog
          catalog={catalog}
          project={project}
          onClose={() => {
            setEditProject(false);
            focusRoot();
          }}
          submit={(changes) => updateProject(project.id, { ...changes }, '项目已更新')}
        />
      )}
      {viewDialog && (
        <ViewNameDialog
          title={viewDialog.mode === 'create' ? '保存为视图' : '重命名视图'}
          initial={viewDialog.mode === 'rename' ? (savedView?.name ?? '') : ''}
          onClose={() => {
            setViewDialog(null);
            focusRoot();
          }}
          submit={async (name) => {
            if (viewDialog.mode === 'create') return saveNewView(name);
            if (!savedView) return false;
            return !!(await store.run({ kind: 'saveView', id: savedView.id, set: { name } }));
          }}
        />
      )}
      {completing !== null && catalog.cycle(completing) && (
        <CompleteCycleDialog
          catalog={catalog}
          cycle={catalog.cycle(completing) as NonNullable<ReturnType<Catalog['cycle']>>}
          onClose={() => {
            setCompleting(null);
            focusRoot();
          }}
          submit={async (moves) => {
            const result = await store.run({
              kind: 'completeCycle',
              number: completing,
              today: today(),
              moves,
            });
            if (!result) return false;
            notify(`迭代 ${completing} 已完成`, 'success');
            toList({ kind: 'cycle', number: completing }, 'overview');
            return true;
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirm={confirm.confirm}
          danger={confirm.danger ?? false}
          onConfirm={confirm.run}
          onClose={() => {
            setConfirm(null);
            focusRoot();
          }}
        />
      )}
    </div>
  );
}

function AddViewTab({
  views,
  add,
}: {
  views: { id: string; name: string; query: string }[];
  add(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="task-menu-wrap">
      <button
        type="button"
        className="task-tab"
        aria-label="添加视图"
        title="添加视图"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="add" />
      </button>
      {open && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
          <div className="task-scrim clear" onMouseDown={() => setOpen(false)} />
          <div className="task-menu task-menu-left" role="menu">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                role="menuitem"
                className="task-option"
                onClick={() => {
                  setOpen(false);
                  add(v.id);
                }}
              >
                <span className="task-option-label">{v.name}</span>
                <span className="task-option-hint mono">{v.query}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
