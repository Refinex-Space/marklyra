import { ShellGlyph } from '../../components/ShellGlyph.js';

const names = {
  folderOutline: 'folderOutline',
  file: 'file',
  close: 'close',
} as const;

export function WorkspaceGlyph({ name }: { name: keyof typeof names | 'folder' | 'folderOpen' }) {
  if (name === 'folder' || name === 'folderOpen') {
    const mask = `url(/icons/workspace/${name === 'folderOpen' ? 'folder-open' : 'folder'}.svg)`;
    return (
      <span
        className={`workspace-glyph workspace-glyph-${name} workspace-tabler-folder`}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        aria-hidden="true"
      />
    );
  }
  return <ShellGlyph name={names[name]} className={`workspace-glyph workspace-glyph-${name}`} />;
}
