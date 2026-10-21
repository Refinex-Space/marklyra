import { useMemo } from 'react';
import {
  CheckoutRevisionDialog,
  ConfirmDialog,
  InitDialog,
  NewBranchDialog,
  RenameBranchDialog,
  ResetDialog,
  TagDialog,
} from './BranchDialogs.js';
import { BranchPopup } from './BranchPopup.js';
import { ConflictsDialog } from './ConflictsDialog.js';
import { CompareDialog, DiffDialog } from './DiffDialog.js';
import { type GitDialog, useOptionalGit } from './GitProvider.js';
import { MergeDialog } from './MergeDialog.js';
import { PushDialog } from './PushDialog.js';
import { RemoteDialog } from './RemoteDialog.js';
import './git.css';

function Dialog({ dialog, active }: { dialog: GitDialog; active: boolean }) {
  switch (dialog.kind) {
    case 'new-branch':
      return <NewBranchDialog dialog={dialog} active={active} />;
    case 'rename-branch':
      return <RenameBranchDialog name={dialog.name} active={active} />;
    case 'push':
      return <PushDialog branch={dialog.branch} active={active} />;
    case 'checkout-revision':
      return <CheckoutRevisionDialog active={active} />;
    case 'init':
      return <InitDialog active={active} />;
    case 'remote':
      return <RemoteDialog remote={dialog.remote} active={active} />;
    case 'tag':
      return <TagDialog target={dialog.target} label={dialog.label} active={active} />;
    case 'reset':
      return <ResetDialog target={dialog.target} label={dialog.label} active={active} />;
    case 'conflicts':
      return <ConflictsDialog active={active} />;
    case 'merge':
      return <MergeDialog path={dialog.path} active={active} />;
    case 'diff':
      return <DiffDialog request={dialog.request} active={active} />;
    case 'compare':
      return (
        <CompareDialog from={dialog.from} to={dialog.to} title={dialog.title} active={active} />
      );
    case 'confirm':
      return <ConfirmDialog dialog={dialog} active={active} />;
  }
}

// Each opened dialog is a new object; its key follows it while dialogs above it come and go.
const keys = new WeakMap<GitDialog, number>();
let nextKey = 1;
function dialogKey(dialog: GitDialog): number {
  let key = keys.get(dialog);
  if (key === undefined) {
    key = nextKey++;
    keys.set(dialog, key);
  }
  return key;
}

/** The branch popup and the dialog stack, mounted once at the shell level. */
export function GitOverlays() {
  const context = useOptionalGit();
  if (!context) return null;
  return (
    <>
      {context.branchPopup && <BranchPopup />}
      {context.dialogs.map((dialog, index) => (
        <Dialog
          key={dialogKey(dialog)}
          dialog={dialog}
          active={index === context.dialogs.length - 1}
        />
      ))}
    </>
  );
}

const TONES: Record<string, string> = {
  modified: 'modified',
  renamed: 'modified',
  typechange: 'modified',
  added: 'added',
  copied: 'added',
  untracked: 'untracked',
  deleted: 'deleted',
  conflicted: 'conflicted',
};
const attribute = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

/**
 * Colors changed files in the sidebar tree and article list, IDEA style. The tree marks rows with
 * `data-entry-path` (workspace-relative); one generated stylesheet avoids threading Git state
 * through the file explorer. Folders containing changes get a subtle mark.
 */
export function GitFileDecorations() {
  const context = useOptionalGit();
  const enabled = context?.preferences.fileStatus ?? false;
  const changes = context?.status?.changes;
  const prefix = context?.probe?.repository?.workspacePrefix ?? '';
  const css = useMemo(() => {
    if (!enabled || !changes?.length) return '';
    const rules: string[] = [];
    const folders = new Set<string>();
    for (const change of changes) {
      let path = change.path;
      if (prefix) {
        if (!path.startsWith(`${prefix}/`)) continue;
        path = path.slice(prefix.length + 1);
      }
      const tone = TONES[change.kind] ?? 'modified';
      const selector = `[data-entry-path=${attribute(path)}]`;
      rules.push(
        `${selector}>.workspace-tree-name,${selector} .workspace-article-name{color:var(--git-${tone})${tone === 'deleted' ? ';text-decoration:line-through' : ''}}`,
      );
      const parts = path.split('/');
      for (let index = 1; index < parts.length; index++)
        folders.add(parts.slice(0, index).join('/'));
      if (rules.length > 4000) break;
    }
    for (const folder of folders)
      rules.push(
        `[data-entry-path=${attribute(folder)}]>.workspace-tree-name{color:var(--git-folder)}`,
      );
    return rules.join('\n');
  }, [enabled, changes, prefix]);
  if (!css) return null;
  return <style data-git-decorations="">{css}</style>;
}
