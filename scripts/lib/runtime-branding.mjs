const protectedMessage =
  /activat|licen[cs]e|trial|expir|eula|purchase|registration|serial number|copyright|trademark/i;
const protectedToken =
  /(?:[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+|(?:mailto:)?[\w.+-]+@[\w.-]+\.[a-z]{2,}|typora-[a-z0-9-]+)/gi;

/** Localized display values only. Keys, document metadata, links and vendor
 * authorization notices retain their original meaning and identity. */
export function brandDisplayText(value) {
  let end = 0;
  let result = '';
  for (const match of value.matchAll(protectedToken)) {
    result += value.slice(end, match.index).replace(/typora/gi, 'MarkLyra') + match[0];
    end = match.index + match[0].length;
  }
  return result + value.slice(end).replace(/typora/gi, 'MarkLyra');
}

export function brandLocale(source) {
  const dictionary = JSON.parse(source);
  let changes = 0;
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      if (protectedMessage.test(key) || /©|copyright|all rights reserved|版权所有/i.test(value))
        return value;
      let display = value;
      if (/auto links|recognize and highlight urls/i.test(key))
        display = display
          .replace(/https?:\/\/typora\.io/gi, 'https://example.com')
          .replace(/hi@typora\.io/gi, 'hello@example.com');
      if (/save content failed|report this|unknown error|error happened/i.test(key))
        display = display
          .replace(
            /https?:\/\/support\.typora\.io\/[^\s<>"']*/gi,
            'https://github.com/Refinex-Space/marklyra/issues',
          )
          .replace(
            /(?:mailto:)?<?hi@typora\.io>?/gi,
            'https://github.com/Refinex-Space/marklyra/issues',
          );
      const branded = brandDisplayText(display);
      if (branded !== value) changes++;
      return branded;
    }
    if (Array.isArray(value)) return value.map((entry) => visit(entry, key));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, entry]) => [name, visit(entry, name)]),
      );
    return value;
  };
  const branded = visit(dictionary);
  return { code: changes ? `${JSON.stringify(branded, null, 2)}\n` : source, changes };
}

export function brandHtmlTitle(source) {
  return source.replace(
    /(<title\b[^>]*>)([^<]*)(<\/title>)/gi,
    (_, open, title, close) => open + brandDisplayText(title) + close,
  );
}
