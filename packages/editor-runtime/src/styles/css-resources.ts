export interface CssUrlToken {
  /** UTF-16 offsets, including the complete function and its parentheses. */
  from: number;
  to: number;
  value: string;
}

const whitespace = (value: string | undefined) => value !== undefined && /[\t\n\f\r ]/.test(value);
const nameCharacter = (value: string | undefined) =>
  value !== undefined && (/[a-z\d_-]/i.test(value) || value.charCodeAt(0) >= 128);
const nameStart = (value: string | undefined) =>
  value === '\\' || (nameCharacter(value) && !/[0-9]/.test(value ?? ''));
const malformed = (): never => {
  throw new Error('Malformed or unsupported CSS resource syntax');
};

function readEscape(css: string, from: number, string = false): { to: number; value: string } {
  let index = from + 1;
  const first = css[index];
  if (first === undefined) return malformed();
  if (/^[\n\r\f]$/.test(first)) {
    if (!string) return malformed();
    return { to: index + (first === '\r' && css[index + 1] === '\n' ? 2 : 1), value: '' };
  }
  let hex = '';
  while (hex.length < 6 && /[a-f\d]/i.test(css[index] ?? '') && index < css.length)
    hex += css[index++];
  if (hex) {
    if (whitespace(css[index])) {
      if (css[index] === '\r' && css[index + 1] === '\n') index++;
      index++;
    }
    const code = Number.parseInt(hex, 16);
    return {
      to: index,
      value: String.fromCodePoint(
        !code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code,
      ),
    };
  }
  return { to: index + 1, value: first };
}

function quoted(css: string, from: number): { to: number; value: string } {
  const quote = css[from];
  let value = '';
  for (let index = from + 1; index < css.length; ) {
    const character = css[index];
    if (character === quote) return { to: index + 1, value };
    if (character === '\\') {
      const decoded = readEscape(css, index, true);
      value += decoded.value;
      index = decoded.to;
    } else {
      if (character === undefined || /[\n\r\f]/.test(character)) return malformed();
      value += character;
      index++;
    }
  }
  return malformed();
}

function trivia(css: string, from: number): number {
  let index = from;
  while (index < css.length) {
    if (whitespace(css[index])) index++;
    else if (css.startsWith('/*', index)) {
      const end = css.indexOf('*/', index + 2);
      if (end < 0) return malformed();
      index = end + 2;
    } else break;
  }
  return index;
}

function name(css: string, from: number): { to: number; value: string } {
  let value = '';
  let index = from;
  while (index < css.length) {
    if (css[index] === '\\') {
      const decoded = readEscape(css, index);
      value += decoded.value;
      index = decoded.to;
    } else if (nameCharacter(css[index])) value += css[index++];
    else break;
  }
  return { to: index, value };
}

function url(css: string, from: number, open: number): CssUrlToken {
  let index = open + 1;
  while (whitespace(css[index])) index++;
  let value = '';
  if (css[index] === '"' || css[index] === "'") {
    const text = quoted(css, index);
    value = text.value;
    index = trivia(css, text.to);
  } else {
    while (index < css.length && css[index] !== ')') {
      const character = css[index];
      if (whitespace(character)) {
        while (whitespace(css[index])) index++;
        break;
      }
      if (character === '\\') {
        const decoded = readEscape(css, index);
        value += decoded.value;
        index = decoded.to;
      } else {
        if (
          character === undefined ||
          ['"', "'", '('].includes(character) ||
          css.startsWith('/*', index)
        )
          return malformed();
        value += character;
        index++;
      }
    }
  }
  if (
    css[index] !== ')' ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return malformed();
  return { from, to: index + 1, value };
}

/** Reads actual url function tokens, not quoted text or comments. This is a
 * bounded syntax scanner, not a CSS cascade or stylesheet validator. */
export function cssUrlTokens(css: string): CssUrlToken[] {
  const result: CssUrlToken[] = [];
  let depth = 0;
  for (let index = 0; index < css.length; ) {
    const next = trivia(css, index);
    if (next !== index) {
      index = next;
      continue;
    }
    const character = css[index];
    if (character === '"' || character === "'") {
      index = quoted(css, index).to;
      continue;
    }
    // Hash/at-keywords and numeric dimensions do not begin function tokens.
    if (
      (character === '#' || character === '@') &&
      (nameCharacter(css[index + 1]) || css[index + 1] === '\\')
    ) {
      index = name(css, index + 1).to;
      continue;
    }
    const number = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?/i.exec(css.slice(index));
    if (number) {
      index += number[0].length;
      if (nameStart(css[index])) index = name(css, index).to;
      continue;
    }
    if (nameStart(character)) {
      const identifier = name(css, index);
      if (identifier.value.toLowerCase() === 'url' && css[identifier.to] === '(') {
        const token = url(css, index, identifier.to);
        result.push(token);
        index = token.to;
      } else index = identifier.to;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')' && --depth < 0) return malformed();
    index++;
  }
  if (depth) return malformed();
  return result;
}

function closingParenthesis(css: string, open: number): number {
  let depth = 1;
  for (let index = open + 1; index < css.length; ) {
    const next = trivia(css, index);
    if (next !== index) {
      index = next;
      continue;
    }
    const character = css[index];
    if (character === '"' || character === "'") {
      index = quoted(css, index).to;
      continue;
    }
    if (character === '\\') {
      index = readEscape(css, index).to;
      continue;
    }
    if (character === '(') depth++;
    if (character === ')' && --depth === 0) return index + 1;
    index++;
  }
  return malformed();
}

/** Removes whole local() alternatives from a font src list. Kept URL/format
 * fragments retain their source representation; local-only returns empty. */
export function stripLocalFontSources(src: string): string {
  if (trivia(src, 0) === src.length) return '';
  const kept: string[] = [];
  let offset = 0;
  while (offset < src.length) {
    const start = trivia(src, offset);
    const identifier = name(src, start);
    const kind = identifier.value.toLowerCase();
    if (!['local', 'url'].includes(kind) || src[identifier.to] !== '(') return malformed();
    let end =
      kind === 'url' ? url(src, start, identifier.to).to : closingParenthesis(src, identifier.to);
    if (
      kind === 'local' &&
      trivia(src.slice(identifier.to + 1, end - 1), 0) === end - identifier.to - 2
    )
      return malformed();
    let next = trivia(src, end);
    if (kind === 'url') {
      while (src[next] !== ',' && next < src.length) {
        const suffix = name(src, next);
        if (suffix.value.toLowerCase() !== 'format' || src[suffix.to] !== '(') return malformed();
        end = closingParenthesis(src, suffix.to);
        next = trivia(src, end);
      }
      kept.push(src.slice(offset, next).trim());
    }
    if (next === src.length) break;
    if (src[next] !== ',') return malformed();
    offset = next + 1;
    if (trivia(src, offset) === src.length) return malformed();
  }
  return kept.join(', ');
}
