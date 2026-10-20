import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { exportPreferences, sameValue } from '../../../services/export-preferences.js';
import { documentExports, type FormatCapabilities } from '../../../services/exports.js';
import {
  type CustomExportPreference,
  type ExportPathTarget,
  type ExportPreferenceChange,
  type ExportPreferencesSnapshot,
  exportPreferenceChange,
  exportPreferencesSnapshot,
  type GeneralExportPreferences,
  type HtmlExportPreferences,
  type ImageExportPreferences,
  type PandocFormatMap,
  type PdfExportPreferences,
} from '../preferences.js';

export interface GroupValues {
  'export.general': GeneralExportPreferences;
  'export.html': HtmlExportPreferences;
  'export.pdf': PdfExportPreferences;
  'export.image': ImageExportPreferences;
  'export.formats': PandocFormatMap;
  'export.custom': CustomExportPreference[];
  pandocPath: string;
}
export type Group = keyof GroupValues;

export function groupValue<K extends Group>(
  snapshot: ExportPreferencesSnapshot,
  key: K,
): GroupValues[K] {
  const values: GroupValues = {
    'export.general': snapshot.general,
    'export.html': snapshot.html,
    'export.pdf': snapshot.pdf,
    'export.image': snapshot.image,
    'export.formats': snapshot.formats,
    'export.custom': snapshot.custom,
    pandocPath: snapshot.pandocPath,
  };
  return values[key];
}
function withGroup<K extends Group>(
  snapshot: ExportPreferencesSnapshot,
  key: K,
  value: GroupValues[K],
): ExportPreferencesSnapshot {
  switch (key) {
    case 'export.general':
      return { ...snapshot, general: value as GeneralExportPreferences };
    case 'export.html':
      return { ...snapshot, html: value as HtmlExportPreferences };
    case 'export.pdf':
      return { ...snapshot, pdf: value as PdfExportPreferences };
    case 'export.image':
      return { ...snapshot, image: value as ImageExportPreferences };
    case 'export.formats':
      return { ...snapshot, formats: value as PandocFormatMap };
    case 'export.custom':
      return { ...snapshot, custom: value as CustomExportPreference[] };
    default:
      return { ...snapshot, pandocPath: value as string };
  }
}

interface Mutation {
  id: number;
  group: Group;
  apply(snapshot: ExportPreferencesSnapshot): ExportPreferencesSnapshot;
}

function reason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/^Error:\s*/, '');
}
const SAVED_VISIBLE_MS = 1600;

/**
 * One confirmed record shared with every window. Edits are functional updates applied on top of
 * the latest confirmed record; they are saved one at a time with the record's revision, so a
 * change made while another is in flight, or after a path dialog, never replays an old value.
 */
export function useExportSettings() {
  const [confirmed, setConfirmed] = useState<ExportPreferencesSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<FormatCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [, setVersion] = useState(0);
  const confirmedRef = useRef<ExportPreferencesSnapshot | null>(null);
  const mutations = useRef<Mutation[]>([]);
  const running = useRef(false);
  const blocked = useRef(false);
  const serial = useRef(0);
  const alive = useRef(true);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const accept = useCallback((snapshot: ExportPreferencesSnapshot) => {
    const current = confirmedRef.current;
    if (current && snapshot.revision < current.revision) return;
    confirmedRef.current = snapshot;
    setConfirmed(snapshot);
  }, []);
  const touch = useCallback(() => setVersion((value) => value + 1), []);

  const refreshCapabilities = useCallback(async () => {
    try {
      const value = await documentExports.capabilities();
      if (!alive.current) return;
      setCapabilities(value);
      setCapabilityError('');
    } catch (reasonValue) {
      if (alive.current) setCapabilityError(reason(reasonValue));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      accept(await exportPreferences.get());
      if (alive.current) setLoadError('');
    } catch (reasonValue) {
      if (alive.current) setLoadError(reason(reasonValue));
    }
  }, [accept]);

  useEffect(() => {
    alive.current = true;
    void load();
    void refreshCapabilities();
    let stop: (() => void) | undefined;
    void listen<unknown>('export-preferences-changed', (event) => {
      try {
        const snapshot = exportPreferencesSnapshot(event.payload);
        const current = confirmedRef.current;
        accept(snapshot);
        // Pandoc's location is part of the record; its status follows it.
        if (!current || current.pandocPath !== snapshot.pandocPath) void refreshCapabilities();
      } catch {
        void load();
      }
    }).then(
      (unlisten) => {
        if (alive.current) stop = unlisten;
        else unlisten();
      },
      () => {},
    );
    return () => {
      alive.current = false;
      clearTimeout(savedTimer.current);
      stop?.();
    };
  }, [accept, load, refreshCapabilities]);

  const finish = useCallback(() => {
    if (!alive.current) return;
    if (blocked.current) {
      setStatus('idle');
      return;
    }
    setStatus('saved');
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      if (alive.current && !running.current) setStatus('idle');
    }, SAVED_VISIBLE_MS);
  }, []);

  const pump = useCallback(async () => {
    if (running.current || blocked.current) return;
    running.current = true;
    clearTimeout(savedTimer.current);
    setStatus('saving');
    try {
      while (mutations.current.length && !blocked.current && alive.current) {
        const mutation = mutations.current[0];
        const base = confirmedRef.current;
        if (!mutation || !base) break;
        const next = groupValue(mutation.apply(base), mutation.group);
        let checked: ExportPreferenceChange;
        try {
          checked = exportPreferenceChange(mutation.group, next);
        } catch (reasonValue) {
          // A value the host would refuse never leaves the page; the control returns to the saved value.
          mutations.current.shift();
          setError(`未保存：${reason(reasonValue)}`);
          touch();
          continue;
        }
        if (sameValue(groupValue(base, mutation.group), checked.value)) {
          mutations.current.shift();
          touch();
          continue;
        }
        try {
          const result = await exportPreferences.put(base.revision, checked);
          mutations.current.shift();
          accept(result);
          setError('');
        } catch (reasonValue) {
          blocked.current = true;
          setError(`未保存：${reason(reasonValue)}`);
        }
        touch();
      }
    } finally {
      running.current = false;
      finish();
    }
  }, [accept, finish, touch]);

  const update = useCallback(
    <K extends Group>(group: K, change: (current: GroupValues[K]) => GroupValues[K]) => {
      mutations.current.push({
        id: ++serial.current,
        group,
        apply: (snapshot) => withGroup(snapshot, group, change(groupValue(snapshot, group))),
      });
      setError('');
      touch();
      void pump();
    },
    [pump, touch],
  );

  /** Re-reads the record (so the revision is current) and saves the kept edits again. */
  const retry = useCallback(async () => {
    blocked.current = false;
    setError('');
    await load();
    void pump();
  }, [load, pump]);
  /** Drops the edits that could not be saved and shows the saved record again. */
  const discard = useCallback(async () => {
    mutations.current = [];
    blocked.current = false;
    setError('');
    touch();
    await load();
    finish();
  }, [finish, load, touch]);

  const idle = useCallback(async () => {
    for (let waited = 0; running.current && waited < 15_000; waited += 25)
      await new Promise((resolve) => setTimeout(resolve, 25));
  }, []);

  /** A native dialog whose answer the host stores itself (folder, reference document, template). */
  const choosePath = useCallback(
    async (target: ExportPathTarget): Promise<boolean> => {
      await idle();
      const base = confirmedRef.current;
      if (!base) return false;
      try {
        const next = await documentExports.choosePath(base.revision, target);
        if (!next) return false;
        accept(exportPreferencesSnapshot(next));
        setError('');
        touch();
        return true;
      } catch (reasonValue) {
        setError(`未保存：${reason(reasonValue)}`);
        return false;
      }
    },
    [accept, idle, touch],
  );
  const choosePandoc = useCallback(async () => {
    await idle();
    const base = confirmedRef.current;
    if (!base) return;
    try {
      const next = await documentExports.choosePandoc(base.revision);
      if (next) {
        accept(exportPreferencesSnapshot(next));
        setError('');
        await refreshCapabilities();
      }
    } catch (reasonValue) {
      setError(`未保存：${reason(reasonValue)}`);
      await refreshCapabilities();
    }
  }, [accept, idle, refreshCapabilities]);

  // Edits live in a ref; the `version` state re-renders so the view folds them over the record.
  const view = confirmed
    ? mutations.current.reduce((snapshot, mutation) => mutation.apply(snapshot), confirmed)
    : null;

  return {
    /** The record with unsaved edits applied. */
    view,
    confirmed,
    capabilities,
    capabilityError,
    loadError,
    error,
    status,
    update,
    retry,
    discard,
    choosePath,
    choosePandoc,
    refreshCapabilities,
    reload: load,
  };
}
export type ExportSettingsModel = ReturnType<typeof useExportSettings>;
