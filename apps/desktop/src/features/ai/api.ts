import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sessionRecord, sessionSummary } from './history-validation.js';
import type { AgentCatalog, AgentEvent, AgentProfile } from './types.js';

export const agentApi = {
  invoke,
  events: (callback: (event: AgentEvent) => void) =>
    listen<AgentEvent>('marklyra:agent-event', (event) => callback(event.payload)),
  catalog: (refresh = false) => invoke<AgentCatalog>('agent_catalog', { refresh }),
  install: (agentId: string, catalogDigest: string) =>
    invoke<AgentProfile>('agent_install', { agentId, catalogDigest }),
  local: (agentId: string) => invoke<AgentProfile>('agent_use_local', { agentId }),
  saveProfile: (value: AgentProfile) =>
    invoke<AgentProfile>('agent_save_profile', { value, programGrant: null }),
  uninstall: (profileId: string) => invoke<void>('agent_uninstall', { profileId }),
  setSecret: (profileId: string, name: string, value: string | null) =>
    invoke<void>('agent_set_secret', { profileId, name, value }),
  history: async (rootPath: string) => {
    const value = await invoke<unknown>('agent_history', { rootPath });
    if (!Array.isArray(value)) throw new Error('会话列表无效，原始记录已保留。');
    return value.map(sessionSummary);
  },
  read: async (rootPath: string, id: string) =>
    sessionRecord(await invoke<unknown>('agent_read_session', { rootPath, id })),
  manage: (
    rootPath: string,
    id: string,
    action: 'rename' | 'archive' | 'restore' | 'delete',
    title?: string,
  ) => invoke<void>('agent_manage_session', { rootPath, id, action, title: title ?? null }),
};
