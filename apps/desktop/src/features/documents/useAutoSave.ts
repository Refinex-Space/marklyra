import { useEffect, useRef, useState } from 'react';
import { readAutoSavePreference } from '../settings/auto-save-preference.js';
import type { useDocumentSession } from './useDocumentSession.js';

/** Native file saves are separate from crash drafts. Never opens a picker. */
export function useAutoSave(
  session: ReturnType<typeof useDocumentSession>,
  conflict: boolean,
  nativeEnabled?: boolean,
) {
  const [localEnabled, setEnabled] = useState(readAutoSavePreference);
  const enabled = nativeEnabled ?? localEnabled;
  const latest = useRef({ session, enabled, conflict });
  latest.current = { session, enabled, conflict };
  const lastEdit = useRef(0);
  const started = useRef(0);
  const inFlight = useRef(false);
  const failedSource = useRef<string | null>(null);
  const observed = useRef({ text: session.snapshot, id: session.file?.id, enabled });
  useEffect(() => {
    try {
      if (nativeEnabled === undefined) localStorage.setItem('marklyra-autosave', String(enabled));
    } catch {
      /* Current session preference still applies. */
    }
  }, [enabled, nativeEnabled]);
  useEffect(() => {
    const previous = observed.current;
    if (previous.text !== session.snapshot) lastEdit.current = Date.now();
    if (previous.id !== session.file?.id || previous.enabled !== enabled) {
      started.current = 0;
      failedSource.current = null;
    }
    observed.current = { text: session.snapshot, id: session.file?.id, enabled };
    if (session.dirty && !started.current) started.current = lastEdit.current;
    if (!session.dirty) {
      started.current = 0;
      failedSource.current = null;
    }
  }, [session.snapshot, session.dirty, session.file?.id, enabled]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = latest.current;
      const doc = current.session;
      if (
        !current.enabled ||
        current.conflict ||
        !doc.file ||
        !doc.dirty ||
        doc.pending ||
        doc.working ||
        inFlight.current ||
        failedSource.current === doc.source.current
      )
        return;
      const now = Date.now();
      started.current ||= now;
      if (now - lastEdit.current < 2000 && now - started.current < 10_000) return;
      const attempted = doc.source.current;
      inFlight.current = true;
      void doc
        .autoSave()
        .then((outcome) => {
          if (outcome === 'failed')
            failedSource.current = doc.getAutoSaveFailureSource() ?? attempted;
          if (outcome === 'saved' || outcome === 'skipped') started.current = 0;
        })
        .finally(() => {
          inFlight.current = false;
        });
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return { enabled, setEnabled };
}
