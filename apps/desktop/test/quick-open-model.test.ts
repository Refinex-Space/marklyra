import { describe, expect, it } from 'vitest';
import {
  arrange,
  flatten,
  type QuickItem,
  relativeTime,
  scoreItem,
  segments,
  shortcutLabel,
} from '../src/features/quick-open/quick-open-model.js';

const item = (
  kind: QuickItem['kind'],
  title: string,
  extra: Partial<QuickItem> = {},
): QuickItem => ({
  id: `${kind}:${title}`,
  kind,
  title,
  icon: 'document',
  run() {},
  ...extra,
});

describe('quick-open ranking', () => {
  it('prefers a prefix over a later substring over a scattered match', () => {
    const prefix = scoreItem(item('note', 'Java 基础'), 'java');
    const inside = scoreItem(item('note', '笔记 Java'), 'java');
    const scattered = scoreItem(item('note', 'jxaxva'), 'java');
    expect(prefix && inside && scattered).toBeTruthy();
    expect(prefix?.score ?? 0).toBeGreaterThan(inside?.score ?? 0);
    expect(inside?.score ?? 0).toBeGreaterThan(scattered?.score ?? 0);
    expect(prefix?.ranges).toEqual([[0, 4]]);
  });

  it('needs every word, matches Chinese by substring and falls back to detail and keywords', () => {
    const note = item('note', '项目管理周报', { detail: '工作空间 › 项目管理' });
    expect(scoreItem(note, '项目 周报')).not.toBeNull();
    expect(scoreItem(note, '项目 季报')).toBeNull();
    expect(scoreItem(note, '工作空间')).not.toBeNull();
    const action = item('action', '新建笔记', { keywords: 'new create' });
    expect(scoreItem(action, 'create')).not.toBeNull();
    // A single stray character is not a match.
    expect(scoreItem(item('note', 'abc'), 'x')).toBeNull();
  });

  it('groups by kind, caps the all tab and keeps the given order without a query', () => {
    const notes = Array.from({ length: 12 }, (_, index) => item('note', `n${index}`));
    const items = [item('action', '保存'), ...notes, item('setting', '偏好设置')];
    const all = arrange(items, '', 'all');
    expect(all.map((group) => group.kind)).toEqual(['note', 'action', 'setting']);
    expect(all[0]?.results).toHaveLength(8);
    expect(all[0]?.results[0]?.item.title).toBe('n0');
    const only = arrange(items, '', 'note');
    expect(only).toHaveLength(1);
    expect(only[0]?.results).toHaveLength(12);
    expect(flatten(all).length).toBe(8 + 1 + 1);
  });

  it('orders a kind by score when searching and highlights the title', () => {
    const items = [item('note', '读书笔记 java'), item('note', 'Java 入门'), item('note', '无关')];
    const [group] = arrange(items, 'java', 'note');
    expect(group?.results.map((entry) => entry.item.title)).toEqual(['Java 入门', '读书笔记 java']);
    expect(segments('Java 入门', group?.results[0]?.ranges ?? [])).toEqual([
      { text: 'Java', hit: true },
      { text: ' 入门', hit: false },
    ]);
  });
});

describe('quick-open presentation helpers', () => {
  it('writes accelerators the way each platform does', () => {
    expect(shortcutLabel('CmdOrCtrl+Shift+S', false)).toBe('Ctrl+Shift+S');
    expect(shortcutLabel('CmdOrCtrl+Shift+S', true)).toBe('⌘⇧S');
    expect(shortcutLabel('F8', true)).toBe('F8');
  });

  it('words recency for people', () => {
    const now = new Date(2026, 9, 20, 15, 0, 0).getTime();
    expect(relativeTime(now - 20_000, now)).toBe('刚刚');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前');
    expect(relativeTime(new Date(2026, 9, 19, 9, 0).getTime(), now)).toBe('昨天');
    expect(relativeTime(new Date(2026, 9, 16, 9, 0).getTime(), now)).toBe('4 天前');
    expect(relativeTime(new Date(2026, 8, 1, 9, 0).getTime(), now)).toBe('2026年9月1日');
  });
});
