import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Catalog } from '../src/features/tasks/model/catalog.js';
import { matches, parseQuery } from '../src/features/tasks/model/query.js';
import type { TaskSnapshot } from '../src/services/tasks.js';

// The same vectors drive crates/task-store/tests/query.rs, so the host evaluator used by AI
// tools and the command line agrees with the search box.
const data = JSON.parse(
  readFileSync(
    new URL('../../../crates/task-store/tests/fixtures/query-vectors.json', import.meta.url),
    'utf8',
  ),
) as Omit<
  TaskSnapshot,
  'generation' | 'initialized' | 'views' | 'templates' | 'invalid' | 'truncated'
> & {
  today: string;
  bodies: Record<string, string>;
  cases: [string, string[]][];
};

describe('query vectors shared with the Rust evaluator', () => {
  const catalog = new Catalog({
    ...data,
    generation: 1,
    initialized: true,
    views: [],
    templates: [],
    invalid: [],
    truncated: false,
  } as TaskSnapshot);
  const now = new Date(`${data.today}T12:00:00`);
  for (const [query, expected] of data.cases)
    it(query, () => {
      const parsed = parseQuery(query);
      // What the host's description search returns for the free text.
      const terms = parsed.text.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 16);
      const hits = new Set(
        terms.length
          ? data.tasks
              .filter((t) =>
                terms.every(
                  (w) =>
                    t.title.toLowerCase().includes(w) ||
                    (data.bodies[t.id] ?? '').toLowerCase().includes(w),
                ),
              )
              .map((t) => t.id)
          : [],
      );
      const actual = data.tasks
        .filter((t) => matches(t, parsed, catalog, now, hits))
        .map((t) => t.id);
      expect(actual).toEqual(expected);
    });
});
