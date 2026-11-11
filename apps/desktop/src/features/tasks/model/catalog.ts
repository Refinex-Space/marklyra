import {
  type Category,
  type Cycle,
  type Dictionary,
  isOpenCategory,
  type Project,
  type Status,
  type TaskMeta,
  type TaskSnapshot,
} from '../../../services/tasks.js';

export const PRIORITIES = [
  { value: 1, id: 'urgent', name: '紧急' },
  { value: 2, id: 'high', name: '高' },
  { value: 3, id: 'medium', name: '中' },
  { value: 4, id: 'low', name: '低' },
  { value: 0, id: 'none', name: '无优先级' },
] as const;
export const priorityName = (value: number) =>
  PRIORITIES.find((p) => p.value === value)?.name ?? '无优先级';
/** Sort rank: urgent first, "none" last. */
export const priorityRank = (value: number) => (value === 0 ? 5 : value);

/** Read-only lookups over one snapshot. Rebuilt whenever the snapshot changes. */
export class Catalog {
  readonly tasks: TaskMeta[];
  private readonly byId = new Map<string, TaskMeta>();
  private readonly kids = new Map<string, TaskMeta[]>();
  private readonly statusById = new Map<string, Status>();
  private readonly projectById = new Map<string, Project>();
  constructor(readonly snapshot: TaskSnapshot) {
    this.tasks = snapshot.tasks;
    for (const t of snapshot.tasks) this.byId.set(t.id, t);
    for (const t of snapshot.tasks) {
      if (!t.parent || t.archived) continue;
      const list = this.kids.get(t.parent) ?? [];
      list.push(t);
      this.kids.set(t.parent, list);
    }
    for (const s of snapshot.statuses) this.statusById.set(s.id, s);
    for (const p of snapshot.projects) this.projectById.set(p.id, p);
  }
  task(id: string | null | undefined) {
    return id ? this.byId.get(id) : undefined;
  }
  children(id: string) {
    return this.kids.get(id) ?? [];
  }
  status(id: string): Status {
    return (
      this.statusById.get(id) ??
      this.statusById.get('todo') ?? {
        id,
        name: id,
        category: 'unstarted',
        color: 'todo',
        builtin: false,
        order: 0,
      }
    );
  }
  category(task: TaskMeta): Category {
    return this.status(task.status).category;
  }
  isOpen(task: TaskMeta) {
    return isOpenCategory(this.category(task));
  }
  project(id: string | null | undefined) {
    return id ? this.projectById.get(id) : undefined;
  }
  key(project: string | null) {
    return this.project(project)?.key ?? this.snapshot.settings.unassignedKey;
  }
  humanId(task: TaskMeta) {
    return `${this.key(task.project)}-${task.number}`;
  }
  /** Resolves `WEB-12`, including IDs a task had before moving projects or key changes. */
  resolve(humanId: string): TaskMeta | undefined {
    const upper = humanId.trim().toUpperCase();
    const match = /^([A-Z][A-Z0-9]{1,4})-(\d+)$/.exec(upper);
    if (!match) return undefined;
    const [, key, n] = match;
    const current = this.tasks.find((t) => this.key(t.project) === key && t.number === Number(n));
    if (current) return current;
    const renamed = this.snapshot.projects.find((p) => p.previousKeys.includes(key ?? ''));
    return (
      (renamed && this.tasks.find((t) => t.project === renamed.id && t.number === Number(n))) ??
      this.tasks.find((t) => t.previousIds.some((old) => old.toUpperCase() === upper))
    );
  }
  /** Statuses a project offers, in category order (all when the project sets no limit). */
  statusesFor(project: string | null): Status[] {
    const limit = this.project(project)?.statuses;
    return this.snapshot.statuses
      .filter((s) => !limit || limit.includes(s.id))
      .sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.order - b.order);
  }
  labelsFor(project: string | null): Dictionary[] {
    const limit = this.project(project)?.labels;
    return this.snapshot.labels.filter((l) => !limit || limit.includes(l.id));
  }
  bucketsFor(project: string | null): Dictionary[] {
    const limit = this.project(project)?.buckets;
    return this.snapshot.buckets.filter((b) => !limit || limit.includes(b.id));
  }
  view(id: string) {
    return this.snapshot.views.find((v) => v.id === id);
  }
  label(id: string): Dictionary | undefined {
    return this.snapshot.labels.find((l) => l.id === id);
  }
  type(id: string | null): Dictionary | undefined {
    return id ? this.snapshot.types.find((l) => l.id === id) : undefined;
  }
  bucket(id: string | null): Dictionary | undefined {
    return id ? this.snapshot.buckets.find((l) => l.id === id) : undefined;
  }
  get cyclesOn() {
    return this.snapshot.settings.cyclesEnabled;
  }
  cycle(number: number | null | undefined): Cycle | undefined {
    return number ? this.snapshot.cycles.find((c) => c.number === number) : undefined;
  }
  get activeCycle() {
    return this.snapshot.cycles.find((c) => c.state === 'active');
  }
  get upcomingCycle() {
    return this.snapshot.cycles.find((c) => c.state === 'upcoming');
  }
  /** The most recently completed cycle. */
  get previousCycle() {
    return this.snapshot.cycles.filter((c) => c.state === 'completed').at(-1);
  }
  template(id: string | null | undefined) {
    return id ? this.snapshot.templates.find((t) => t.id === id) : undefined;
  }
  /** Open tasks this one waits for. */
  openBlockers(task: TaskMeta) {
    return task.blockedBy
      .map((id) => this.byId.get(id))
      .filter((t): t is TaskMeta => !!t && !t.archived && this.isOpen(t));
  }
  isBlocked(task: TaskMeta) {
    return this.isOpen(task) && this.openBlockers(task).length > 0;
  }
  /** Open tasks only, as shown next to sidebar entries. */
  openCount(filter: (task: TaskMeta) => boolean) {
    return this.tasks.filter((t) => !t.archived && this.isOpen(t) && filter(t)).length;
  }
}
export const CATEGORY_ORDER: Record<Category, number> = {
  backlog: 0,
  unstarted: 1,
  started: 2,
  review: 3,
  completed: 4,
  cancelled: 5,
};
