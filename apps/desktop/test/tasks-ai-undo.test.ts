import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; revision: string; archived: boolean; status: string; title: string };
const state = { tasks: [] as Row[], bodies: {} as Record<string, string>, rev: 100 };
const bump = (t: Row) => {
  t.revision = `r${++state.rev}`;
};
vi.mock('../src/services/tasks.js', () => ({
  tasks: {
    snapshot: async () => ({ tasks: state.tasks.map((t) => ({ ...t })) }),
    mutate: async (_ws: string, m: Record<string, unknown>) => {
      const result = {
        applied: [] as string[],
        conflicts: [] as string[],
        created: [],
        generation: 1,
      };
      if (m.kind === 'patch') {
        const ids = m.ids as string[];
        const revisions = m.revisions as string[];
        for (const [i, id] of ids.entries()) {
          const t = state.tasks.find((x) => x.id === id);
          if (!t || t.revision !== revisions[i]) {
            result.conflicts.push(id);
            continue;
          }
          Object.assign(t, m.set);
          bump(t);
          result.applied.push(id);
        }
      }
      if (m.kind === 'setDescription') {
        const t = state.tasks.find((x) => x.id === m.id);
        if (!t || t.revision !== m.revision) throw '[conflict] 冲突';
        state.bodies[t.id] = String(m.body);
        bump(t);
        result.applied.push(t.id);
      }
      return result;
    },
  },
}));
const { undoAiChanges, aiChangeCount } = await import('../src/features/tasks/ai-undo.js');

const row = (id: string, revision: string, over: Partial<Row> = {}): Row => ({
  id,
  revision,
  archived: false,
  status: 'todo',
  title: id,
  ...over,
});

describe('undoing an agent turn', () => {
  beforeEach(() => {
    state.tasks = [];
    state.bodies = {};
  });
  it('archives created tasks, restores updates newest first, and keeps later human edits', async () => {
    state.tasks = [
      row('new1', 'c1'),
      row('sub1', 'c2'),
      row('a', 'a2', { status: 'done' }),
      row('b', 'b-human', { status: 'done' }),
    ];
    state.bodies.a = 'agent text';
    const change = {
      agent: 'claude-acp',
      turnId: 't',
      workspaceId: 'ws',
      receipts: [
        { kind: 'created' as const, ids: ['new1', 'sub1'] },
        // Two changes to `a` in one turn: status, then the description.
        {
          kind: 'updated' as const,
          id: 'a',
          before: { status: 'todo' },
          description: null,
          revision: 'a1',
        },
        { kind: 'updated' as const, id: 'a', before: {}, description: 'original', revision: 'a2' },
        // `b` was edited again by the person after the agent.
        {
          kind: 'updated' as const,
          id: 'b',
          before: { status: 'todo' },
          description: null,
          revision: 'b-agent',
        },
      ],
    };
    expect(aiChangeCount(change.receipts)).toBe(5);
    const result = await undoAiChanges(change);
    expect(result).toEqual({ undone: 4, skipped: 1 });
    const get = (id: string) => state.tasks.find((t) => t.id === id);
    expect(get('new1')?.archived).toBe(true);
    expect(get('sub1')?.archived).toBe(true);
    expect(get('a')?.status).toBe('todo');
    expect(state.bodies.a).toBe('original');
    expect(get('b')?.status).toBe('done');
  });
});
