/** A small display lexer for common agent examples. Every token is a slice of the original. */
const keywords: Record<string, string> = {
  js: 'async await break case catch class const continue default do else export extends finally for from function if import in instanceof let new of return static switch throw try typeof var while yield',
  ts: 'abstract as declare enum implements interface keyof namespace private protected public readonly satisfies type unknown',
  python:
    'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield',
  bash: 'case do done elif else esac export fi for function if in local return then until while',
  json: '',
};
const aliases: Record<string, string> = {
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  typescript: 'ts',
  tsx: 'ts',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
};
const words = new Map(
  Object.entries(keywords).map(([lang, list]) => [
    lang,
    new Set((lang === 'ts' ? keywords.js + ' ' + list : list).split(' ')),
  ]),
);
export interface CodeToken {
  from: number;
  text: string;
  kind?: string;
}
export function codeTokens(source: string, language: string): CodeToken[] | null {
  if (source.length > 20_000) return null;
  if (language === 'diff' || language === 'patch')
    return Array.from(source.matchAll(/[^\n]*\n|[^\n]+$/g), ({ 0: text, index: from }) => ({
      from,
      text,
      kind: text.startsWith('+')
        ? 'add'
        : text.startsWith('-')
          ? 'remove'
          : text.startsWith('@@')
            ? 'keyword'
            : 'plain',
    }));
  const lang = Object.hasOwn(aliases, language) ? (aliases[language] ?? language) : language;
  const reserved = words.get(lang);
  if (!reserved) return null;
  const slashComments = lang === 'js' || lang === 'ts';
  const parts =
    /"(?:\\[\s\S]|[^"\\\r\n])*"?|'(?:\\[\s\S]|[^'\\\r\n])*'?|[a-zA-Z_$][\w$]*|\b\d+(?:\.\d+)?\b|\/\/|\/\*|#/g;
  const tokens: CodeToken[] = [];
  let at = 0;
  for (let match = parts.exec(source); match; match = parts.exec(source)) {
    const value = match[0];
    let kind: string;
    if (
      (slashComments && value === '//') ||
      ((lang === 'python' || lang === 'bash') && value === '#')
    ) {
      const end = source.indexOf('\n', parts.lastIndex);
      parts.lastIndex = end < 0 ? source.length : end;
      kind = 'comment';
    } else if (slashComments && value === '/*') {
      const end = source.indexOf('*/', parts.lastIndex);
      parts.lastIndex = end < 0 ? source.length : end + 2;
      kind = 'comment';
    } else if (value[0] === '"' || value[0] === "'") kind = 'string';
    else if (/^\d|^(?:true|false|null|undefined|True|False|None)$/.test(value)) kind = 'literal';
    else if (reserved.has(value)) kind = 'keyword';
    else continue;
    if (match.index > at) tokens.push({ from: at, text: source.slice(at, match.index) });
    tokens.push({ from: match.index, text: source.slice(match.index, parts.lastIndex), kind });
    at = parts.lastIndex;
    if (tokens.length > 2000) return null;
  }
  if (at < source.length) tokens.push({ from: at, text: source.slice(at) });
  return tokens;
}
