import { useEffect, useRef, useState } from 'react';
import { type KnowledgeSession, knowledge } from '../../services/knowledge.js';
import type { WorkspaceFolder } from '../../services/workspaces.js';
import {
  defaultQuery,
  type GraphQuery,
  type GraphSnapshot,
  type GraphView,
  type IndexStatus,
  validView,
} from './model.js';

const pendingViews = new Map<string, GraphView>();
interface Owner extends KnowledgeSession {
  key?: string;
  alive: boolean;
  busy: boolean;
  queued: boolean;
  version: number;
  query: GraphQuery;
  saving: Promise<unknown>;
}
export function useKnowledge(workspace: WorkspaceFolder, currentPath: string | null) {
  const [query, setQuery] = useState<GraphQuery>({ ...defaultQuery, focus: currentPath });
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [data, setData] = useState<GraphSnapshot | null>(null);
  const [restored, setRestored] = useState<GraphView | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const owner = useRef<Owner | null>(null);
  const viewWritable = useRef(true);
  const queryRef = useRef(query);
  queryRef.current = query;
  const requestSnapshot = useRef<() => void>(() => {});
  // A directory identity/revision owns every pending read; late replies cannot replace another view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPath selects the initial local view; later document changes are handled by the Shell.
  useEffect(() => {
    const session: Owner = {
      workspaceId: workspace.id,
      requestId: crypto.randomUUID(),
      alive: true,
      busy: false,
      queued: false,
      version: 0,
      query: queryRef.current,
      saving: Promise.resolve(),
    };
    owner.current = session;
    setReady(false);
    setData(null);
    setStatus(null);
    setError('');
    setWarning('');
    viewWritable.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined,
      debounce: ReturnType<typeof setTimeout> | undefined;
    let lastGeneration = -1,
      lastStatus = '',
      checking = false;
    const pump = async () => {
      if (session.busy || !session.alive || document.hidden) return;
      session.busy = true;
      try {
        while (session.queued && session.alive && !document.hidden) {
          session.queued = false;
          const version = session.version,
            value = await knowledge.snapshot(session, session.query);
          if (session.alive && version === session.version) {
            setData(value);
            setError('');
          }
        }
      } catch (reason) {
        if (session.alive) setError(String(reason));
      } finally {
        session.busy = false;
      }
    };
    requestSnapshot.current = () => {
      if (!session.alive) return;
      session.query = queryRef.current;
      session.version++;
      session.queued = true;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void pump();
      }, 120);
    };
    const check = async () => {
      if (!session.alive || checking || document.hidden) return;
      checking = true;
      try {
        const next = await knowledge.status(session);
        if (!session.alive) return;
        const serialized = JSON.stringify(next);
        if (serialized !== lastStatus) {
          lastStatus = serialized;
          setStatus(next);
        }

        if ((next.generation > 0 || next.complete) && next.generation !== lastGeneration) {
          lastGeneration = next.generation;
          requestSnapshot.current();
        }
        timer = setTimeout(() => void check(), next.working ? 450 : 1200);
      } catch (reason) {
        if (session.alive) {
          setError(String(reason));
          timer = setTimeout(() => void check(), 3000);
        }
      } finally {
        checking = false;
      }
    };
    const visible = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      void knowledge.active(session, !document.hidden).catch(() => {});
      if (!document.hidden) {
        requestSnapshot.current();
        void check();
      }
    };
    document.addEventListener('visibilitychange', visible);
    void (async () => {
      try {
        const opened = await knowledge.open(session);
        if (!session.alive) {
          await knowledge.active(session, false);
          return;
        }
        session.key = opened.key;
        if (document.hidden) await knowledge.active(session, false);
        setStatus(opened.status);
        try {
          const disk = await knowledge.view(session);
          const view = pendingViews.get(opened.key) ?? disk;
          if (session.alive && view) {
            if (!validView(view)) throw new Error('图谱视图设置无效');
            const focus = view.query.focus === null ? null : (currentPath ?? view.query.focus);
            setQuery({ ...view.query, focus });
            setRestored({
              ...view,
              query: { ...view.query, focus },
              camera: focus === view.query.focus ? view.camera : null,
            });
          }
        } catch (reason) {
          if (session.alive) {
            viewWritable.current = false;
            setWarning(`视图设置未能读取，原文件已保留：${String(reason)}`);
          }
        }
        if (session.alive) {
          setReady(true);
          void check();
        }
      } catch (reason) {
        if (session.alive) setError(String(reason));
      }
    })();
    return () => {
      session.alive = false;
      if (timer) clearTimeout(timer);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener('visibilitychange', visible);
      void knowledge.active(session, false).catch(() => {});
    };
  }, [workspace.id, workspace.path, workspace.metadataRevision, revision]);
  useEffect(() => {
    queryRef.current = query;
    if (ready) requestSnapshot.current();
  }, [query, ready]);
  return {
    query,
    setQuery,
    status,
    data,
    restored,
    ready,
    error,
    warning,
    setError,
    setWarning,
    owner,
    retry: () => setRevision((v) => v + 1),
    refresh: () => {
      const session = owner.current;
      if (session?.alive) {
        setError('');
        void knowledge.rebuild(session).catch((e) => setError(String(e)));
      }
    },
    save: async (view: GraphView) => {
      const session = owner.current;
      if (!session || !viewWritable.current) return false;
      if (session.key) {
        pendingViews.set(session.key, view);
        while (pendingViews.size > 8) {
          const oldest = pendingViews.keys().next().value;
          if (oldest) pendingViews.delete(oldest);
        }
      }
      try {
        const saved = session.saving.catch(() => {}).then(() => knowledge.saveView(session, view));
        session.saving = saved;
        await saved;
        if (session.key && pendingViews.get(session.key) === view) pendingViews.delete(session.key);
        return true;
      } catch (reason) {
        if (session.alive) setWarning(`视图尚未保存：${String(reason)}`);
        return false;
      }
    },
    acceptView: () => {
      viewWritable.current = true;
      setWarning('');
    },
  };
}
