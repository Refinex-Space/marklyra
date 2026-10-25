import { invoke } from '@tauri-apps/api/core';
import type {
  GraphQuery,
  GraphSnapshot,
  GraphView,
  IndexStatus,
  ReferencePage,
} from '../features/knowledge-graph/model.js';
import type { WorkspaceMatchPosition } from './workspaces.js';

export interface KnowledgeSession {
  workspaceId: string;
  requestId: string;
}
const scope = (session: KnowledgeSession) => ({
  workspaceId: session.workspaceId,
  requestId: session.requestId,
});
export const knowledge = {
  open: (session: KnowledgeSession) =>
    invoke<{ key: string; status: IndexStatus }>('knowledge_open', scope(session)),
  status: (session: KnowledgeSession) => invoke<IndexStatus>('knowledge_status', scope(session)),
  snapshot: (session: KnowledgeSession, query: GraphQuery) =>
    invoke<GraphSnapshot>('knowledge_snapshot', { ...scope(session), query }),
  references: (
    session: KnowledgeSession,
    note: string,
    incoming: boolean,
    offset: number,
    destination?: string,
  ) =>
    invoke<ReferencePage>('knowledge_references', {
      ...scope(session),
      note,
      incoming,
      offset,
      destination: destination ?? null,
    }),
  active: (session: KnowledgeSession, active: boolean) =>
    invoke<void>('knowledge_active', { requestId: session.requestId, active }),
  rebuild: (session: KnowledgeSession) => invoke<void>('knowledge_rebuild', scope(session)),
  view: (session: KnowledgeSession) => invoke<GraphView | null>('knowledge_view', scope(session)),
  saveView: (session: KnowledgeSession, view: GraphView) =>
    invoke<void>('knowledge_save_view', { ...scope(session), view }),
  importView: (session: KnowledgeSession) =>
    invoke<GraphView | null>('knowledge_import_view', scope(session)),
  exportView: (session: KnowledgeSession, view: GraphView) =>
    invoke<boolean>('knowledge_export_view', { ...scope(session), view }),
  anchor: (session: KnowledgeSession, note: string, fragment: string) =>
    invoke<WorkspaceMatchPosition | null>('knowledge_anchor', {
      ...scope(session),
      note,
      fragment,
    }),
};
