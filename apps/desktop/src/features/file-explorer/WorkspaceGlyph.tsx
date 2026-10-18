import { ShellGlyph } from '../../components/ShellGlyph.js';

const names = {
  folder: 'folder',
  folderOpen: 'folder',
  folderOutline: 'folderOutline',
  file: 'file',
  chevron: 'treeRight',
  close: 'close',
} as const;

export function WorkspaceGlyph({ name }: { name: keyof typeof names }) {
  return (
    <ShellGlyph
      name={names[name]}
      className={`workspace-glyph workspace-glyph-${name}`}
      {...(name === 'chevron' ? { expandedName: 'treeDown' } : {})}
    />
  );
}
