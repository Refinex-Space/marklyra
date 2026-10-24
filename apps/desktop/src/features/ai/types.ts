export interface AgentProfile {
  id: string;
  agentId: string;
  name: string;
  executable: string;
  args: string[];
  env: Record<string, string>;
  secretKeys: string[];
  version: string | null;
  managedPath: string | null;
  mcpEnabled: boolean;
  enabled: boolean;
}
export interface AgentCatalog {
  attentionEnabled?: boolean;
  agents: {
    id: string;
    name: string;
    version: string;
    description: string;
    license: string;
    license_url: string;
    website?: string;
    repository?: string;
    distribution: { npx?: { package: string }; binary?: Record<string, unknown> };
  }[];
  profiles: AgentProfile[];
  localAgents: { agentId: string; executable: string; args: string[] }[];
  digest: string;
  platform: string;
  defaultProfileId: string | null;
}
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  digest: string;
}
export interface DraftAttachment extends Attachment {
  data: string;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'thought' | 'tool' | 'plan' | 'notice';
  text: string;
  turnId: string;
  references?: string[];
  createdAt?: number;
  completedAt?: number;
  attachments?: Attachment[];
  tool?: Record<string, unknown>;
}
export interface SessionRecord {
  id: string;
  profileId: string;
  agentId: string;
  agentName: string;
  rootPath: string;
  providerSessionId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  messages: Message[];
}
export interface Interaction {
  id: string;
  kind: 'permission' | 'operation' | 'form';
  title: string;
  detail: string;
  preview?: string;
  options: { id: string; name: string; allow: boolean }[];
  schema?: Record<string, unknown>;
}
export interface SessionView {
  promptCapabilities: { image: boolean; embeddedContext: boolean };
  record: SessionRecord;
  phase:
    | 'idle'
    | 'connecting'
    | 'configuring'
    | 'auth'
    | 'ready'
    | 'running'
    | 'cancelling'
    | 'disconnected';
  error: string | null;
  authMethods: { id: string; name: string; description?: string; type?: string }[];
  interactions: Interaction[];
  configOptions: {
    id: string;
    name: string;
    currentValue: string;
    options: { value: string; name: string }[];
  }[];
  modes: { currentModeId: string; availableModes: { id: string; name: string }[] } | null;
  usage: { used: number; size: number } | null;
  commands: { name: string; description: string }[];
}
export interface RpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}
export interface AgentEvent {
  connectionId: string;
  kind: 'message' | 'closed' | 'tool' | 'interaction-ended';
  message?: RpcMessage;
  error?: string;
  requestId?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  context?: { turnId: string };
}
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
