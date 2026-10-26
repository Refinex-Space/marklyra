import type { MarkLyraEditor } from '@marklyra/editor-runtime';

/** Give an untouched foreground window its first input owner. */
export async function focusInitialEditor(
  editor: MarkLyraEditor,
  allowed: () => boolean,
  loadingControl: () => HTMLElement | null,
  foreground: () => Promise<boolean>,
) {
  const owner = editor.element.ownerDocument;
  if (!(await foreground())) return false;
  if (!allowed()) return false;
  // A modal temporarily owns input; closing it must be able to retry the initial
  // handoff. A connected Shell control below is an actual user focus choice.
  if (owner.querySelector('[role="dialog"]')) return false;
  const active = owner.activeElement;
  if (active !== owner.body && active !== owner.documentElement && active !== editor.element)
    return true;
  // The iframe can focus itself while loading. Preserve a Shell control
  // chosen before its ready message, rather than considering that iframe unowned.
  const priorControl = loadingControl();
  if (priorControl?.isConnected) {
    priorControl.focus();
    return true;
  }
  let chosenControl: HTMLElement | null = null;
  const rememberControl = (event: FocusEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target !== owner.body &&
      target !== owner.documentElement &&
      target !== editor.element
    )
      chosenControl = target;
  };
  owner.addEventListener('focusin', rememberControl);
  try {
    // WebKit requires entering the parent browsing context before its child
    // document can accept programmatic editing focus on the first handoff.
    await editor.focus();
    // Retain the Shell target chosen while the cross-frame request was pending.
    const chosen = chosenControl as HTMLElement | null;
    if (chosen?.isConnected && (await foreground())) chosen.focus();
    return true;
  } finally {
    owner.removeEventListener('focusin', rememberControl);
  }
}
