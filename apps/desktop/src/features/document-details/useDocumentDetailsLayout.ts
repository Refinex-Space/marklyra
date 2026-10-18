import { useEffect, useState } from 'react';

export const documentDetailsTransitionMs = 220;

export function useDocumentDetailsLayout(open: boolean) {
  const [preferredWidth, setPreferredWidth] = useState(280);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [present, setPresent] = useState(open);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    const timer = setTimeout(
      () => setPresent(false),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : documentDetailsTransitionMs + 100,
    );
    return () => clearTimeout(timer);
  }, [open]);
  const minimum = 200;
  // Keep at least 160px for files, 220px for editing and 20px for the real scrollbar.
  const maximum = Math.max(minimum, Math.min(440, Math.floor(viewport * 0.4), viewport - 400));
  return {
    present: open || present,
    width: Math.max(minimum, Math.min(maximum, preferredWidth)),
    minimum,
    maximum,
    finishTransition: () => {
      if (!open) setPresent(false);
    },
    resize: (width: number) =>
      setPreferredWidth(Math.round(Math.max(minimum, Math.min(maximum, width)))),
  };
}
