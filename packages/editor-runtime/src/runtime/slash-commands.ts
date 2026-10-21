import {
  EDITING_COMMANDS,
  type EditingCommand,
  type EditingCommandId,
} from './editing-commands.js';

/** `/`, and `、` because Chinese input methods type it on the same key. */
export const SLASH_TRIGGERS: readonly string[] = ['/', '、'];
/** A query this long is ordinary prose, not a command search. */
export const MAX_SLASH_QUERY = 24;

export interface SlashSection {
  label?: string;
  entries: EditingCommand[];
}

/** The default list stays short; less common block levels are found by searching. */
const SECTIONS: readonly { label: string; ids: readonly EditingCommandId[] }[] = [
  { label: '基础', ids: ['paragraph', 'heading1', 'heading2', 'heading3'] },
  { label: '列表', ids: ['ul', 'ol', 'tasklist', 'blockquote'] },
  { label: '插入', ids: ['table', 'codeBlock', 'mathBlock', 'hr', 'link', 'image'] },
];
const SEARCHABLE: ReadonlySet<EditingCommandId> = new Set([
  ...SECTIONS.flatMap((section) => section.ids),
  'heading4',
  'heading5',
  'heading6',
]);
const MAX_RESULTS = 10;

function score(entry: EditingCommand, query: string): number {
  const label = entry.label.toLowerCase();
  if (label === query) return 100;
  let best = label.startsWith(query) ? 90 : label.includes(query) ? 70 : 0;
  for (const keyword of entry.keywords) {
    const value = keyword.replace(/\s+/g, '');
    if (value === query) return Math.max(best, 95);
    if (value.startsWith(query)) best = Math.max(best, 80);
    else if (query.length > 1 && value.includes(query)) best = Math.max(best, 50);
  }
  return best;
}

/** Grouped defaults for an empty query; otherwise one ranked list in catalog order on ties. */
export function slashSections(
  raw: string,
  allowed: (entry: EditingCommand) => boolean = () => true,
): SlashSection[] {
  const query = raw.toLowerCase().replace(/\s+/g, '');
  if (!query)
    return SECTIONS.map((section) => ({
      label: section.label,
      entries: section.ids
        .map((id) => EDITING_COMMANDS.find((entry) => entry.id === id))
        .filter((entry): entry is EditingCommand => Boolean(entry && allowed(entry))),
    })).filter((section) => section.entries.length);
  const entries = EDITING_COMMANDS.filter((entry) => SEARCHABLE.has(entry.id) && allowed(entry))
    .map((entry, index) => ({ entry, index, score: score(entry, query) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map((match) => match.entry);
  return entries.length ? [{ entries }] : [];
}
