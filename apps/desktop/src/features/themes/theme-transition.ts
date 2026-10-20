interface ViewTransitionLike {
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
}
type StartViewTransition = (update: () => Promise<void>) => ViewTransitionLike;

/**
 * Runs `commit` — everything that changes how the window looks: the document's stylesheets, the
 * shell's appearance and its fonts — as one visual step. Where the platform has View Transitions
 * the old picture stays on screen while the new theme is prepared and the two cross-fade, so the
 * document, sidebar, titlebar and panels never show different themes at the same time. Elsewhere
 * (or with reduced motion) the commit still happens as one step, just without the fade.
 *
 * `commit` resolves to false when it was superseded; that is passed through.
 */
export async function presentThemeChange(commit: () => Promise<boolean>): Promise<boolean> {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  const animate =
    typeof start === 'function' &&
    document.visibilityState === 'visible' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate) return commit();
  let applied = false;
  const transition = start.call(document, async () => {
    applied = await commit();
  });
  // A skipped transition rejects `finished`; the commit's own error still arrives below.
  transition.finished.catch(() => {});
  await transition.updateCallbackDone;
  return applied;
}
