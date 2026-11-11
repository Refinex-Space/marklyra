import { describe, expect, it } from 'vitest';
import { applyTemplate, type DraftState } from '../src/features/tasks/dialogs.js';
import { Catalog } from '../src/features/tasks/model/catalog.js';
import { cycleStats, cycleTiming } from '../src/features/tasks/model/cycle.js';
import { matches, parseQuery, serializeQuery } from '../src/features/tasks/model/query.js';
import { buildSections, navigable, suggestKey } from '../src/features/tasks/model/view.js';
import type { TaskMeta, TaskSnapshot } from '../src/services/tasks.js';

const statuses: TaskSnapshot['statuses'] = [
  ['backlog', '待规划', 'backlog'],
  ['todo', '待办', 'unstarted'],
  ['in-progress', '进行中', 'started'],
  ['in-review', '评审中', 'review'],
  ['done', '已完成', 'completed'],
  ['cancelled', '已取消', 'cancelled'],
].map(([id = '', name = '', category = ''], order) => ({
  id,
  name,
  category: category as never,
  color: id,
  builtin: true,
  order,
}));

let seq = 0;
function task(over: Partial<TaskMeta>): TaskMeta {
  seq++;
  return {
    id: `t${seq}`,
    title: `任务 ${seq}`,
    project: 'web',
    number: seq,
    status: 'todo',
    priority: 0,
    type: null,
    labels: [],
    bucket: null,
    cycle: null,
    cycleAdded: null,
    parent: null,
    due: null,
    created: '2026-11-01T00:00:00Z',
    updated: '2026-11-01T00:00:00Z',
    completed: null,
    previousIds: [],
    archived: false,
    order: seq,
    blockedBy: [],
    related: [],
    hasDescription: false,
    comments: 0,
    revision: 'r',
    ...over,
  };
}
function catalog(tasks: TaskMeta[], extra: Partial<TaskSnapshot> = {}) {
  return new Catalog({
    generation: 1,
    initialized: true,
    tasks,
    statuses,
    invalid: [],
    truncated: false,
    projects: [
      {
        id: 'web',
        name: '官网',
        key: 'WEB',
        previousKeys: ['SITE'],
        icon: 'folder',
        color: 'violet',
        state: 'active',
        order: 1,
        pinned: false,
        description: '',
        created: '',
        statuses: null,
        labels: null,
        buckets: null,
        views: [],
        defaultTemplate: null,
        revision: 'p',
      },
    ],
    labels: [
      { id: 'design', name: '设计', color: 'pink', order: 1, addLabels: [], setPriority: 0 },
    ],
    types: [],
    buckets: [],
    views: [],
    cycles: [],
    templates: [],
    settings: {
      unassignedKey: 'TASK',
      comments: true,
      cyclesEnabled: true,
      cycleWeeks: 2,
      cycleStartDay: 1,
    },
    ...extra,
  });
}

describe('query syntax', () => {
  it('parses chips, negation, quoted values, Chinese aliases and round-trips', () => {
    const q = parseQuery('is:open -状态:done priority:urgent,high label:"Needs review" 首页 #3');
    expect(q.chips).toEqual([
      { key: 'is', negated: false, values: ['open'] },
      { key: 'status', negated: true, values: ['done'] },
      { key: 'priority', negated: false, values: ['urgent', 'high'] },
      { key: 'label', negated: false, values: ['Needs review'] },
    ]);
    expect(q.text).toBe('首页 #3');
    expect(serializeQuery(q)).toBe(
      'is:open -status:done priority:urgent,high label:"Needs review" 首页 #3',
    );
    expect(parseQuery('unknown:x').chips).toEqual([]);
  });

  it('evaluates filters with AND across chips and OR inside a chip', () => {
    const now = new Date('2026-11-10T09:00:00');
    const a = task({ priority: 1, labels: ['design'], due: '2026-11-09' });
    const b = task({ priority: 2, status: 'done', due: '2026-11-20' });
    const c = task({ archived: true });
    const old = task({ previousIds: ['APP-7'] });
    const cat = catalog([a, b, c, old]);
    const run = (s: string) =>
      [a, b, c, old].filter((t) => matches(t, parseQuery(s), cat, now)).map((t) => t.id);
    expect(run('priority:urgent,high')).toEqual([a.id, b.id]);
    expect(run('is:overdue')).toEqual([a.id]);
    expect(run('-status:done priority:urgent,high')).toEqual([a.id]);
    expect(run('标签:设计')).toEqual([a.id]);
    expect(run('is:archived')).toEqual([c.id]);
    expect(run(`web-${b.number}`)).toEqual([b.id]);
    expect(run('app-7')).toEqual([old.id]);
    expect(run(`#${a.number}`)).toEqual([a.id]);
    expect(run('due:<7d')).toEqual([a.id]);
  });
});

describe('list layout', () => {
  it('keeps subtasks under parents, adds a dimmed parent across groups and folds closed tasks', () => {
    const parent = task({ status: 'in-progress' });
    const kidTodo = task({ parent: parent.id });
    const kidSame = task({ parent: parent.id, status: 'in-progress' });
    const done = task({ status: 'done', priority: 2 });
    const cat = catalog([parent, kidTodo, kidSame, done]);
    const opts = { project: 'web', collapsed: new Set<string>(), openFolds: new Set<string>() };
    const sections = buildSections(
      cat.tasks,
      cat,
      { layout: 'list', groupBy: 'status', orderBy: 'manual' },
      opts,
    );
    expect(sections.map((s) => s.group.key)).toEqual([
      'backlog',
      'todo',
      'in-progress',
      'in-review',
      'done',
      'cancelled',
    ]);
    expect(sections[1]?.rows).toEqual([
      { kind: 'ghost', id: parent.id },
      { kind: 'task', id: kidTodo.id, tree: 'end' },
    ]);
    expect(sections[2]?.rows).toEqual([
      { kind: 'task', id: parent.id, tree: null },
      { kind: 'task', id: kidSame.id, tree: 'end' },
    ]);
    expect(navigable(sections)).toEqual([kidTodo.id, parent.id, kidSame.id, done.id]);
    const byPriority = buildSections(
      cat.tasks,
      cat,
      { layout: 'list', groupBy: 'priority', orderBy: 'manual' },
      opts,
    );
    expect(byPriority.find((s) => s.group.key === '2')?.rows).toEqual([
      { kind: 'fold', key: '2:closed', count: 1, open: false },
    ]);
    const collapsed = buildSections(
      cat.tasks,
      cat,
      { layout: 'list', groupBy: 'status', orderBy: 'manual' },
      { ...opts, collapsed: new Set(['todo']) },
    );
    expect(collapsed[1]?.rows).toEqual([]);
    expect(collapsed[1]?.group.count).toBe(1);
  });

  it('resolves old ids after key changes', () => {
    const t = task({});
    expect(catalog([t]).resolve(`SITE-${t.number}`)?.id).toBe(t.id);
  });
});

describe('project keys', () => {
  it('suggests initials, including pinyin for Chinese names, avoiding taken keys', () => {
    expect(suggestKey('Website Launch', new Set())).toBe('WL');
    expect(suggestKey('官网改版', new Set())).toBe('GWGB');
    expect(suggestKey('Marketing', new Set())).toBe('MAR');
    expect(suggestKey('Website Launch', new Set(['WL']))).toBe('WL2');
    expect(suggestKey('！！', new Set())).toBe('PRJ');
  });
});

const cycle = (number: number, state: 'active' | 'upcoming' | 'completed', over = {}) => ({
  number,
  name: null,
  start: '2026-11-09',
  end: '2026-11-22',
  state,
  started: '2026-11-09T01:00:00Z',
  completedAt: null,
  summary: null,
  revision: 'c',
  ...over,
});

describe('cycles', () => {
  it('resolves current, upcoming, previous and numbered cycles in queries', () => {
    const tasks = [task({ cycle: 3 }), task({ cycle: 4 }), task({ cycle: 2 }), task({})];
    const c = catalog(tasks, {
      cycles: [cycle(2, 'completed'), cycle(3, 'active'), cycle(4, 'upcoming')],
    });
    const ids = (q: string) =>
      tasks.filter((t) => matches(t, parseQuery(q), c)).map((t) => t.cycle);
    expect(ids('cycle:current')).toEqual([3]);
    expect(ids('迭代:下一个')).toEqual([4]);
    expect(ids('cycle:previous')).toEqual([2]);
    expect(ids('cycle:#4')).toEqual([4]);
    expect(ids('cycle:none')).toEqual([null]);
    expect(ids('-cycle:current has:cycle')).toEqual([4, 2]);
  });

  it('counts planned against the start instant and reads finished cycles from the summary', () => {
    const planned = task({ cycle: 3, cycleAdded: '2026-11-09T01:00:00Z' });
    const added = task({ cycle: 3, cycleAdded: '2026-11-12T08:00:00Z', status: 'done' });
    const legacy = task({ cycle: 3, status: 'in-progress' });
    const c = catalog([planned, added, legacy], { cycles: [cycle(3, 'active')] });
    const live = cycleStats(c, cycle(3, 'active'));
    expect([live.total, live.done, live.planned, live.added, live.open]).toEqual([3, 1, 2, 1, 2]);
    expect(live.unfinished.map((t) => t.id)).toEqual([planned.id, legacy.id]);

    // After completion the summary stays put even though the task moved on.
    const done = cycle(3, 'completed', {
      summary: {
        planned: 2,
        added: 1,
        completed: [added.id],
        cancelled: [],
        unfinished: [planned.id, legacy.id],
      },
    });
    const moved = catalog([{ ...planned, cycle: 4 }, { ...added, status: 'todo' }, legacy], {
      cycles: [done],
    });
    const frozen = cycleStats(moved, done);
    expect([frozen.total, frozen.done, frozen.open, frozen.planned]).toEqual([3, 1, 2, 2]);
  });

  it('describes timing in local days, counting the last day', () => {
    const c = cycle(3, 'active');
    expect(cycleTiming(c, new Date('2026-11-22T23:00:00'))).toEqual({ kind: 'running', days: 1 });
    expect(cycleTiming(c, new Date('2026-11-24T08:00:00'))).toEqual({ kind: 'overrun', days: 2 });
    expect(
      cycleTiming(cycle(4, 'upcoming', { start: '2026-11-23' }), new Date('2026-11-20T08:00:00')),
    ).toEqual({
      kind: 'before',
      days: 3,
    });
  });
});

describe('templates', () => {
  const base: DraftState = {
    title: '',
    project: 'web',
    status: 'todo',
    priority: 0,
    type: null,
    labels: [],
    bucket: null,
    due: null,
    cycle: 3,
    description: '',
    parent: null,
    subtasks: [],
    template: null,
  };
  const template = {
    id: 'bug',
    name: '缺陷',
    title: '[Bug] ',
    status: 'in-progress',
    priority: 2,
    type: null,
    labels: ['design', 'gone'],
    bucket: 'missing',
    subtasks: ['复现', '修复'],
    description: '## 步骤',
    order: 1,
    revision: 't',
  };
  it('fills empty fields, keeps typed text and drops values the project cannot use', () => {
    const c = catalog([]);
    const filled = applyTemplate({ ...base, title: '已输入' }, template, c);
    expect(filled).toMatchObject({
      title: '已输入',
      description: '## 步骤',
      status: 'in-progress',
      priority: 2,
      labels: ['design'],
      bucket: null,
      cycle: 3,
      subtasks: ['复现', '修复'],
      template: 'bug',
    });
    expect(applyTemplate({ ...base, parent: 't1' }, template, c).subtasks).toEqual([]);
    expect(applyTemplate(filled, undefined, c)).toMatchObject({ template: null, subtasks: [] });
  });
});

describe('note links and relations', () => {
  it('writes readable Markdown links and reads task ids back from notes', async () => {
    const { taskLink, parseLinkTarget, linkedTaskIds, projectLink } = await import(
      '../src/features/tasks/model/links.js'
    );
    expect(taskLink('WEB-12', '定价页 [年付]', 'abc123def456ghj789kl')).toBe(
      '[WEB-12 定价页 \\[年付\\]](task:abc123def456ghj789kl)',
    );
    expect(projectLink('官网', 'web')).toBe('[官网](project:web)');
    expect(parseLinkTarget('task:abc123def456ghj789kl')).toEqual({
      kind: 'task',
      id: 'abc123def456ghj789kl',
    });
    expect(parseLinkTarget('project:web')).toEqual({ kind: 'project', id: 'web' });
    expect(parseLinkTarget('https://example.com')).toBeNull();
    expect(parseLinkTarget('task:../etc')).toBeNull();
    const note =
      '- [ ] [WEB-1 a](task:aaaaaa1111) and [[task:bbbbbb2222|别名]]\n' +
      'again [x](task:aaaaaa1111) [site](https://x.dev) [[笔记]]';
    expect(linkedTaskIds(note)).toEqual(['aaaaaa1111', 'bbbbbb2222']);
  });

  it('treats a task as blocked only while an open, unarchived blocker remains', () => {
    const blocker = task({});
    const waiting = task({ blockedBy: [blocker.id] });
    const c = catalog([blocker, waiting]);
    expect(c.isBlocked(waiting)).toBe(true);
    expect(matches(waiting, parseQuery('is:blocked'), c)).toBe(true);
    expect(matches(waiting, parseQuery('has:relations'), c)).toBe(true);
    const done = catalog([{ ...blocker, status: 'done' }, waiting]);
    expect(done.isBlocked(waiting)).toBe(false);
    const archived = catalog([{ ...blocker, archived: true }, waiting]);
    expect(archived.isBlocked(waiting)).toBe(false);
    expect(done.isBlocked({ ...waiting, status: 'done' })).toBe(false);
  });
});
