import {
  captureFindSelectionCorrection,
  installFindSelectionReplacement,
} from './find-replace-selection.js';

/** Keep the search engine and UI, but refuse replacements against an
 * invalid, pending or deliberately truncated result set. */
export function installFindReplaceGuard(panel: object): void {
  const search: unknown = Reflect.get(panel, 'doSearch');
  if (typeof search !== 'function') return;
  const input = () => document.querySelector<HTMLInputElement>('#search-panel-input');
  const zeroWidth = new WeakSet<object>();
  const zeroWidthMessage = '不支持零宽正则匹配';
  const regexEnabled = (options?: unknown) =>
    options && typeof options === 'object' && Reflect.has(options, 'useRegexp')
      ? Boolean(Reflect.get(options, 'useRegexp'))
      : Boolean(document.querySelector('#searchpanel-regexp-option-btn.active'));
  const invalid = (text: unknown, options?: unknown) => {
    if (typeof text !== 'string' || !regexEnabled(options)) return false;
    try {
      new RegExp(text, 'g');
      return false;
    } catch {
      return true;
    }
  };
  const message = (text: string, title?: string) => {
    const status = document.getElementById('search-panel-status');
    if (!status) return;
    const error = document.createElement('span');
    error.className = 'error-message';
    error.textContent = text;
    if (title) error.title = title;
    status.replaceChildren(error);
  };
  const find: unknown = Reflect.get(panel, 'findAtNode');
  if (typeof find === 'function')
    Reflect.set(panel, 'findAtNode', (...args: unknown[]) => {
      const status = args[2];
      const editor = Reflect.get(panel, 'editor') as
        | { sourceView?: { inSourceMode?: boolean; cm?: unknown } }
        | undefined;
      if (
        args[3] === true &&
        editor?.sourceView?.inSourceMode &&
        editor.sourceView.cm === args[0] &&
        status &&
        typeof status === 'object'
      ) {
        // Source CodeMirror has UTF-16 offsets, not a [cid] DOM owner. A
        // retained WYS origin would make the native comparator receive null.
        // Leave its CM cursor, hit offsets and highlight traversal unchanged.
        Reflect.set(status, 'initPosContainer', null);
      }
      const pattern: unknown =
        status && typeof status === 'object' ? Reflect.get(status, 'regexp') : null;
      if (!(pattern instanceof RegExp)) return Reflect.apply(find, panel, args);
      const descriptor = Object.getOwnPropertyDescriptor(pattern, 'exec');
      const exec = pattern.exec;
      pattern.exec = function (text) {
        const match = Reflect.apply(exec, this, [text]);
        if (match?.[0].length === 0 && status && typeof status === 'object') zeroWidth.add(status);
        return match;
      };
      try {
        return Reflect.apply(find, panel, args);
      } finally {
        if (descriptor) Object.defineProperty(pattern, 'exec', descriptor);
        else Reflect.deleteProperty(pattern, 'exec');
      }
    });
  const update: unknown = Reflect.get(panel, 'updateIndexUI');
  if (typeof update === 'function')
    Reflect.set(panel, 'updateIndexUI', (...args: unknown[]) => {
      const result = Reflect.apply(update, panel, args);
      const status: unknown = Reflect.get(panel, 'searchStatus');
      if (status && typeof status === 'object' && zeroWidth.has(status)) message(zeroWidthMessage);
      return result;
    });
  Reflect.set(panel, 'doSearch', (text?: unknown, options?: unknown) => {
    if (invalid(text ?? input()?.value, options)) {
      // Clearing through the method also cancels its pending timer and
      // removes search marks; an invalid query must never retain old hits.
      Reflect.apply(search, panel, ['']);
      message('无效的正则表达式');
      return;
    }
    return Reflect.apply(search, panel, [text, options]);
  });
  for (const name of ['replaceSelection', 'replaceAll']) {
    const replace: unknown = Reflect.get(panel, name);
    if (typeof replace !== 'function') continue;
    Reflect.set(panel, name, (...args: unknown[]) => {
      const query = input()?.value ?? '';
      if (invalid(query)) {
        Reflect.apply(search, panel, ['']);
        message('无效的正则表达式');
        return;
      }
      const status: unknown = Reflect.get(panel, 'searchStatus');
      if (!status || typeof status !== 'object') return;
      const hits: unknown = Reflect.get(status, 'hits');
      if (Reflect.get(status, 'searchText') === query && Array.isArray(hits) && !hits.length) {
        if (zeroWidth.has(status)) message(zeroWidthMessage);
        return;
      }
      if (
        Reflect.get(panel, 'searchTimer') != null ||
        Reflect.get(status, 'searchText') !== query
      ) {
        message('查找尚未完成，请稍后重试');
        return;
      }
      if (zeroWidth.has(status)) {
        message(zeroWidthMessage);
        return;
      }
      const configured: unknown = Reflect.get(panel, 'MAX_HITS_COUNT');
      const limit = typeof configured === 'number' && configured > 0 ? configured : 5_000;
      if (Array.isArray(hits) && hits.length > limit) {
        message(`${limit}+`, `匹配超过 ${limit} 项，无法替换；请缩小查找范围`);
        return;
      }
      const correct =
        name === 'replaceSelection' ? captureFindSelectionCorrection(panel) : undefined;
      const restore =
        name === 'replaceSelection'
          ? installFindSelectionReplacement(
              panel,
              document.querySelector<HTMLInputElement>('#search-panel-replace-input')?.value ?? '',
            )
          : undefined;
      try {
        const result = Reflect.apply(replace, panel, args);
        correct?.();
        return result;
      } finally {
        restore?.();
      }
    });
  }
}
