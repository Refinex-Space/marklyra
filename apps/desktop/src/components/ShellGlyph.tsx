import './shell-glyph.css';

// Observed font-family/codepoint metadata only. Font bytes are private build inputs.
const glyphs = {
  folder: ['MarkLyra FontAwesome', '\uf07b'],
  folderOutline: ['MarkLyra FontAwesome', '\uf114'],
  file: ['MarkLyra FontAwesome', '\uf0f6'],
  treeRight: ['MarkLyra FontAwesome', '\uf0da'],
  treeDown: ['MarkLyra FontAwesome', '\uf0d7'],
  outlineRight: ['MarkLyra Ionicons', '\uf125'],
  outlineDown: ['MarkLyra Ionicons', '\uf123'],
  search: ['MarkLyra Ionicons', '\uf1d9'],
  outline: ['MarkLyra Icons', '\ue902'],
  tree: ['MarkLyra Icons', '\ue904'],
  articles: ['MarkLyra Icons', '\ue900'],
  back: ['MarkLyra Icons', '\ue920'],
  add: ['MarkLyra Icons', '\ue90f'],
  dots: ['MarkLyra Icons', '\ue911'],
  close: ['MarkLyra Icons', '\ue90e'],
  group: ['MarkLyra Icons', '\ue90c'],
  naturalAscending: ['MarkLyra Icons', '\ue922'],
  naturalDescending: ['MarkLyra Icons', '\ue923'],
  nameAscending: ['MarkLyra Icons', '\ue912'],
  nameDescending: ['MarkLyra Icons', '\ue910'],
  modifiedAscending: ['MarkLyra Icons', '\ue921'],
  modifiedDescending: ['MarkLyra Icons', '\ue90d'],
  createdAscending: ['MarkLyra Icons', '\ue937'],
  createdDescending: ['MarkLyra Icons', '\ue938'],
} as const;

export type ShellGlyphName = keyof typeof glyphs;

export function ShellGlyph({
  name,
  className = '',
  expandedName,
  hoverName,
}: {
  name: ShellGlyphName;
  className?: string;
  expandedName?: ShellGlyphName;
  hoverName?: ShellGlyphName;
}) {
  const [family, character] = glyphs[name];
  return (
    <span
      className={`shell-glyph ${className}`.trim()}
      data-shell-glyph={name}
      data-character={character}
      data-expanded-character={expandedName ? glyphs[expandedName][1] : undefined}
      data-hover-character={hoverName ? glyphs[hoverName][1] : undefined}
      style={{ fontFamily: family }}
      aria-hidden="true"
    />
  );
}
