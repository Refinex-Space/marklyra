import { describe, expect, it } from 'vitest';
import { normalizePreferences } from '../src/features/settings/preferences.js';
import { SiteCatalog, searchSites } from '../src/features/sites/model/catalog.js';
import { colorValue, isGroupColor } from '../src/features/sites/model/colors.js';
import {
  builtinEngines,
  keywordProblem,
  normalizeEngines,
  searchUrl,
  templateProblem,
} from '../src/features/sites/model/engines.js';
import { letterMark } from '../src/features/sites/model/letter.js';
import { hostKey } from '../src/features/sites/model/url.js';
import {
  defaultSitesPreferences,
  normalizeSitesPreferences,
} from '../src/features/sites/sites-preferences.js';
import type { Site, SiteGroup, SiteSnapshot } from '../src/services/sites.js';

const group = (id: string, name: string, parent: string | null = null, order = 1): SiteGroup => ({
  id,
  name,
  color: 'blue',
  parent,
  order,
  collapsed: false,
  created: '',
  revision: `r-${id}`,
});
const site = (
  id: string,
  title: string,
  url: string,
  g: string | null,
  extra: Partial<Site> = {},
): Site => ({
  id,
  url,
  title,
  description: '',
  group: g,
  order: 1,
  pinned: false,
  icon: null,
  manual: [],
  created: '',
  fetched: null,
  revision: `r-${id}`,
  ...extra,
});
const snapshot = (groups: SiteGroup[], items: Site[]): SiteSnapshot => ({
  generation: 1,
  present: true,
  groups,
  items,
  invalid: [],
  truncated: false,
});

describe('search engines', () => {
  it('validates templates: https only, exactly one %s, no credentials', () => {
    expect(templateProblem('https://duckduckgo.com/?q=%s')).toBeNull();
    for (const bad of [
      'http://example.com/?q=%s',
      'https://example.com/',
      'https://example.com/?q=%s&r=%s',
      'javascript:%s',
      'https://u:p@example.com/?q=%s',
      'not a url %s',
    ])
      expect(templateProblem(bad), bad).not.toBeNull();
  });

  it('validates keywords and their uniqueness', () => {
    expect(keywordProblem('ddg', ['b', 'g'])).toBeNull();
    expect(keywordProblem('g', ['b', 'g'])).toMatch(/已被/);
    expect(keywordProblem('G', [])).not.toBeNull();
    expect(keywordProblem('', [])).not.toBeNull();
    expect(keywordProblem('toolongkeyword', [])).not.toBeNull();
  });

  it('keeps the built-in engines first with their own templates and drops bad custom ones', () => {
    const engines = normalizeEngines([
      { id: 'bing', name: 'Hacked', template: 'https://evil.example/?q=%s', keyword: 'x' },
      { id: 'ddg', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s', keyword: 'd' },
      { id: 'bad', name: 'Bad', template: 'http://insecure/?q=%s', keyword: 'z' },
      { id: 'clash', name: 'Clash', template: 'https://c.example/?q=%s', keyword: 'g' },
      'junk',
      null,
    ]);
    expect(engines.map((e) => e.id)).toEqual(['bing', 'google', 'ddg']);
    expect(engines[0]).toMatchObject({
      name: '必应',
      template: 'https://www.bing.com/search?q=%s',
      keyword: 'x',
      builtin: true,
    });
  });

  it('falls back to the built-ins for anything unreadable', () => {
    expect(normalizeEngines(undefined)).toEqual(builtinEngines());
    expect(normalizeEngines('x')).toEqual(builtinEngines());
  });

  it('builds search addresses with the query encoded', () => {
    expect(searchUrl(builtinEngines()[1] as never, 'a b&c')).toBe(
      'https://www.google.com/search?q=a%20b%26c',
    );
  });
});

describe('site preferences', () => {
  it('default to enabled, with Bing, cards and pinned sites shown', () => {
    expect(normalizeSitesPreferences(undefined)).toEqual(defaultSitesPreferences);
    expect(normalizePreferences({}).sites.enabled).toBe(true);
  });

  it('keep valid choices and repair invalid ones', () => {
    const value = normalizeSitesPreferences({
      enabled: false,
      engine: 'nope',
      view: 'list',
      showPinned: 'yes',
    });
    expect(value).toMatchObject({ enabled: false, engine: 'bing', view: 'list', showPinned: true });
    expect(normalizeSitesPreferences({ engine: 'google' }).engine).toBe('google');
  });

  it('survive the shell preference round trip', () => {
    const stored = normalizePreferences({ sites: { enabled: false, view: 'list' } });
    expect(normalizePreferences(JSON.parse(JSON.stringify(stored))).sites).toEqual(stored.sites);
  });
});

describe('labels and marks', () => {
  it('accepts preset names and #rrggbb only', () => {
    expect(isGroupColor('blue') && isGroupColor('#12ab9F')).toBe(true);
    expect(isGroupColor('chartreuse') || isGroupColor('#12345') || isGroupColor('red;x')).toBe(
      false,
    );
    expect(colorValue('blue')).toBe('var(--lg-label-blue)');
    expect(colorValue('#12ab9f')).toBe('#12ab9f');
    expect(colorValue('url(x)')).toBe('var(--lg-label-gray)');
  });

  it('marks a site with its first letter or Chinese character', () => {
    expect(letterMark('vite')).toBe('V');
    expect(letterMark('  少数派')).toBe('少');
    expect(letterMark('…')).toBe('?');
    expect(hostKey('https://www.Example.com:8080/a')).toBe('example.com');
  });
});

describe('catalog', () => {
  const groups = [
    group('dev', '开发', null, 1),
    group('docs', '文档', 'dev'),
    group('read', '阅读', null, 2),
  ];
  const items = [
    site('a', 'Vite', 'https://vitejs.dev/', 'dev', { pinned: true, description: '前端构建工具' }),
    site('b', 'MDN', 'https://developer.mozilla.org/', 'docs'),
    site('c', 'HN', 'https://news.ycombinator.com/', 'read'),
    site('d', 'Loose', 'https://loose.dev/', null),
  ];
  const catalog = new SiteCatalog(snapshot(groups, items));

  it('builds one level of tree and counts a group with its children', () => {
    expect(catalog.roots.map((g) => g.id)).toEqual(['dev', 'read']);
    expect(catalog.children('dev').map((g) => g.id)).toEqual(['docs']);
    expect(catalog.count('dev')).toBe(2);
    expect(catalog.count('read')).toBe(1);
    expect(catalog.ungrouped.map((s) => s.id)).toEqual(['d']);
    expect(catalog.pathOf('docs')).toBe('开发 / 文档');
    expect(catalog.pathOf(null)).toBe('未分组');
  });

  it('lists what each scope shows, recent ones in the given order', () => {
    expect(catalog.of({ kind: 'pinned' }, []).map((s) => s.id)).toEqual(['a']);
    expect(catalog.of({ kind: 'none' }, []).map((s) => s.id)).toEqual(['d']);
    expect(catalog.of({ kind: 'recent' }, ['c', 'gone', 'a']).map((s) => s.id)).toEqual(['c', 'a']);
    expect(catalog.of({ kind: 'group', id: 'dev' }, []).map((s) => s.id)).toEqual(['a']);
    expect(catalog.tree('dev').map((t) => [t.group.id, t.items.map((s) => s.id)])).toEqual([
      ['dev', ['a']],
      ['docs', ['b']],
    ]);
  });

  it('finds saved sites by every word, title matches first', () => {
    expect(searchSites(items, 'vite').map((s) => s.id)).toEqual(['a']);
    expect(searchSites(items, '前端 工具').map((s) => s.id)).toEqual(['a']);
    expect(searchSites(items, 'mozilla').map((s) => s.id)).toEqual(['b']);
    expect(searchSites(items, 'vite nothing')).toEqual([]);
    expect(searchSites(items, '   ')).toEqual([]);
    expect(searchSites(items, 'dev', 1)).toHaveLength(1);
    const ranked = searchSites(
      [
        site('x', 'About dev', 'https://a.example/', null),
        site('y', 'Dev tools', 'https://b.example/', null),
      ],
      'dev',
    );
    expect(ranked.map((s) => s.id)).toEqual(['y', 'x']);
  });
});
