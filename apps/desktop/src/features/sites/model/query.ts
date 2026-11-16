import { type SearchEngine, searchUrl } from './engines.js';

export type QueryAction =
  | { kind: 'url'; url: string }
  | { kind: 'search'; engine: SearchEngine; query: string; url: string };

const DOMAIN = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}$/u;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^\[[0-9a-f:]+\]$/i;

/** Splits `host[:port]/rest` the way a person types it. */
function splitAddress(text: string) {
  const end = text.search(/[/?#]/);
  const authority = end < 0 ? text : text.slice(0, end);
  const rest = end < 0 ? '' : text.slice(end);
  const colon = authority.lastIndexOf(':');
  const hasPort =
    colon > 0 && !authority.endsWith(']') && /^\d{1,5}$/.test(authority.slice(colon + 1));
  return { host: hasPort ? authority.slice(0, colon) : authority, rest };
}

/**
 * Turns what was typed into an address when it is one. Anything with a scheme other than
 * http(s), a space, or no dot-separated host is a search, never an address.
 */
export function addressOf(raw: string): string | null {
  const text = raw.trim();
  if (
    !text ||
    /\s/.test(text) ||
    [...text].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  )
    return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      return url.username || url.password || !url.hostname ? null : url.href;
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/?#]*:\d+(?:[/?#]|$)/.test(text)) return null;
  const { host } = splitAddress(text);
  const local = host.toLowerCase() === 'localhost' || IPV4.test(host) || IPV6.test(host);
  if (!local && !DOMAIN.test(host)) return null;
  if (IPV4.test(host) && host.split('.').some((part) => Number(part) > 255)) return null;
  // Local and private hosts rarely serve TLS; everything else defaults to https.
  const plain =
    local ||
    /^(?:10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(host);
  try {
    const url = new URL(`${plain ? 'http' : 'https'}://${text}`);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}

/**
 * What Enter does with the search box text: open an address, or search with an engine.
 * `keyword query` selects that engine for this search only; `forceSearch` skips address detection.
 */
export function classifyQuery(
  raw: string,
  engines: readonly SearchEngine[],
  current: SearchEngine,
  forceSearch = false,
): QueryAction | null {
  const text = raw.trim();
  if (!text) return null;
  const keyword = /^(\S+)\s+(\S[\s\S]*)$/.exec(text);
  const picked = keyword ? engines.find((e) => e.keyword === keyword[1]) : undefined;
  if (picked && keyword) {
    const query = keyword[2]?.trim() ?? '';
    return { kind: 'search', engine: picked, query, url: searchUrl(picked, query) };
  }
  if (!forceSearch) {
    const url = addressOf(text);
    if (url) return { kind: 'url', url };
  }
  return { kind: 'search', engine: current, query: text, url: searchUrl(current, text) };
}
