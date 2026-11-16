/** A search engine the site navigation search box can hand a query to. */
export interface SearchEngine {
  id: string;
  name: string;
  /** An https address with one `%s` where the query goes. */
  template: string;
  /** Typed first (`g query`), it picks this engine for that one search. */
  keyword: string;
  builtin: boolean;
}

export const builtinEngines = (): SearchEngine[] => [
  {
    id: 'bing',
    name: '必应',
    template: 'https://www.bing.com/search?q=%s',
    keyword: 'b',
    builtin: true,
  },
  {
    id: 'google',
    name: 'Google',
    template: 'https://www.google.com/search?q=%s',
    keyword: 'g',
    builtin: true,
  },
];

export const MAX_ENGINES = 12;

/** `null` when the template is acceptable; otherwise the reason. */
export function templateProblem(template: string): string | null {
  const text = template.trim();
  if (text.length > 512) return '地址过长';
  if ((text.match(/%s/g) ?? []).length !== 1) return '地址必须恰好包含一个 %s';
  let url: URL;
  try {
    url = new URL(text.replace('%s', 'x'));
  } catch {
    return '地址格式不正确';
  }
  if (url.protocol !== 'https:') return '搜索地址必须以 https:// 开头';
  if (url.username || url.password) return '地址不能包含用户名或密码';
  return null;
}

export const keywordProblem = (keyword: string, others: readonly string[]): string | null =>
  !/^[a-z0-9]{1,8}$/.test(keyword)
    ? '关键词只能是 1–8 位小写字母或数字'
    : others.includes(keyword)
      ? '关键词已被其他引擎使用'
      : null;

/**
 * Built-in engines always come first and keep their templates; only their keyword may differ.
 * Custom ones that fail validation are dropped rather than carried into a search.
 */
export function normalizeEngines(value: unknown): SearchEngine[] {
  const saved = Array.isArray(value) ? value : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of saved)
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string')
      byId.set((item as { id: string }).id, item as Record<string, unknown>);
  const result: SearchEngine[] = [];
  const keywords: string[] = [];
  const take = (engine: SearchEngine) => {
    result.push(engine);
    keywords.push(engine.keyword);
  };
  for (const builtin of builtinEngines()) {
    const keyword = byId.get(builtin.id)?.keyword;
    take({
      ...builtin,
      keyword:
        typeof keyword === 'string' && !keywordProblem(keyword, keywords)
          ? keyword
          : builtin.keyword,
    });
  }
  for (const item of saved) {
    if (result.length >= MAX_ENGINES) break;
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (
      typeof e.id !== 'string' ||
      !/^[a-z0-9-]{1,32}$/.test(e.id) ||
      result.some((r) => r.id === e.id) ||
      typeof e.name !== 'string' ||
      !e.name.trim() ||
      typeof e.template !== 'string' ||
      templateProblem(e.template) ||
      typeof e.keyword !== 'string' ||
      keywordProblem(e.keyword, keywords)
    )
      continue;
    take({
      id: e.id,
      name: e.name.trim().slice(0, 24),
      template: e.template.trim(),
      keyword: e.keyword,
      builtin: false,
    });
  }
  return result;
}

export const searchUrl = (engine: SearchEngine, query: string) =>
  engine.template.replace('%s', encodeURIComponent(query));
