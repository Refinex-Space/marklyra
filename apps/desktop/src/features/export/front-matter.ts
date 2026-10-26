/** The few front-matter fields an export can show; everything else in the block is ignored. */
export interface FrontMatterFields {
  title?: string;
  author?: string;
}

const MAX_BLOCK_LINES = 200;

function scalar(raw: string): string | undefined {
  let value = raw.trim();
  if (!value || value === '|' || value === '>' || value.startsWith('[') || value.startsWith('{'))
    return undefined;
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2)
    value = value
      .slice(1, -1)
      .replace(quote === '"' ? /\\(["\\])/g : /''/g, quote === '"' ? '$1' : "'");
  else value = value.replace(/\s+#.*$/, '').trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused.
  return value && !/[\u0000-\u001f\u007f]/.test(value) ? value.slice(0, 200) : undefined;
}

/** Reads top-level `title` and `author` scalars from a leading `---` YAML block. */
export function frontMatterFields(source: string): FrontMatterFields {
  const text = source.replace(/^\uFEFF/, '');
  if (!/^---[ \t]*\r?\n/.test(text)) return {};
  const lines = text.split(/\r?\n/).slice(1, MAX_BLOCK_LINES);
  const fields: FrontMatterFields = {};
  for (const line of lines) {
    if (/^(?:---|\.\.\.)[ \t]*$/.test(line)) return fields;
    const match = /^(title|author)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] as keyof FrontMatterFields;
    const value = scalar(match[2] ?? '');
    if (value !== undefined && fields[key] === undefined) fields[key] = value;
  }
  // An unterminated block is not front matter.
  return {};
}

/** A file name without its extension, for use as a document title. */
export function titleFromName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
