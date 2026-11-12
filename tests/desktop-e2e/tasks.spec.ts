import { expect, type Page, test } from '@playwright/test';
import { installCreationMock } from './creation-test-util.js';
import { installMock, type TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';
import { installRecentMock } from './recent.helpers.js';
import { installRecoveryMock } from './recovery-test-util.js';

/** In-memory stand-in for the Rust task store: same snapshot shape and revision checks. */
function installTasksMock(options: { delay?: number; seed?: boolean }) {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  type Task = Record<string, unknown> & {
    id: string;
    revision: string;
    project: string | null;
    number: number;
    labels: string[];
  };
  const statuses = [
    ['backlog', '待规划', 'backlog'],
    ['todo', '待办', 'unstarted'],
    ['in-progress', '进行中', 'started'],
    ['in-review', '评审中', 'review'],
    ['done', '已完成', 'completed'],
    ['cancelled', '已取消', 'cancelled'],
  ].map(([id, name, category], order) => ({
    id,
    name,
    category,
    color: id === 'todo' ? 'todo' : id,
    builtin: true,
    order,
  }));
  const dict = (
    id: string,
    name: string,
    color: string,
    order: number,
    addLabels: string[] = [],
    setPriority = 0,
  ) => ({ id, name, color, order, addLabels, setPriority });
  const state = {
    generation: 1,
    initialized: false,
    tasks: [] as Task[],
    projects: [] as Record<string, unknown>[],
    comments: {} as Record<string, { id: string; created: string; body: string }[]>,
    bodies: {} as Record<string, string>,
    rev: 1,
    labels: [
      dict('bug', '缺陷', 'red', 1),
      dict('feature', '功能', 'violet', 2),
      dict('improvement', '改进', 'blue', 3),
    ],
    types: [
      dict('bug', '缺陷', 'red', 1, ['bug'], 2),
      dict('feature', '功能', 'violet', 2, ['feature']),
    ],
    buckets: [dict('now', '现在', 'orange', 1), dict('next', '下一步', 'blue', 2)],
    views: [
      {
        id: 'all-open',
        name: '全部未完成',
        icon: 'list',
        query: 'is:open',
        project: null,
        layout: 'list',
        groupBy: 'status',
        orderBy: 'manual',
        order: 1,
        revision: 'v1',
      },
    ] as Record<string, unknown>[],
    cycles: [] as Record<string, unknown>[],
    templates: [] as Record<string, unknown>[],
    settings: {
      unassignedKey: 'TASK',
      comments: true,
      cyclesEnabled: false,
      cycleWeeks: 2,
      cycleStartDay: 1,
    } as Record<string, unknown>,
  };
  Reflect.set(window, '__tasksMock', state);
  const DAY = 86_400_000;
  const day = (text: string) => Date.parse(`${text}T00:00:00Z`);
  const text = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const cycle = (number: number, start: number, cycleState: string, started: string | null) => ({
    number,
    name: null,
    start: text(start),
    end: text(start + (Number(state.settings.cycleWeeks) * 7 - 1) * DAY),
    state: cycleState,
    started,
    completedAt: null,
    summary: null,
    revision: `c${++state.rev}`,
  });
  /** Same placement rule as the store: the latest start day not after today. */
  const ensureCycles = (today: string) => {
    if (!state.cycles.some((c) => c.state === 'active')) {
      const t = day(today);
      const weekday = ((new Date(t).getUTCDay() + 6) % 7) + 1;
      const back = (weekday - Number(state.settings.cycleStartDay) + 7) % 7;
      state.cycles.push(cycle(state.cycles.length + 1, t - back * DAY, 'active', now()));
    }
    const active = state.cycles.find((c) => c.state === 'active') as Record<string, unknown>;
    if (!state.cycles.some((c) => c.number === Number(active.number) + 1))
      state.cycles.push(
        cycle(Number(active.number) + 1, day(String(active.end)) + DAY, 'upcoming', null),
      );
  };
  const now = () => new Date().toISOString();
  const touch = (t: Task) => {
    t.revision = `r${++state.rev}`;
    t.updated = now();
  };
  const make = (draft: Record<string, unknown>, extra: Partial<Task> = {}): Task => {
    const project = (draft.project as string | null) ?? null;
    const number =
      Math.max(0, ...state.tasks.filter((t) => t.project === project).map((t) => t.number)) + 1;
    const task: Task = {
      id: `t${Math.random().toString(36).slice(2, 10)}`,
      title: String(draft.title),
      project,
      number,
      status: (draft.status as string) ?? 'todo',
      priority: (draft.priority as number) ?? 0,
      type: (draft.type as string) ?? null,
      labels: (draft.labels as string[]) ?? [],
      bucket: (draft.bucket as string) ?? null,
      cycle: (draft.cycle as number) ?? null,
      cycleAdded: draft.cycle ? now() : null,
      parent: (draft.parent as string) ?? null,
      due: (draft.due as string) ?? null,
      created: now(),
      updated: now(),
      completed: null,
      previousIds: [],
      archived: false,
      order: state.tasks.length + 1,
      blockedBy: [],
      related: [],
      hasDescription: !!draft.description,
      comments: 0,
      revision: `r${++state.rev}`,
      ...extra,
    };
    state.tasks.push(task);
    state.bodies[task.id] = (draft.description as string) ?? '';
    return task;
  };
  if (options.seed) {
    state.initialized = true;
    state.projects.push({
      id: 'web',
      name: '官网改版',
      key: 'WEB',
      previousKeys: [],
      icon: 'folder',
      color: 'violet',
      state: 'active',
      order: 1,
      pinned: false,
      description: '',
      created: now(),
      statuses: null,
      labels: null,
      buckets: null,
      views: ['all-open'],
      defaultTemplate: null,
      revision: 'p1',
    });
    const parent = make({
      title: '重做首页首屏视觉',
      project: 'web',
      status: 'in-progress',
      priority: 1,
    });
    make({ title: '输出三套方案', project: 'web', parent: parent.id, status: 'done' });
    make({ title: '前端实现与动效', project: 'web', parent: parent.id });
    make(
      { title: '修复移动端导航栏错位', project: 'web', priority: 2, labels: ['bug'] },
      { id: 'navfix000001' },
    );
    make({ title: '接入访问统计', project: 'web', priority: 4 });
    make({ title: '编写发布公告', project: 'web', status: 'backlog' });
  }
  const snapshot = () => ({
    generation: state.generation,
    initialized: state.initialized,
    tasks: state.tasks.map((t) => ({ ...t, comments: state.comments[t.id]?.length ?? 0 })),
    projects: state.projects,
    statuses,
    labels: state.labels,
    types: state.types,
    buckets: state.buckets,
    views: state.views,
    cycles: state.cycles,
    templates: state.templates,
    settings: state.settings,
    invalid: [],
    truncated: false,
  });
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (!command.startsWith('tasks_')) return previous(command, args);
    host.__desktopMock.calls.push({ command, args });
    if (command === 'tasks_snapshot') {
      if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
      return snapshot();
    }
    if (command === 'tasks_search') {
      const terms = String(args.text).toLowerCase().split(/\s+/).filter(Boolean);
      return state.tasks
        .filter((t) =>
          terms.every(
            (w) =>
              String(t.title).toLowerCase().includes(w) ||
              (state.bodies[t.id] ?? '').toLowerCase().includes(w),
          ),
        )
        .map((t) => t.id);
    }
    if (command === 'tasks_mentions')
      return args.id === 'navfix000001'
        ? [
            {
              relativePath: 'Notes/Other.md',
              line: 3,
              column: 4,
              preview: '跟进 [WEB-3 修复移动端导航栏错位](task:navfix000001)',
            },
          ]
        : [];
    if (command === 'tasks_detail') {
      const id = String(args.id);
      const task = state.tasks.find((t) => t.id === id);
      return {
        id,
        body: state.bodies[id] ?? '',
        revision: task?.revision ?? '',
        comments: state.comments[id] ?? [],
        activity: [{ id: 'e1', at: task?.created, type: 'created' }],
      };
    }
    if (command.startsWith('tasks_import_')) {
      // Two issues: one open with an unknown label, one closed (left out unless asked).
      const source = [
        { title: '登录失败', ref: 'github:acme/web#1', closed: false, labels: ['bug', '新标签'] },
        { title: '旧需求', ref: 'github:acme/web#2', closed: true, labels: [] },
      ];
      const preview = (opts: Record<string, unknown> = {}) => {
        const rows = source.map((c, index) => {
          const done = state.tasks.find((t) => t.source === c.ref && !t.archived);
          const outcome = done ? 'skip' : c.closed && !opts.includeClosed ? 'skip' : 'new';
          return {
            index,
            title: c.title,
            sourceRef: c.ref,
            outcome,
            reason: done
              ? '已导入为 TASK-1'
              : outcome === 'skip'
                ? '已关闭（未选择导入已关闭项）'
                : null,
            status: c.closed ? '已完成' : '待办',
            project: '无项目',
            labels: c.labels.filter((l) => opts.createLabels || l === 'bug'),
            unknownLabels: opts.createLabels ? [] : c.labels.filter((l) => l !== 'bug'),
            parent: null,
          };
        });
        const count = (o: string) => rows.filter((r) => r.outcome === o).length;
        return {
          kind: 'github',
          label: 'issues.json',
          rows,
          new: count('new'),
          skip: count('skip'),
          problem: 0,
          projectsToCreate: [],
          labelsToCreate: opts.createLabels ? ['新标签'] : [],
          unknownLabels: opts.createLabels ? [] : ['新标签'],
          warnings: ['跳过 1 个 Pull Request'],
          includeClosedDefault: false,
        };
      };
      const held = state as unknown as { receipts?: Record<string, unknown>[] };
      held.receipts ??= [];
      const receipts = held.receipts;
      if (command === 'tasks_import_pick') {
        if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
        return { token: 'tok1', preview: preview() };
      }
      if (command === 'tasks_import_preview')
        return preview(args.options as Record<string, unknown>);
      if (command === 'tasks_import_receipts') {
        if (options.delay) await new Promise((r) => setTimeout(r, options.delay));
        return [...receipts].reverse();
      }
      if (command === 'tasks_import_apply') {
        const opts = args.options as Record<string, unknown>;
        const created = preview(opts)
          .rows.filter((r) => r.outcome === 'new')
          .map((r) => {
            const t = make({ title: r.title, project: opts.project ?? null }, {
              source: r.sourceRef,
            } as Partial<Task>);
            return t.id;
          });
        const receipt = {
          id: `imp${receipts.length + 1}`,
          at: '2026-11-11T08:30:00Z',
          kind: 'github',
          label: 'issues.json',
          tasks: created,
          projects: [],
          labels: [],
          undone: false,
        };
        receipts.push(receipt);
        state.generation++;
        host.__desktopMock.emitEvent('marklyra:tasks-changed', { generation: state.generation });
        return { created: created.length, receipt, linked: 0, unlinkedNotes: [] };
      }
      if (command === 'tasks_import_undo') {
        const r = receipts.find((x) => x.id === args.id);
        if (!r) throw '[not-found] 找不到导入记录';
        for (const t of state.tasks) if ((r.tasks as string[]).includes(t.id)) t.archived = true;
        r.undone = true;
        state.generation++;
        host.__desktopMock.emitEvent('marklyra:tasks-changed', { generation: state.generation });
        return (r.tasks as string[]).length;
      }
    }
    const m = args.mutation as Record<string, unknown>;
    state.initialized = true;
    const result = {
      generation: 0,
      applied: [] as string[],
      conflicts: [] as string[],
      created: [] as string[],
    };
    switch (m.kind) {
      case 'createProject': {
        const id = String(m.key).toLowerCase();
        state.projects.push({
          id,
          name: m.name,
          key: m.key,
          previousKeys: [],
          icon: 'folder',
          color: 'violet',
          state: 'active',
          order: state.projects.length + 1,
          pinned: false,
          description: '',
          created: now(),
          statuses: null,
          labels: null,
          buckets: null,
          views: [],
          defaultTemplate: null,
          revision: 'p',
        });
        result.created.push(id);
        break;
      }
      case 'createTask': {
        const draft = m.draft as Record<string, unknown>;
        const t = make(draft);
        result.applied.push(t.id);
        result.created.push(t.id);
        for (const title of (draft.subtasks as string[] | undefined) ?? [])
          result.created.push(
            make({ title, project: t.project, parent: t.id, cycle: draft.cycle ?? null }).id,
          );
        break;
      }
      case 'patch': {
        const ids = m.ids as string[];
        const revisions = m.revisions as string[];
        for (const [i, id] of ids.entries()) {
          const t = state.tasks.find((x) => x.id === id);
          if (!t || t.revision !== revisions[i]) {
            result.conflicts.push(id);
            continue;
          }
          const set = m.set as Record<string, unknown>;
          if ('cycle' in set && set.cycle !== t.cycle) t.cycleAdded = set.cycle ? now() : null;
          Object.assign(t, set);
          touch(t);
          result.applied.push(id);
        }
        break;
      }
      case 'comment': {
        const list = state.comments[String(m.id)] ?? [];
        state.comments[String(m.id)] = list;
        list.push({
          id: `c${state.rev++}`,
          created: now(),
          body: String(m.body),
        });
        result.applied.push(String(m.id));
        break;
      }
      case 'setDescription': {
        const t = state.tasks.find((x) => x.id === m.id);
        if (!t || t.revision !== m.revision) throw '[conflict] 任务已在其他地方被修改';
        state.bodies[t.id] = String(m.body);
        t.hasDescription = !!String(m.body).trim();
        touch(t);
        break;
      }
      case 'updateProject': {
        const p = state.projects.find((x) => x.id === m.id);
        if (p) {
          for (const [k, v] of Object.entries(m.set as Record<string, unknown>))
            p[k] = v === 'all' ? null : v;
          p.revision = `p${++state.rev}`;
          const allowed = p.statuses as string[] | null;
          if (allowed)
            for (const t of state.tasks)
              if (t.project === p.id && !allowed.includes(String(t.status))) {
                t.status = allowed.find((x) => x !== 'done') ?? 'todo';
                touch(t);
              }
        }
        break;
      }
      case 'saveView': {
        const set = m.set as Record<string, unknown>;
        const existing = state.views.find((v) => v.id === m.id);
        if (existing) Object.assign(existing, set, { revision: `v${++state.rev}` });
        else {
          const id = `view${state.rev++}`;
          state.views.push({
            id,
            icon: 'list',
            project: null,
            layout: 'list',
            groupBy: 'status',
            orderBy: 'manual',
            order: state.views.length + 1,
            revision: 'v',
            ...set,
          });
          result.created.push(id);
        }
        break;
      }
      case 'deleteView': {
        state.views = state.views.filter((v) => v.id !== m.id);
        for (const p of state.projects) p.views = (p.views as string[]).filter((v) => v !== m.id);
        break;
      }
      case 'upsertDictionary': {
        const list = state[m.dictionary as 'labels' | 'buckets' | 'types'] as ReturnType<
          typeof dict
        >[];
        const set = m.set as Record<string, unknown>;
        const existing = list.find((d) => d.id === m.id);
        if (existing) Object.assign(existing, set);
        else {
          const id =
            String(set.name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-') || `x${state.rev++}`;
          list.push({
            ...dict(id, String(set.name), String(set.color ?? 'gray'), list.length + 1),
          });
          result.created.push(id);
        }
        break;
      }
      case 'deleteDictionary': {
        const kind = m.dictionary as 'labels' | 'buckets';
        state[kind] = (state[kind] as ReturnType<typeof dict>[]).filter((d) => d.id !== m.id);
        for (const t of state.tasks) {
          if (kind === 'labels' && t.labels.includes(String(m.id))) {
            t.labels = t.labels.filter((l) => l !== m.id);
            touch(t);
          }
        }
        break;
      }
      case 'updateSettings': {
        const { today, ...set } = m.set as Record<string, unknown>;
        Object.assign(state.settings, set);
        if (state.settings.cyclesEnabled) ensureCycles(String(today));
        break;
      }
      case 'completeCycle': {
        const c = state.cycles.find((x) => x.number === m.number) as Record<string, unknown>;
        const moves = m.moves as Record<string, string>;
        const closed = (t: Task) => ['done', 'cancelled'].includes(String(t.status));
        const inCycle = state.tasks.filter((t) => t.cycle === c.number);
        const unfinished = inCycle.filter((t) => !closed(t)).map((t) => t.id);
        const started = String(c.started);
        c.summary = {
          planned: inCycle.filter((t) => !t.cycleAdded || String(t.cycleAdded) <= started).length,
          added: inCycle.filter((t) => t.cycleAdded && String(t.cycleAdded) > started).length,
          completed: inCycle.filter((t) => t.status === 'done').map((t) => t.id),
          cancelled: inCycle.filter((t) => t.status === 'cancelled').map((t) => t.id),
          unfinished,
        };
        c.state = 'completed';
        const next = state.cycles.find((x) => x.number === Number(c.number) + 1);
        if (next) Object.assign(next, { state: 'active', started: now() });
        for (const id of unfinished) {
          const t = state.tasks.find((x) => x.id === id) as Task;
          const toNext = moves[id] !== 'none';
          t.cycle = toNext ? Number(c.number) + 1 : null;
          t.cycleAdded = toNext ? String(next?.started) : null;
          touch(t);
          result.applied.push(id);
        }
        ensureCycles(String(m.today));
        break;
      }
      case 'saveTemplate': {
        const set = m.set as Record<string, unknown>;
        const existing = state.templates.find((t) => t.id === m.id);
        if (existing) Object.assign(existing, set, { revision: `t${++state.rev}` });
        else {
          const id = `tpl${state.rev++}`;
          state.templates.push({
            id,
            title: '',
            status: null,
            priority: 0,
            type: null,
            labels: [],
            bucket: null,
            subtasks: [],
            description: '',
            order: state.templates.length + 1,
            revision: 't',
            ...set,
          });
          result.created.push(id);
        }
        const t = state.templates.find((x) => x.id === (m.id ?? result.created[0]));
        if (t) {
          t.subtasks = ((t.subtasks as string[]) ?? []).map((x) => x.trim()).filter(Boolean);
          t.title = String(t.title ?? '').trim();
        }
        break;
      }
      case 'deleteTemplate': {
        state.templates = state.templates.filter((t) => t.id !== m.id);
        for (const p of state.projects) if (p.defaultTemplate === m.id) p.defaultTemplate = null;
        break;
      }
      case 'delete': {
        const ids = new Set(m.ids as string[]);
        state.tasks = state.tasks.filter((t) => !ids.has(t.id) && !ids.has(String(t.parent)));
        result.applied.push(...ids);
        break;
      }
    }
    state.generation++;
    result.generation = state.generation;
    // Like the host, every write is announced to all views of the workspace.
    const generation = state.generation;
    setTimeout(() => host.__desktopMock.emitEvent('marklyra:tasks-changed', { generation }));
    return result;
  };
}

async function setup(
  page: Page,
  options: { delay?: number; seed?: boolean } = { seed: true },
  source = '# 文档\n\n正文\n',
) {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installTasksMock, options);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, source);
  await emitLayoutMenu(page, 'open-folder');
  await expect(page.getByRole('button', { name: '任务', exact: true }).first()).toBeEnabled();
}
const workbench = (page: Page) => page.locator('.task-workbench');
const row = (page: Page, title: string) =>
  page.locator('.task-row:not(.ghost)', { hasText: title });

test('empty workspace: tasks open from the menu, a Chinese project gets a pinyin key, C creates a task', async ({
  page,
}) => {
  await setup(page, {});
  await emitLayoutMenu(page, 'view:tasks');
  await expect(workbench(page)).toBeVisible();
  await expect(workbench(page)).toBeFocused();
  // One empty state, not a column of empty status groups.
  await expect(page.locator('.task-group-head')).toHaveCount(0);
  await page.getByRole('button', { name: '新建项目' }).first().click();
  // Dialogs start in their text field, so typing works right away.
  await expect(page.getByLabel('项目名称')).toBeFocused();
  await page.keyboard.insertText('官网改版');
  await expect(page.locator('.task-form input.mono')).toHaveValue('GWGB');
  // Enter submits; the list must keep the keyboard afterwards.
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-pane-title')).toContainText('官网改版');
  await page.keyboard.press('c');
  await expect(page.getByLabel('任务标题')).toBeFocused();
  await page.keyboard.insertText('第一个任务');
  await page.keyboard.press('Enter');
  await expect(row(page, '第一个任务')).toContainText('GWGB-1');
  await emitLayoutMenu(page, 'view:tasks');
  await expect(workbench(page)).toHaveCount(0);
});

test('keyboard pickers change fields, groups follow the status, and ⌘Z undoes', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '接入访问统计').hover();
  await page.keyboard.press('s');
  await expect(page.locator('.task-picker-context')).toContainText('接入访问统计');
  await page.keyboard.press('3');
  const started = page.locator('.task-section', {
    has: page.locator('.task-group-head', { hasText: '进行中' }),
  });
  await expect(started.locator('.task-row', { hasText: '接入访问统计' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  const todo = page.locator('.task-section', {
    has: page.locator('.task-group-head', { hasText: '待办' }),
  });
  await expect(todo.locator('.task-row', { hasText: '接入访问统计' })).toBeVisible();
});

test('multi-select with X and Shift+J, bulk priority, picker header names the selection', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').hover();
  await page.keyboard.press('x');
  await page.keyboard.press('Shift+J');
  await expect(page.locator('.task-bulkbar')).toContainText('已选 2');
  await page.locator('.task-bulkbar').getByRole('button', { name: '优先级' }).click();
  await expect(page.getByRole('dialog', { name: '设置优先级…' })).toBeVisible();
  await page.keyboard.press('1');
  const mock = await page.evaluate(
    () =>
      (Reflect.get(window, '__tasksMock') as { tasks: { title: string; priority: number }[] })
        .tasks,
  );
  expect(
    mock
      .filter((t) => t.priority === 1)
      .map((t) => t.title)
      .sort(),
  ).toEqual(['修复移动端导航栏错位', '接入访问统计', '重做首页首屏视觉'].sort());
});

test('closing a parent with open subtasks asks first, with the safe choice focused', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '重做首页首屏视觉').click();
  await expect(page.locator('.task-title-edit')).toHaveText('重做首页首屏视觉');
  await page.keyboard.press('s');
  await page.keyboard.type('已完成');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '同时完成子任务？' });
  await expect(dialog).toContainText('1 个未完成的子任务');
  await expect(dialog.getByRole('button', { name: '返回' })).toBeFocused();
  await dialog.getByRole('button', { name: '全部已完成' }).click();
  const tasks = await page.evaluate(
    () =>
      (Reflect.get(window, '__tasksMock') as { tasks: { title: string; status: string }[] }).tasks,
  );
  expect(tasks.find((t) => t.title === '前端实现与动效')?.status).toBe('done');
  await page.keyboard.press('Escape');
  await expect(page.locator('.task-list')).toBeVisible();
});

test('query chips filter the list and Backspace edits the last chip', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await expect(row(page, '编写发布公告')).toBeVisible();
  await page.keyboard.press('/');
  await page.keyboard.type('priority:high ');
  await expect(page.locator('.task-chip')).toContainText('优先级');
  await expect(page.locator('.task-row:not(.ghost)')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.task-chip')).toHaveCount(0);
  await expect(page.getByLabel('搜索或筛选任务')).toHaveValue('priority:high');
});

test('the slash key focuses search even when a Chinese input method reports 、', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await expect(row(page, '编写发布公告')).toBeVisible();
  const press = (fromBody: boolean) =>
    page.evaluate((fromBody) => {
      if (fromBody) (document.activeElement as HTMLElement | null)?.blur();
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: '、', code: 'Slash', bubbles: true, cancelable: true }),
      );
    }, fromBody);
  const search = page.getByLabel('搜索或筛选任务');
  await press(false);
  await expect(search).toBeFocused();
  // A click on a row leaves focus on <body>; the forwarded key must not steal it back.
  await press(true);
  await expect(search).toBeFocused();
});

test('the covered editor ignores document commands and IME blocks opening tasks', async ({
  page,
}) => {
  await setup(page);
  const write = page.frameLocator('.marklyra-editor-frame').locator('#write');
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ni' })),
  );
  await page.waitForTimeout(80);
  await emitLayoutMenu(page, 'view:tasks');
  await expect(workbench(page)).toHaveCount(0);
  await write.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  await page.waitForTimeout(100);
  await emitLayoutMenu(page, 'view:tasks');
  await expect(workbench(page)).toBeVisible();
  const before = await layoutHistory(page);
  await emitLayoutMenu(page, 'format:strong');
  await emitLayoutMenu(page, 'undo');
  expect(await layoutHistory(page)).toBe(before);
  await expect(page.locator('.runtime-editor-mount')).toHaveAttribute('inert', '');
  await emitLayoutMenu(page, 'close-document');
  await expect(workbench(page)).toHaveCount(0);
});

test('a slow store shows the skeleton without loading text, then the list', async ({ page }) => {
  await setup(page, { seed: true, delay: 900 });
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  const skeleton = workbench(page).locator('.skeleton').first();
  await expect(skeleton).toBeVisible();
  await expect(workbench(page)).not.toContainText('加载');
  await expect(workbench(page)).not.toContainText('正在读取');
  await expect(row(page, '编写发布公告')).toBeVisible();
  await expect(workbench(page).locator('.skeleton')).toHaveCount(0);
});

test('an input method commits picker digits as text; undo retracts its own toast', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '接入访问统计').hover();
  await page.keyboard.press('p');
  // insertText produces input without a digit keydown, as with an active input method.
  await page.keyboard.insertText('2');
  await expect(page.getByRole('dialog', { name: '设置优先级…' })).toHaveCount(0);
  const toast = page.locator('.notice', { hasText: '的优先级已更新' });
  await expect(toast).toBeVisible();
  const tasks = () =>
    page.evaluate(
      () =>
        (Reflect.get(window, '__tasksMock') as { tasks: { title: string; priority: number }[] })
          .tasks,
    );
  expect((await tasks()).find((t) => t.title === '接入访问统计')?.priority).toBe(2);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toast).toHaveCount(0);
  await expect
    .poll(async () => (await tasks()).find((t) => t.title === '接入访问统计')?.priority)
    .toBe(4);
});

test('board: switch layout, drag a card to another status, the column follows', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.getByRole('button', { name: '显示选项' }).click();
  await page.getByRole('button', { name: '看板' }).click();
  await page.locator('.task-scrim').last().dispatchEvent('mousedown');
  const card = page.locator('.task-card', { hasText: '接入访问统计' });
  const target = page.locator('.task-column', {
    has: page.locator('.task-column-head', { hasText: '进行中' }),
  });
  await expect(card).toBeVisible();
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('missing geometry');
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(
      from.x + 40 + ((to.x + 60 - from.x - 40) * i) / 10,
      from.y + 20 + ((to.y + 60 - from.y - 20) * i) / 10,
    );
  await expect(page.locator('.task-card.dragging')).toBeVisible();
  await page.mouse.up();
  await expect(target.locator('.task-card', { hasText: '接入访问统计' })).toBeVisible();
  const tasks = await page.evaluate(
    () =>
      (Reflect.get(window, '__tasksMock') as { tasks: { title: string; status: string }[] }).tasks,
  );
  expect(tasks.find((t) => t.title === '接入访问统计')?.status).toBe('in-progress');
});

test('a search saves as a project view tab; overview links back to a filtered list', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '官网改版' }).click();
  await expect(page.getByRole('tab', { name: '全部未完成' })).toBeVisible();
  await page.getByRole('tab', { name: '全部任务' }).click();
  await page.keyboard.press('/');
  await page.keyboard.type('priority:urgent,high ');
  await page.getByRole('button', { name: '保存为视图' }).click();
  await expect(page.getByLabel('名称')).toBeFocused();
  await page.keyboard.insertText('紧急事项');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: '紧急事项' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.task-chip')).toContainText('优先级');
  await page.getByRole('tab', { name: '概览' }).click();
  await expect(page.locator('.task-overview-progress')).toContainText('/ 6 已完成');
  await page.locator('.task-overview-status', { hasText: '进行中' }).click();
  await expect(page.getByRole('tab', { name: '全部任务' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.task-chip')).toContainText('进行中');
});

test('settings add and delete a label with its consequence; project limits narrow the status picker', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '标签' }).click();
  await page.getByLabel('添加标签').fill('design');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '删除标签 design' })).toBeVisible();
  await page.getByRole('button', { name: '删除标签 缺陷' }).click();
  await expect(page.getByRole('dialog', { name: '删除标签「缺陷」？' })).toContainText(
    '会从 1 个任务上移除「缺陷」',
  );
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '删除标签 缺陷' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.task-nav-item', { hasText: '官网改版' }).click();
  await page.getByRole('button', { name: '项目操作' }).click();
  await page.getByRole('menuitem', { name: '编辑项目…' }).click();
  for (const name of ['待规划', '评审中', '已取消'])
    await page.locator('.task-limit').first().getByLabel(name).uncheck();
  await expect(page.locator('.task-limit').first()).toContainText('个任务会移到最接近的可用状态');
  await page.getByRole('button', { name: '保存' }).click();
  await row(page, '修复移动端导航栏错位').hover();
  await page.keyboard.press('s');
  await expect(page.locator('.task-picker .task-option')).toHaveCount(3);
});

test('reopening the workbench returns to the same project and tab; description text is searchable', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const m = Reflect.get(window, '__tasksMock') as {
      tasks: { id: string; title: string }[];
      bodies: Record<string, string>;
    };
    const t = m.tasks.find((x) => x.title === '编写发布公告');
    if (t) m.bodies[t.id] = '包含 Stripe 结账说明';
  });
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '官网改版' }).click();
  await page.getByRole('tab', { name: '全部任务' }).click();
  await page.keyboard.press('/');
  await page.keyboard.type('stripe');
  await expect(page.locator('.task-row:not(.ghost)')).toHaveCount(1);
  await expect(row(page, '编写发布公告')).toBeVisible();
  await emitLayoutMenu(page, 'view:tasks');
  await expect(workbench(page)).toHaveCount(0);
  await emitLayoutMenu(page, 'view:tasks');
  await expect(page.locator('.task-pane-title')).toContainText('官网改版');
  await expect(page.getByLabel('搜索或筛选任务')).toHaveValue('stripe');
});

test('cycles: enable, add work with Y, complete with a per-task destination, summary stays', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '迭代' }).click();
  await page.getByRole('switch', { name: '使用迭代' }).click();
  await expect(page.getByRole('group', { name: '迭代长度' })).toBeVisible();
  await page.getByRole('button', { name: '返回' }).click();
  const nav = page.locator('.task-nav');
  await expect(nav.locator('.task-nav-item', { hasText: '迭代 1' })).toBeVisible();
  await expect(nav.locator('.task-nav-item', { hasText: '下一迭代' })).toBeVisible();

  for (const title of ['修复移动端导航栏错位', '接入访问统计']) {
    await row(page, title).hover();
    await page.keyboard.press('y');
    await expect(page.locator('.task-picker .task-option')).toHaveCount(3);
    await page.locator('.task-picker .task-option', { hasText: '当前迭代' }).click();
  }
  await row(page, '接入访问统计').hover();
  await page.keyboard.press('s');
  await page.locator('.task-picker .task-option', { hasText: '已完成' }).click();

  await nav.locator('.task-nav-item', { hasText: '迭代 1' }).click();
  await expect(page.locator('.task-pane-title')).toContainText('迭代 1');
  await expect(page.locator('.task-row:not(.ghost)')).toHaveCount(2);
  await page.getByRole('tab', { name: '概览' }).click();
  await expect(page.locator('.task-overview-progress')).toContainText('1 / 2 已完成');

  await page.locator('.task-pane-head').getByRole('button', { name: '完成迭代' }).click();
  const dialog = page.getByRole('dialog', { name: '完成迭代 1' });
  await expect(dialog.locator('.task-cycle-moves li')).toHaveCount(1);
  await dialog
    .getByRole('group', { name: '修复移动端导航栏错位 的去向' })
    .getByRole('button', { name: '移出迭代' })
    .click();
  await dialog.getByRole('button', { name: '完成迭代' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(nav.locator('.task-nav-item', { hasText: '迭代 2' })).toBeVisible();
  const unfinished = page.getByRole('region', { name: '未完成' });
  await expect(unfinished).toContainText('修复移动端导航栏错位');
  await expect(unfinished).toContainText('已移出迭代');
  await expect(
    page.locator('.task-pane-head').getByRole('button', { name: '完成迭代' }),
  ).toHaveCount(0);
  const moved = await page.evaluate(() => {
    const mock = Reflect.get(window, '__tasksMock') as {
      tasks: { title: string; cycle: number | null }[];
    };
    return mock.tasks.find((t) => t.title === '修复移动端导航栏错位')?.cycle;
  });
  expect(moved).toBeNull();
});

test('templates: a project default pre-fills new tasks, subtasks can be dropped before creating', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '模板' }).click();
  await page.getByLabel('新建模板').fill('缺陷报告');
  await page.keyboard.press('Enter');
  await page.getByLabel('任务标题').fill('[缺陷] ');
  await page.getByLabel('类型').selectOption({ label: '缺陷' });
  await page.getByLabel('子任务，每行一个').fill('复现\n修复');
  await page.getByLabel('描述（Markdown）').fill('## 步骤');
  await page.locator('.task-settings-page h2').click();
  await expect(page.locator('.task-template-name')).toContainText('2 个子任务');
  await page.getByRole('button', { name: '返回' }).click();

  await page.locator('.task-nav-item', { hasText: '官网改版' }).click();
  await page.getByRole('button', { name: '项目操作' }).click();
  await page.getByRole('menuitem', { name: '编辑项目…' }).click();
  await page.getByLabel('默认模板').selectOption({ label: '缺陷报告' });
  await page.getByRole('button', { name: '保存' }).click();

  await workbench(page).focus();
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: '新建任务' });
  await expect(dialog.getByLabel('任务标题')).toHaveValue('[缺陷]');
  await expect(dialog.getByLabel('描述')).toHaveValue('## 步骤');
  await expect(dialog.locator('[data-picker="template"]')).toContainText('缺陷报告');
  await expect(dialog.locator('[data-picker="type"]')).toContainText('缺陷');
  await expect(dialog.getByRole('list', { name: '将同时创建的子任务' }).locator('li')).toHaveCount(
    2,
  );
  // The caret starts after the template's title.
  await page.keyboard.type(' 登录页白屏');
  await dialog.getByRole('button', { name: '不创建子任务 修复' }).click();
  await expect(dialog.getByLabel('任务标题')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, '[缺陷] 登录页白屏')).toBeVisible();
  const draft = await page.evaluate(() => {
    const calls = (
      window as unknown as {
        __desktopMock: {
          calls: { command: string; args: { mutation?: Record<string, unknown> } }[];
        };
      }
    ).__desktopMock.calls;
    return calls.filter((c) => c.args.mutation?.kind === 'createTask').at(-1)?.args.mutation
      ?.draft as Record<string, unknown>;
  });
  expect(draft).toMatchObject({ type: 'bug', subtasks: ['复现'], priority: 2 });
  expect(draft.labels).toContain('bug');
  await expect(row(page, '复现')).toBeVisible();
});

test('a narrow task page still edits every property from the chip strip', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '接入访问统计').click();
  const strip = page.locator('.task-prop-strip');
  await expect(strip).toBeVisible();
  await expect(page.locator('.task-prop-card')).toBeHidden();
  await strip.getByRole('button', { name: '类型：类型' }).click();
  await page.locator('.task-picker .task-option', { hasText: '缺陷' }).click();
  await expect(strip.getByRole('button', { name: '类型：缺陷' })).toBeVisible();
});

const editorFrame = (page: Page) => page.frameLocator('.runtime-area .marklyra-editor-frame');

test('a task link in a note renders as a chip, ⌘-click opens the task, the outline lists it', async ({
  page,
}) => {
  await setup(
    page,
    { seed: true },
    '# 周会\n\n跟进 [WEB-3 修复移动端导航栏错位](task:navfix000001) 本周完成\n',
  );
  const link = editorFrame(page).locator('#write a[href="task:navfix000001"]');
  await expect(link).toHaveText('WEB-3 修复移动端导航栏错位');
  // Styled as a chip: padded with a tinted background.
  expect(
    await link.evaluate((a) => {
      const style = getComputedStyle(a);
      return parseFloat(style.paddingLeft) > 0 && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    }),
  ).toBe(true);
  // A plain click stays in the editor.
  await link.click();
  await expect(workbench(page)).toHaveCount(0);
  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('.task-title-edit')).toHaveText('修复移动端导航栏错位');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭任务' }).click();
  await expect(workbench(page)).toHaveCount(0);

  await emitLayoutMenu(page, 'view:outline');
  const panel = page.getByRole('region', { name: '本文任务' });
  await expect(panel).toContainText('修复移动端导航栏错位');
  await panel.getByRole('button', { name: /修复移动端导航栏错位/ }).click();
  await expect(page.locator('.task-title-edit')).toHaveText('修复移动端导航栏错位');
});

test('task page: relations add and remove from either side, mentions open the note', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  await page.getByRole('button', { name: '添加阻塞任务' }).click();
  await page.locator('.task-picker .task-option', { hasText: '接入访问统计' }).click();
  await page.keyboard.press('Escape');
  const relations = page.getByRole('region', { name: '关系' });
  await expect(relations.locator('.task-relation')).toContainText(['被阻塞于']);
  // The blocker shows the reverse side and can drop it from there.
  await relations.getByRole('button', { name: '接入访问统计' }).click();
  await expect(page.locator('.task-title-edit')).toHaveText('接入访问统计');
  await expect(relations.locator('.task-relation')).toContainText(['阻塞']);
  await relations.getByRole('button', { name: /^移除与 WEB-\d+ 的关系$/ }).click();
  await expect(relations.locator('.task-relation')).toHaveCount(0);

  await page
    .getByRole('button', { name: '返回' })
    .first()
    .click()
    .catch(() => {});
  await row(page, '修复移动端导航栏错位').click();
  const mentions = page.getByRole('region', { name: '提及' });
  await expect(mentions).toContainText('Notes/Other');
  // The preview reads as text, not as Markdown link syntax.
  await expect(mentions).toContainText('跟进 WEB-3 修复移动端导航栏错位');
  await expect(mentions).not.toContainText('task:');
  await mentions.getByRole('button').first().click();
  await expect(workbench(page)).toHaveCount(0);
  await expect(editorFrame(page).locator('#write')).toContainText('Other document');
});

test('selected note text turns into a task and a link in place', async ({ page }) => {
  await setup(page, { seed: true }, '# 周会\n\n写周报给团队\n');
  await editorFrame(page)
    .locator('#write > p')
    .first()
    .evaluate((paragraph) => {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text) throw Error('no text');
      paragraph.closest<HTMLElement>('#write')?.focus();
      getSelection()?.setBaseAndExtent(text, 0, text, 3);
      document.dispatchEvent(new Event('selectionchange'));
    });
  await expect
    .poll(() =>
      editorFrame(page)
        .locator('#write')
        .evaluate(() => getSelection()?.toString()),
    )
    .toBe('写周报');
  await page.waitForTimeout(300);
  await emitLayoutMenu(page, 'task:convert');
  const link = editorFrame(page).locator('#write a[href^="task:"]');
  await expect(link).toHaveText('TASK-1 写周报');
  await expect(editorFrame(page).locator('#write > p').first()).toContainText('给团队');
  const created = await page.evaluate(() => {
    const calls = (window as unknown as TestWindow).__desktopMock.calls;
    return calls
      .filter((c) => (c.args as { mutation?: { kind: string } }).mutation?.kind === 'createTask')
      .at(-1)?.args;
  });
  expect(created).toMatchObject({ mutation: { draft: { title: '写周报', project: null } } });
});

test('task navigation takes over the sidebar, the pane keeps rounded corners, fields focus without a ring', async ({
  page,
}) => {
  await setup(page);
  const sidebar = page.locator('aside.sidebar');
  await expect(sidebar.locator('.workspace-sidebar, .sidebar-panel').first()).toBeVisible();
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  // The navigation lives in the sidebar; the file tree is hidden underneath.
  await expect(sidebar.locator('.task-sidebar .task-nav')).toBeVisible();
  await expect(sidebar.locator('.sidebar-panel')).toBeHidden();
  await expect(workbench(page).locator('> .task-nav')).toHaveCount(0);
  // The pane clips to the card's rounded corners.
  const radius = await workbench(page).evaluate((el) =>
    parseFloat(getComputedStyle(el).borderTopLeftRadius),
  );
  expect(radius).toBeGreaterThan(0);
  // Text fields show focus with their border and glow, never an outline ring.
  const search = page.getByLabel('搜索或筛选任务');
  await search.focus();
  await page.keyboard.press('a');
  expect(await search.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  const box = page.locator('.task-search');
  expect(await box.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.keyboard.press('Escape');
  // Buttons keep the keyboard ring. (WebKit on macOS tabs only between text fields.)
  if (test.info().project.name !== 'webkit') {
    await sidebar.locator('.task-nav-item', { hasText: '全部任务' }).focus();
    await page.keyboard.press('Tab');
    const focusedOutline = await page.evaluate(() =>
      document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : 'none',
    );
    expect(focusedOutline).toBe('solid');
  }
  // With the sidebar hidden, the navigation returns inside the workbench.
  await emitLayoutMenu(page, 'view:sidebar');
  await expect(workbench(page).locator('.task-nav')).toBeVisible();
  await emitLayoutMenu(page, 'view:sidebar');
  await expect(sidebar.locator('.task-sidebar .task-nav')).toBeVisible();
  // Closing tasks brings the file tree back.
  await sidebar.getByRole('button', { name: '关闭任务' }).click();
  await expect(sidebar.locator('.sidebar-panel')).toBeVisible();
  await expect(sidebar.locator('.task-sidebar')).toHaveCount(0);
});

test('import: preview counts follow the options, importing twice skips, undo archives with a confirmation', async ({
  page,
}) => {
  await setup(page, {});
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '导入' }).click();
  await expect(page.locator('.task-settings-empty')).toHaveText('还没有导入');
  await page
    .locator('.task-import-source', { hasText: 'GitHub Issues' })
    .getByRole('button')
    .last()
    .click();
  const dialog = page.getByRole('dialog', { name: '导入GitHub Issues' });
  await expect(dialog).toBeVisible();
  const tab = (name: string) => dialog.getByRole('tab', { name });
  await expect(tab('新建')).toContainText('1');
  await expect(tab('新建')).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.locator('.task-import-rows li')).toHaveCount(1);
  // Closed issues are left out until asked for; the count and the button follow.
  await dialog.getByRole('switch', { name: '包含已关闭' }).click();
  await expect(tab('新建')).toContainText('2');
  await expect(dialog.getByRole('button', { name: '导入 2 个任务' })).toBeEnabled();
  await dialog.getByRole('switch', { name: '新建未知标签' }).click();
  await expect(dialog.locator('.task-import-rows li').first()).toContainText('新标签');
  // The select is a text field: focus shows on its border, not a square ring.
  await dialog.locator('select').focus();
  await expect(dialog.locator('select')).toHaveCSS('outline-style', 'none');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.notice-text', { hasText: '已导入 2 个任务' })).toBeVisible();
  await expect(page.locator('.task-import-history .task-settings-row')).toHaveCount(1);
  const apply = await page.evaluate(
    () =>
      (window as unknown as TestWindow).__desktopMock.calls.find(
        (c) => c.command === 'tasks_import_apply',
      )?.args,
  );
  expect(apply).toMatchObject({
    token: 'tok1',
    options: { project: null, createLabels: true, includeClosed: true },
    skipNotes: [],
  });

  // The same file again: nothing new.
  await page
    .locator('.task-import-source', { hasText: 'GitHub Issues' })
    .getByRole('button')
    .last()
    .click();
  await expect(dialog.getByRole('button', { name: '没有可导入的任务' })).toBeDisabled();
  await expect(tab('跳过')).toContainText('2');
  await page.keyboard.press('Escape');

  await page.locator('.task-import-history').getByRole('button', { name: '撤销' }).click();
  const confirm = page.getByRole('dialog', { name: '撤销这次导入？' });
  await expect(confirm).toContainText('归档这次导入新建的 2 个任务');
  await confirm.getByRole('button', { name: '撤销导入' }).click();
  await expect(page.locator('.task-import-history')).toContainText('已撤销');
});

test('import history waits behind a skeleton without loading text', async ({ page }) => {
  await setup(page, { delay: 900 });
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '导入' }).click();
  const skeleton = page.locator('.task-import-history [role="status"]');
  await expect(skeleton).toBeVisible();
  await expect(page.locator('.task-import-history')).not.toContainText('加载');
  await expect(page.locator('.task-settings-empty')).toHaveText('还没有导入');
  await expect(skeleton).toHaveCount(0);
});

test('description edits in the note editor: native format reaches it, the document stays, leaving saves', async ({
  page,
}) => {
  await setup(page);
  const documentBefore = await editorFrame(page).locator('#write').innerText();
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  const frame = page.locator('iframe[title="任务描述"]');
  const description = page.frameLocator('iframe[title="任务描述"]').locator('#write');
  const setDescriptions = () =>
    page.evaluate(
      () =>
        (window as unknown as TestWindow).__desktopMock.calls.filter(
          (c) =>
            c.command === 'tasks_mutate' &&
            (c.args.mutation as { kind: string }).kind === 'setDescription',
        ).length,
    );

  // Opening and leaving without a change writes nothing.
  await page.getByRole('button', { name: '编辑描述' }).click();
  await expect(frame).toBeVisible();
  await expect(page.locator('.task-desc-editor [role="status"]')).toHaveCount(0);
  await page.locator('.task-title-edit').click();
  await expect(frame).toBeHidden();
  expect(await setDescriptions()).toBe(0);

  await page.getByRole('button', { name: '编辑描述' }).click();
  await expect(frame).toBeVisible();
  await description.click();
  await page.keyboard.type('先修 iOS');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  // ⌘B arrives as a native menu action; with the description focused it formats there.
  await emitLayoutMenu(page, 'format:strong');
  await expect(description.locator('strong')).toHaveText('iOS');
  expect(await editorFrame(page).locator('#write').innerText()).toBe(documentBefore);

  // ⌘S saves and keeps editing; leaving saves the rest.
  await emitLayoutMenu(page, 'save');
  await expect.poll(setDescriptions).toBe(1);
  await expect(frame).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('！');
  await page.locator('.task-title-edit').click();
  await expect(frame).toBeHidden();
  await expect.poll(setDescriptions).toBe(2);
  const body = await page.evaluate(() => {
    const last = (window as unknown as TestWindow).__desktopMock.calls
      .filter((c) => c.command === 'tasks_mutate')
      .at(-1);
    return (last?.args.mutation as { body?: string } | undefined)?.body ?? '';
  });
  expect(body).toContain('先修 **iOS！**');
  await expect(page.locator('.task-desc')).toContainText('先修 iOS！');
});

test('description undo stays in the description; commands wait while an input method composes', async ({
  page,
}) => {
  await setup(page);
  const documentBefore = await editorFrame(page).locator('#write').innerText();
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  await page.getByRole('button', { name: '编辑描述' }).click();
  const description = page.frameLocator('iframe[title="任务描述"]').locator('#write');
  await description.click();
  await page.keyboard.type('临时文字');
  await expect(description).toContainText('临时文字');
  await emitLayoutMenu(page, 'undo');
  await expect(description).not.toContainText('临时文字');
  expect(await editorFrame(page).locator('#write').innerText()).toBe(documentBefore);

  await page.keyboard.type('组合');
  await description.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })),
  );
  await emitLayoutMenu(page, 'format:strong');
  await expect(page.locator('.notice-text', { hasText: '请先完成输入法候选' })).toBeVisible();
  await expect(description.locator('strong')).toHaveCount(0);
  await description.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })),
  );
  // The workbench list keeps its own undo: leaving saves, and its ⌘Z is untouched by the frame's.
  await page.locator('.task-title-edit').click();
  await expect(page.locator('.task-desc')).toContainText('组合');
});

test('one description editor serves every task page, kept across the list and other tasks', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  const frame = page.locator('iframe[title="任务描述"]');
  await page.getByRole('button', { name: '编辑描述' }).click();
  await expect(frame).toBeVisible();
  await frame.evaluate((element) => {
    element.dataset.probe = 'first';
  });
  await page.locator('.task-title-edit').click();
  await expect(frame).toBeHidden();

  // Back to the list and into another task: the same frame, not a new one.
  await page.getByRole('button', { name: '返回' }).first().click();
  await expect(page.locator('.task-page-keep')).toBeHidden();
  await row(page, '编写发布公告').click();
  await page.getByRole('button', { name: '编辑描述' }).click();
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('data-probe', 'first');
  const description = page.frameLocator('iframe[title="任务描述"]').locator('#write');
  await description.click();
  await page.keyboard.type('第二个任务');
  await page.getByRole('button', { name: '返回' }).first().click();
  // Leaving the page while editing still saves what was typed.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const m = Reflect.get(window, '__tasksMock') as {
          tasks: { id: string; title: string }[];
          bodies: Record<string, string>;
        };
        const t = m.tasks.find((x) => x.title === '编写发布公告');
        return t ? (m.bodies[t.id] ?? '') : '';
      }),
    )
    .toContain('第二个任务');
});

test('the description grows with its text instead of scrolling inside a box', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  await page.getByRole('button', { name: '编辑描述' }).click();
  const frame = page.locator('iframe[title="任务描述"]');
  await expect(frame).toBeVisible();
  const description = page.frameLocator('iframe[title="任务描述"]').locator('#write');
  await description.click();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  const before = (await frame.boundingBox())?.height ?? 0;
  for (let line = 1; line <= 12; line++) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(`第 ${line} 行`);
  }
  await expect
    .poll(async () => (await frame.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before + 200);
  // Everything typed fits: the frame itself never needs to scroll.
  const content = page.frameLocator('iframe[title="任务描述"]').locator('content');
  await expect
    .poll(() => content.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeLessThanOrEqual(1);
  // The slash menu opens below the caret in full, the frame making room for it.
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const menu = page.frameLocator('iframe[title="任务描述"]').locator('#ml-slash-menu');
  await expect(menu).toBeVisible();
  await expect
    .poll(async () => {
      const box = await frame.boundingBox();
      const inner = await menu.evaluate((el) => el.getBoundingClientRect().bottom);
      return box ? box.height - inner : -1;
    })
    .toBeGreaterThanOrEqual(0);
});

test('descriptions and comments render Markdown; ticking a checkbox changes one character', async ({
  page,
}) => {
  await setup(page);
  const source = [
    '## 验收',
    '',
    '- [ ] 桌面端',
    '- [x] 移动端',
    '  - 子项 **加粗**',
    '',
    '1. 第一步',
    '2. 第二步',
    '',
    '> 引用的话',
    '',
    '| 端 | 状态 |',
    '| --- | :-: |',
    '| iOS | `ok` |',
    '',
    '```ts',
    'const a = 1;',
    '```',
    '',
    '见 [文档](https://example.com) 与 ~~旧方案~~。',
  ].join('\n');
  await page.evaluate((body) => {
    const m = Reflect.get(window, '__tasksMock') as {
      tasks: { id: string; title: string; hasDescription?: boolean }[];
      bodies: Record<string, string>;
    };
    const t = m.tasks.find((x) => x.title === '修复移动端导航栏错位');
    if (t) {
      m.bodies[t.id] = body;
      t.hasDescription = true;
    }
  }, source);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  const desc = page.locator('.task-desc');
  await expect(desc.locator('h3')).toHaveText('验收');
  await expect(desc.locator('ol > li')).toHaveCount(2);
  await expect(desc.locator('li.task-md-check li strong')).toHaveText('加粗');
  await expect(desc.locator('blockquote')).toHaveText('引用的话');
  await expect(desc.locator('table td').first()).toHaveText('iOS');
  await expect(desc.locator('pre[data-lang="ts"]')).toHaveText('const a = 1;');
  await expect(desc.locator('a[href="https://example.com"]')).toHaveText('文档');
  await expect(desc.locator('del')).toHaveText('旧方案');
  await expect(desc).not.toContainText('##');

  const boxes = desc.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  await boxes.first().check();
  await expect(boxes.first()).toBeChecked();
  // The page stays in reading mode, and the file differs by exactly that mark.
  await expect(page.locator('iframe[title="任务描述"]')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const m = Reflect.get(window, '__tasksMock') as {
          tasks: { id: string; title: string }[];
          bodies: Record<string, string>;
        };
        const t = m.tasks.find((x) => x.title === '修复移动端导航栏错位');
        return t ? m.bodies[t.id] : '';
      }),
    )
    .toBe(source.replace('- [ ] 桌面端', '- [x] 桌面端'));

  // The comment field continues lists and formats the selection.
  const composer = page.getByLabel('评论');
  await composer.click();
  await page.keyboard.type('- 一');
  await page.keyboard.press('Enter');
  await page.keyboard.type('二');
  await composer.evaluate((el: HTMLTextAreaElement) =>
    el.setSelectionRange(el.value.length - 1, el.value.length),
  );
  await page.keyboard.press('ControlOrMeta+b');
  await expect(composer).toHaveValue('- 一\n- **二**');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.task-comment-body li strong')).toHaveText('二');
});

test('the guide reads in chapters, follows the scroll, and its actions start the real thing', async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '使用指南' }).click();
  const guide = page.locator('.tg');
  await expect(guide.getByRole('heading', { level: 2 })).toHaveText('在写作的地方，管理要做的事');
  const rail = page.getByRole('navigation', { name: '指南目录' });
  await expect(rail.getByRole('button')).toHaveCount(8);
  await expect(rail.getByRole('button', { name: /三步上手/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  const shots = process.env.GUIDE_SHOTS;
  if (shots) await page.screenshot({ path: `${shots}/guide-hero.png` });

  // The rail jumps to a chapter and marks it; its figure plays once in view.
  await rail.getByRole('button', { name: /搜索与视图/ }).click();
  const query = page.locator('#tg-query');
  await expect(query).toHaveAttribute('data-in', '');
  await expect(rail.getByRole('button', { name: /搜索与视图/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(query.locator('table')).toContainText('overdue');
  if (shots) {
    if (process.env.GUIDE_DARK) await emitLayoutMenu(page, 'theme:marklyra-dark');
    for (const id of ['keyboard', 'query', 'board', 'page', 'plan', 'notes', 'automation']) {
      await page.locator(`#tg-${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(Number(process.env.GUIDE_WAIT ?? 1600));
      await page
        .locator(`#tg-${id}`)
        .screenshot({ path: `${shots}/guide-${id}${process.env.GUIDE_DARK ? '-dark' : ''}.png` });
    }
  }

  // A chapter ends in the product: this one opens the new-project dialog.
  await rail.getByRole('button', { name: /项目与迭代/ }).click();
  await page.locator('#tg-plan').getByRole('button', { name: '新建项目' }).click();
  await expect(page.getByLabel('项目名称')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('#tg-automation').getByRole('button', { name: '去导入' }).click();
  await expect(page.locator('.task-settings-page h2')).toHaveText('导入');
});

/** `agent_skill*` and `cli_*` answer from an in-page home folder; Claude and GLM share one. */
function installSkillsMock() {
  if (window !== window.top) return;
  const host = window as TestWindow & {
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
  const previous = host.__TAURI_INTERNALS__.invoke;
  const agents = [
    ['claude-acp', 'Claude', '.claude/skills'],
    ['codex-acp', 'Codex', '.agents/skills'],
    ['glm-acp-agent', 'GLM', '.claude/skills'],
    ['opencode', 'OpenCode', '.config/opencode/skills'],
    ['qoder', 'Qoder', '.qoder/skills'],
  ];
  const files: Record<string, 'ours' | 'old' | 'foreign'> = { '.qoder/skills': 'foreign' };
  const cli = {
    path: '/Users/me/.local/bin/marklyra',
    installed: false,
    ours: false,
    current: false,
  };
  const statuses = () =>
    agents.map(([agentId, name, dir]) => {
      const file = files[dir as string];
      return {
        agentId,
        name,
        path: `/Users/me/${dir}/marklyra-task/SKILL.md`,
        installed: !!file,
        ours: file === 'ours' || file === 'old',
        current: file === 'ours',
        sharedWith: agents.filter((a) => a[2] === dir && a[0] !== agentId).map((a) => a[1]),
      };
    });
  const dirOf = (id: unknown) => agents.find((a) => a[0] === id)?.[2] as string;
  host.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
    if (command === 'agent_skills_status') return statuses();
    if (command === 'agent_skill_install') {
      host.__desktopMock.calls.push({ command, args });
      files[dirOf(args.agentId)] = 'ours';
      return statuses();
    }
    if (command === 'agent_skill_uninstall') {
      host.__desktopMock.calls.push({ command, args });
      delete files[dirOf(args.agentId)];
      return statuses();
    }
    if (command === 'cli_status') return { ...cli };
    if (command === 'cli_install') {
      Object.assign(cli, { installed: true, ours: true, current: true });
      return { ...cli };
    }
    return previous(command, args);
  };
}

test('agent skills install and uninstall per agent, with shared folders and foreign files left alone', async ({
  page,
}) => {
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installTasksMock, { seed: true });
  await page.addInitScript(installSkillsMock);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page, '# 文档\n\n正文\n');
  await emitLayoutMenu(page, 'open-folder');
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await page.locator('.task-nav-item', { hasText: '任务设置' }).click();
  await page.locator('.task-settings-nav').getByRole('button', { name: '智能体技能' }).click();

  const list = page.getByRole('list', { name: '智能体' });
  const row = (name: string) =>
    list
      .getByRole('listitem')
      .filter({ has: page.locator('.task-skill-name').getByText(name, { exact: true }) });
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(row('Claude')).toContainText('~/.claude/skills/marklyra-task/SKILL.md');
  await expect(row('Claude')).toContainText('与 GLM 共用');
  await expect(row('Qoder')).toContainText('已有同名文件');
  await expect(row('Qoder').getByRole('button', { name: /^(安装|卸载|更新)/ })).toHaveCount(0);

  await page.getByRole('button', { name: '安装到 Claude' }).click();
  await expect(row('Claude')).toContainText('已安装');
  // GLM reads the same folder, so it follows.
  await expect(row('GLM')).toContainText('已安装');
  await expect(row('Codex')).not.toContainText('已安装');
  // An up-to-date install can still be rewritten from this version.
  await page.getByRole('button', { name: '更新 Claude' }).click();
  await expect(
    page.locator('.notice-text', { hasText: 'Claude 的技能已更新到当前版本' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '从 GLM 卸载' }).click();
  await expect(row('Claude').getByRole('button', { name: '安装到 Claude' })).toBeVisible();

  await page.getByRole('button', { name: '安装命令行' }).click();
  await expect(page.locator('.task-skills')).toContainText('~/.local/bin/marklyra');
  await expect(page.getByRole('button', { name: '卸载命令行' })).toBeVisible();
  await page.getByRole('button', { name: '更新命令行' }).click();
  await expect(page.locator('.notice-text', { hasText: '命令行已更新到当前版本' })).toBeVisible();
  if (process.env.SKILL_SHOTS) {
    await page.getByRole('button', { name: '安装到 Codex' }).click();
    await page
      .locator('.task-skills')
      .screenshot({ path: `${process.env.SKILL_SHOTS}/skills.png` });
    if (process.env.SKILL_DARK) {
      await emitLayoutMenu(page, 'theme:marklyra-dark');
      await page.waitForTimeout(400);
      await page
        .locator('.task-skills')
        .screenshot({ path: `${process.env.SKILL_SHOTS}/skills-dark.png` });
    }
  }
  expect(
    await page.evaluate(() =>
      (window as TestWindow).__desktopMock.calls
        .filter((c) => c.command.startsWith('agent_skill_'))
        .map((c) => [c.command, c.args?.agentId]),
    ),
  ).toEqual([
    ['agent_skill_install', 'claude-acp'],
    ['agent_skill_install', 'claude-acp'],
    ['agent_skill_uninstall', 'glm-acp-agent'],
    ...(process.env.SKILL_SHOTS ? [['agent_skill_install', 'codex-acp']] : []),
  ]);
});

/** Due dates around Wednesday 21 October 2026: one overdue, one today, two done. */
function installDueDates() {
  if (window !== window.top) return;
  const m = Reflect.get(window, '__tasksMock') as {
    tasks: { title: string; due: string | null; status: string }[];
  };
  const set = (title: string, due: string, status?: string) => {
    const task = m.tasks.find((t) => t.title === title);
    if (!task) return;
    task.due = due;
    if (status) task.status = status;
  };
  set('编写发布公告', '2026-10-19');
  set('输出三套方案', '2026-10-20');
  set('修复移动端导航栏错位', '2026-10-21');
  set('接入访问统计', '2026-10-23', 'done');
}
// While tasks are open the file sidebar (with its calendar) stays mounted but hidden.
const calendar = (page: Page) => page.locator('.daily-calendar:visible');
const calendarDay = (page: Page, key: string) =>
  page.locator(`.daily-calendar:visible [data-key="${key}"]`);

test('the sidebar calendar marks due dates and opens a day’s tasks or a new one', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0, 0));
  await installLayout(page, undefined, 'web');
  await page.addInitScript(installTasksMock, { seed: true });
  await page.addInitScript(installDueDates);
  await readyLayout(page, 'marklyra-light');
  await openLayoutDocument(page);
  await emitLayoutMenu(page, 'open-folder');
  await emitLayoutMenu(page, 'view:files');
  await expect(calendar(page)).toBeVisible();
  await expect(calendar(page)).toHaveAttribute('aria-label', '日历');
  const mark = (key: string) => calendarDay(page, key).locator('.daily-day-mark');
  await expect(mark('2026-10-21')).toHaveAttribute('data-mark', 'open');
  await expect(mark('2026-10-19')).toHaveAttribute('data-mark', 'overdue');
  await expect(mark('2026-10-20')).toHaveAttribute('data-mark', 'done');
  await expect(mark('2026-10-23')).toHaveAttribute('data-mark', 'done');
  await expect(mark('2026-10-22')).not.toHaveAttribute('data-mark', /.+/);
  await expect(calendarDay(page, '2026-10-21')).toHaveAttribute(
    'title',
    /1 项未完成\nWEB-\d+ 修复移动端导航栏错位/,
  );
  await expect(calendarDay(page, '2026-10-22')).toHaveAttribute('title', /没有到期的任务/);

  // A day opens the workbench on that day's due tasks.
  await calendarDay(page, '2026-10-21').click();
  await expect(workbench(page)).toBeVisible();
  await expect(page.locator('.task-row:not(.ghost)')).toHaveCount(1);
  await expect(row(page, '修复移动端导航栏错位')).toBeVisible();
  await expect(calendarDay(page, '2026-10-21')).toHaveAttribute('aria-pressed', 'true');

  // The context menu starts a task due that day; creating it marks the day.
  await calendarDay(page, '2026-10-22').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '新建当天到期的任务' }).click();
  const dialog = page.getByRole('dialog', { name: '新建任务' });
  await expect(dialog.locator('[data-picker="due"]')).toContainText('22');
  await dialog.getByLabel('任务标题').fill('准备周四评审');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(mark('2026-10-22')).toHaveAttribute('data-mark', 'open');

  // The retired 日程 commands are gone; the calendar toggle stays.
  await emitLayoutMenu(page, 'view:calendar');
  await expect(calendar(page)).toHaveAttribute('data-view', 'collapsed');
  await expect(calendar(page).locator('.daily-calendar-summary')).toContainText('1 项到期');
});

test('the home view lists overdue and due-today tasks; each opens its page', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 8, 0, 0));
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'web' as const,
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(installTasksMock, { seed: true });
  await page.addInitScript(installDueDates);
  await page.goto('/');
  const today = page.getByRole('region', { name: '开始' }).locator('.home-today');
  await expect(today).toContainText('今天');
  await expect(today).toContainText('10月21日 周三');
  await expect(today.locator('li')).toHaveText([
    /编写发布公告.*逾期 2 天/,
    /修复移动端导航栏错位.*今天/,
  ]);
  await expect(today).not.toContainText('日程');
  await today.getByRole('button', { name: /修复移动端导航栏错位/ }).click();
  await expect(page.locator('.task-title-edit')).toHaveText('修复移动端导航栏错位');
});

test('the home view says when nothing is due and starts a new task', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 21, 8, 0, 0));
  await page.addInitScript(installMock, {
    nativeChrome: true,
    titlebar: 'web' as const,
    home: true,
  });
  await page.addInitScript(installRecoveryMock);
  await page.addInitScript(installCreationMock, {
    runtimeUrl: process.env.CREATION_RUNTIME_URL ?? 'http://127.0.0.1:4174/index.html',
  });
  await page.addInitScript(installRecentMock);
  await page.addInitScript(installTasksMock, { seed: true });
  await page.goto('/');
  const today = page.getByRole('region', { name: '开始' }).locator('.home-today');
  await expect(today).toContainText('今天没有到期的任务');
  await today.getByRole('button', { name: /新建任务/ }).click();
  await expect(page.getByRole('dialog', { name: '新建任务' })).toBeVisible();
});

test('the 日历 settings page replaces 日程 and keeps only display choices', async ({ page }) => {
  await setup(page);
  await emitLayoutMenu(page, 'preferences');
  const settings = page.frameLocator('.runtime-preferences-frame');
  await settings.getByRole('button', { name: '日历', exact: true }).click();
  const page_ = page.getByRole('region', { name: '日历设置' });
  await expect(page_.getByRole('heading', { name: '日历' })).toBeVisible();
  await expect(page_.getByRole('switch', { name: '标记有任务到期的日期' })).toBeChecked();
  await expect(page_).not.toContainText('日程目录');
  await expect(page_).not.toContainText('模板');
  await expect(settings.getByRole('button', { name: '日程', exact: true })).toHaveCount(0);
});

test('long subtask titles truncate instead of pushing the task page past its left edge', async ({
  page,
}) => {
  // Narrow enough that the page and the property card must share the width.
  await page.setViewportSize({ width: 1200, height: 767 });
  await setup(page);
  await page.evaluate(() => {
    const m = Reflect.get(window, '__tasksMock') as {
      tasks: { title: string; parent: string | null; id: string }[];
    };
    const parent = m.tasks.find((t) => t.title === '重做首页首屏视觉');
    const kid = m.tasks.find((t) => t.parent === parent?.id);
    if (kid)
      kid.title =
        '1.收集大家的下周和本周工作内容 2.收集新平台的进度 3.和骆总沟通用户管理是否调整， 是否新增一个独立的用户管理页面与权限配置能力并同步给所有人';
  });
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '重做首页首屏视觉').click();
  await expect(page.locator('.task-prop-card')).toBeVisible();
  const layout = await page.evaluate(() => {
    const pane = document.querySelector('.task-page') as HTMLElement;
    const main = document.querySelector('.task-main') as HTMLElement;
    const title = document.querySelector('.task-sub-title') as HTMLElement;
    return {
      paneLeft: pane.getBoundingClientRect().left,
      mainLeft: main.getBoundingClientRect().left,
      overflow: pane.scrollWidth - pane.clientWidth,
      truncated: title.scrollWidth > title.clientWidth,
    };
  });
  expect(layout.mainLeft).toBeGreaterThanOrEqual(layout.paneLeft);
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.truncated).toBe(true);
  // The full title stays one hover away.
  await expect(page.locator('.task-sub-title').first()).toHaveAttribute('title', /同步给所有人$/);
  if (process.env.OVERFLOW_SHOT) await page.screenshot({ path: process.env.OVERFLOW_SHOT });
});
