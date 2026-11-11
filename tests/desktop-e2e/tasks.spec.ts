import { expect, type Page, test } from '@playwright/test';
import type { TestWindow } from './desktop.helpers.js';
import {
  emitLayoutMenu,
  installLayout,
  layoutHistory,
  openLayoutDocument,
  readyLayout,
} from './layout.helpers.js';

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

test('the description opens in the note editor as the task file', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '任务', exact: true }).first().click();
  await row(page, '修复移动端导航栏错位').click();
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '在编辑器中编辑描述' }).click();
  await expect(workbench(page)).toHaveCount(0);
  // The window now holds the task's own file.
  await expect(page.getByRole('button', { name: /navfix000001\.md/ }).first()).toBeVisible();
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
