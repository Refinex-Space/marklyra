import { useCallback, useEffect, useRef, useState } from 'react';
import {
  onSitesChanged,
  type SiteMutation,
  type SiteMutationResult,
  type SiteSnapshot,
  siteErrorMessage,
  sites,
} from '../../services/sites.js';
import { SiteCatalog } from './model/catalog.js';

export type SiteLoad =
  | { state: 'loading' }
  | { state: 'ready'; catalog: SiteCatalog }
  | { state: 'error'; error: string };

export interface SiteStore {
  load: SiteLoad;
  refresh(): Promise<void>;
  /** Applies a change; resolves to the host's result, or `null` after reporting the failure. */
  mutate(mutation: SiteMutation): Promise<SiteMutationResult | null>;
  /** The last write failure, cleared by the next write. */
  problem: string | null;
}

/** The workspace's sites, kept current: after our own writes and after changes on disk. */
export function useSiteStore(workspaceId: string): SiteStore {
  const [load, setLoad] = useState<SiteLoad>({ state: 'loading' });
  const [problem, setProblem] = useState<string | null>(null);
  const alive = useRef(true);
  /** Newest snapshot wins: a slow earlier read never replaces a later one. */
  const serial = useRef(0);

  const apply = useCallback((snapshot: SiteSnapshot) => {
    setLoad({ state: 'ready', catalog: new SiteCatalog(snapshot) });
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++serial.current;
    try {
      const snapshot = await sites.snapshot(workspaceId);
      if (alive.current && mine === serial.current) apply(snapshot);
    } catch (error) {
      if (alive.current && mine === serial.current)
        setLoad({ state: 'error', error: siteErrorMessage(error) });
    }
  }, [workspaceId, apply]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    let stop: (() => void) | undefined;
    let cancelled = false;
    void onSitesChanged(() => void refresh()).then(
      (unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      },
      () => {},
    );
    return () => {
      alive.current = false;
      cancelled = true;
      stop?.();
    };
  }, [refresh]);

  const mutate = useCallback(
    async (mutation: SiteMutation) => {
      setProblem(null);
      try {
        const result = await sites.mutate(workspaceId, mutation);
        await refresh();
        return result;
      } catch (error) {
        if (alive.current) setProblem(siteErrorMessage(error));
        await refresh();
        return null;
      }
    },
    [workspaceId, refresh],
  );

  return { load, refresh, mutate, problem };
}
