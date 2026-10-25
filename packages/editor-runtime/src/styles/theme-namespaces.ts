type ExistingSelector = (selector: string) => boolean;

function canonicalRole(token: string, body: boolean): string | undefined {
  const id = /^#([a-zA-Z][a-zA-Z\d_-]*)-(source|sidebar)$/.exec(token);
  if (id) return `#marklyra-${id[2]}`;
  const mirror = /^\.cm-s-([a-zA-Z][a-zA-Z\d_-]*)-default$/.exec(token);
  if (mirror) return '.cm-s-marklyra-default';
  const state = body && /^\.([a-zA-Z][a-zA-Z\d_-]*)-(export|print|sourceview-on)$/.exec(token);
  return state ? `.marklyra-${state[2]}` : undefined;
}

function bodyCompound(prefix: string): boolean {
  let context = prefix;
  for (;;) {
    const functional = /^(.*):(?:is|where|not)\([^()]*$/i.exec(context);
    if (!functional) break;
    context = functional[1] ?? '';
  }
  return /(?:^|[\s>+~,(])body(?:[.#][a-z_][\w-]*)*$/i.test(context);
}

/** Named editor roles are compatible across theme namespaces. :is keeps the
 * original match, specificity and negation semantics; unrelated tokens stay intact. */
export function editorThemeSelector(
  selector: string,
  existing: ExistingSelector = () => false,
): string {
  let result = '';
  let quote = '';
  let brackets = 0;
  for (let index = 0; index < selector.length; ) {
    const character = selector[index] ?? '';
    if (character === '\\') {
      result += selector.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (quote) {
      result += character;
      if (character === quote) quote = '';
      index++;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    if (selector.startsWith('/*', index)) {
      const end = selector.indexOf('*/', index + 2);
      const next = end < 0 ? selector.length : end + 2;
      result += selector.slice(index, next);
      index = next;
      continue;
    }
    if (character === '[') brackets++;
    if (character === ']') brackets--;
    if (!quote && !brackets) {
      // CSSOM inserts whitespace after commas. Recognize either serialization
      // so repeated reads never nest the same alias indefinitely.
      const alias = /^:is\(\s*([#.][a-z\d_-]+)\s*,\s*([#.][a-z\d_-]+)\s*\)/i.exec(
        selector.slice(index),
      );
      if (
        alias?.[1] &&
        canonicalRole(alias[1], bodyCompound(selector.slice(0, index))) === alias[2]
      ) {
        result += alias[0];
        index += alias[0].length;
        continue;
      }
      if (character === '#' || character === '.') {
        let end = index + 1;
        let escaped = false;
        while (end < selector.length) {
          const next = selector[end] ?? '';
          if (next === '\\') {
            escaped = true;
            const escapedToken = /^\\(?:[a-f\d]{1,6}\s?|.)/i.exec(selector.slice(end));
            end += escapedToken?.[0].length ?? 1;
          } else if (/[\w-]/.test(next) || next.charCodeAt(0) >= 128) end++;
          else break;
        }
        const token = selector.slice(index, end);
        const body = bodyCompound(selector.slice(0, index));
        const target = escaped ? undefined : canonicalRole(token, body);
        result +=
          target && target !== token && !existing(body ? `body${token}` : token)
            ? `:is(${token},${target})`
            : token;
        index = end;
        continue;
      }
    }
    result += character;
    index++;
  }
  return result;
}

const adapted = new WeakSet<CSSStyleSheet>();

/** Called only after the host-owned stylesheet graph has passed its load and
 * origin checks. CSS declarations, resource URLs, order and files are unchanged. */
export function adaptEditorTheme(sheet: CSSStyleSheet, verified: ReadonlySet<CSSStyleSheet>): void {
  if (!verified.has(sheet) || adapted.has(sheet)) return;
  adapted.add(sheet);
  const rules = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) adaptEditorTheme(rule.styleSheet, verified);
      } else {
        if (rule instanceof CSSStyleRule) {
          const selector = editorThemeSelector(
            rule.selectorText,
            (candidate) => document.querySelector(candidate) !== null,
          );
          if (selector !== rule.selectorText) rule.selectorText = selector;
        }
        if ('cssRules' in rule) rules((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  rules(sheet.cssRules);
}
