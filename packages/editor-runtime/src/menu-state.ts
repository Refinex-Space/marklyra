/** Finite presentation facts from the active original editor; no DOM/bookmark escapes. */
export interface MarkLyraMenuState {
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  locked: boolean;
  modalOpen: boolean;
  inlineAllowed: boolean;
  blockAllowed: boolean;
  inlineStyles: readonly string[];
  blockStyles: readonly string[];
}

const inline = new Set([
  'strong',
  'em',
  'del',
  'code',
  'underline',
  'highlight',
  'subscript',
  'superscript',
  'inline_math',
  'link',
  'image',
]);
const block = new Set([
  'paragraph',
  'header1',
  'header2',
  'header3',
  'header4',
  'header5',
  'header6',
  'ul',
  'ol',
  'tasklist',
  'blockquote',
  'fences',
  'math_block',
  'table',
  'table_cell',
  'meta_block',
  'html_block',
  'def_footnote',
  'def_link',
  'hr',
  'toc',
]);
export function menuStyles(value: unknown, kind: 'inline' | 'block'): string[] {
  const allowed = kind === 'inline' ? inline : block;
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is string => typeof item === 'string' && allowed.has(item)),
        ),
      ]
    : [];
}

export function marklyraMenuState(value: unknown): MarkLyraMenuState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid editor menu state');
  const fields = value as Record<string, unknown>;
  const flags = [
    'sourceMode',
    'focusMode',
    'typewriterMode',
    'canUndo',
    'canRedo',
    'locked',
    'modalOpen',
    'inlineAllowed',
    'blockAllowed',
  ] as const;
  if (
    Object.keys(fields).length !== flags.length + 2 ||
    flags.some((key) => typeof fields[key] !== 'boolean')
  )
    throw new TypeError('Invalid editor menu flags');
  for (const key of ['inlineStyles', 'blockStyles'] as const) {
    const kind = key === 'inlineStyles' ? 'inline' : 'block';
    if (
      !Array.isArray(fields[key]) ||
      fields[key].length > 32 ||
      menuStyles(fields[key], kind).length !== fields[key].length
    )
      throw new TypeError('Invalid editor menu styles');
  }
  return {
    ...Object.fromEntries(flags.map((key) => [key, fields[key]])),
    inlineStyles: [...(fields.inlineStyles as string[])],
    blockStyles: [...(fields.blockStyles as string[])],
  } as unknown as MarkLyraMenuState;
}
