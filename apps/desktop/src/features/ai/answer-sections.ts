/** Split only at an empty line outside fences/frontmatter. Each later slice starts with
 * that empty line, so a thematic rule cannot become document-start YAML on a reparse. */
export function answerSections(source: string) {
  const parts: { from: number; text: string }[] = [];
  let start = 0;
  let blank: number | undefined;
  let fence = '';
  let yaml = false;
  for (const line of source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    const value = line[0].replace(/[\r\n]+$/, '');
    if (line.index === 0 && value === '---') {
      yaml = true;
      continue;
    }
    if (yaml) {
      if (/^(?:---|\.\.\.)\s*$/.test(value)) yaml = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(value);
    if (fence) {
      if (marker?.[1]?.startsWith(fence) && !value.slice(marker[0].length).trim()) fence = '';
      continue;
    }
    if (!value.trim()) {
      blank ??= line.index;
      continue;
    }
    // A loose list may resume after blank lines, including an indented continuation.
    if (blank !== undefined && blank > start && !/^(?:\s|(?:[-+*]|\d+[.)])\s)/.test(value)) {
      parts.push({ from: start, text: source.slice(start, blank) });
      start = blank;
    }
    blank = undefined;
    fence = marker?.[1] ?? '';
  }
  parts.push({ from: start, text: source.slice(start) });
  return parts;
}
