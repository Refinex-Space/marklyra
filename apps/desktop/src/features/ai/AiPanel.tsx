import { listen } from '@tauri-apps/api/event';
import type { ClipboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../components/Icon.js';
import { desktopAvailable } from '../../services/documents.js';
import {
  type WorkspaceDocument,
  type WorkspaceFolder,
  workspaces,
} from '../../services/workspaces.js';
import { AgentIcon } from './AgentIcon.js';
import { AgentLogin } from './AgentLogin.js';
import { AgentSessionMenu } from './AgentSessionMenu.js';
import { AttachmentRail } from './AttachmentRail.js';
import { agentApi } from './api.js';
import {
  attachmentBlocks,
  bytesFromBase64,
  forgetAttachments,
  maxAttachmentBytes,
  maxAttachments,
  prepareAttachment,
} from './attachments.js';
import { ComposerEditor, type ComposerHandle } from './ComposerEditor.js';
import { HistoryPanel } from './HistoryPanel.js';
import { type HistoryItem, removeHistory } from './history-management.js';
import { MessageActions } from './MessageActions.js';
import { MessageContent } from './MessageContent.js';
import { documentLink, encodeDocumentPath, mentionAt } from './model.js';
import { AgentSession } from './session.js';
import { conversationGroups, TurnActivity } from './TurnActivity.js';
import type { DraftAttachment } from './types.js';
import { type AgentProfile, type Interaction, object, type SessionRecord, text } from './types.js';
import './ai.css';

interface Props {
  open: boolean;
  workspace: WorkspaceFolder | null;
  currentPath: string | null;
  snapshot: () => Promise<{
    documentId: string | null;
    path: string | null;
    text: string;
    dirty: boolean;
  }>;
  openDocument: (path: string, workspaceId?: string) => void;
  beforeWrite: (path?: string) => Promise<void>;
  changed: () => void;
  settings: () => void;
  chooseFolder: () => void;
  requestAttention: () => void;
}
export function AiPanel(props: Props) {
  const [fallbackWorkspace, setFallbackWorkspace] = useState<WorkspaceFolder | null>(null);
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const workspace = props.workspace ?? fallbackWorkspace;
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [installedProfiles, setInstalledProfiles] = useState<AgentProfile[]>([]);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Omit<SessionRecord, 'messages'>[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [composerReset, setComposerReset] = useState(0);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const [managingHistory, setManagingHistory] = useState(false);
  const historyOperation = useRef(false);
  const workspaceId = useRef(workspace?.id);
  workspaceId.current = workspace?.id;
  const [references, setReferences] = useState<string[]>([]);
  const automaticReference = useRef<string | null>(null);
  const explicitReferences = useRef(new Set<string>());
  const referencesRef = useRef(references);
  referencesRef.current = references;
  const updateReferences = (update: string[] | ((current: string[]) => string[])) => {
    const previous = referencesRef.current;
    const next = typeof update === 'function' ? update(previous) : update;
    for (const path of next) if (!previous.includes(path)) explicitReferences.current.add(path);
    for (const path of previous)
      if (!next.includes(path)) {
        explicitReferences.current.delete(path);
        if (automaticReference.current === path) automaticReference.current = null;
      }
    referencesRef.current = next;
    setReferences(next);
  };

  useEffect(() => {
    if (!props.open || props.workspace) return;
    let live = true;
    void agentApi.invoke<WorkspaceFolder>('agent_prepare_scope', { workspaceId: null }).then(
      (value) => {
        if (live) setFallbackWorkspace(value);
      },
      (e) => {
        if (live) setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [props.open, props.workspace]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: switching the active document attaches its new snapshot.
  useEffect(() => {
    if (props.open) setIncludeCurrent(true);
  }, [props.open, props.currentPath]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    if (!props.open) return;
    let live = true;
    const reload = () =>
      void agentApi.catalog().then(
        (catalog) => {
          if (live) {
            setInstalledProfiles(catalog.profiles);
            setProfiles(catalog.profiles.filter((p) => p.enabled));
            const current = sessionRef.current;
            if (
              current &&
              !current.snapshot().record.messages.length &&
              !catalog.profiles.some((p) => p.id === current.profile.id && p.enabled)
            ) {
              void current.disconnect();
              sessionRef.current = null;
              setSession(null);
            }
          }
        },
        (e) => {
          if (live) setError(String(e));
        },
      );
    reload();
    window.addEventListener('marklyra-agents-changed', reload);
    const unlisten = listen('marklyra:agents-changed', reload);
    return () => {
      live = false;
      window.removeEventListener('marklyra-agents-changed', reload);
      void unlisten.then((stop) => stop());
    };
  }, [props.open]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revoke the old session whenever the workspace capability changes.
  useEffect(() => {
    setReferences([]);
    automaticReference.current = null;
    explicitReferences.current.clear();
    setHistory(null);
    setError('');
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    if (previous) void previous.disconnect();
  }, [workspace?.id]);
  useEffect(
    () => () => {
      void sessionRef.current?.disconnect();
    },
    [],
  );
  useEffect(() => {
    if (!props.open || !workspace) return;
    const relative = props.currentPath ? documentLink(props.currentPath, workspace.path) : null;
    const previous = automaticReference.current;
    automaticReference.current = relative;
    setReferences((current) => {
      const retained = current.filter(
        (path) => path !== previous || explicitReferences.current.has(path),
      );
      return relative && !retained.includes(relative) ? [...retained, relative] : retained;
    });
  }, [props.open, props.currentPath, workspace]);
  if (session)
    session.host = {
      beforeWrite: (path) => callbacks.current.beforeWrite(path),
      changed: () => callbacks.current.changed(),
      snapshot: () => callbacks.current.snapshot(),
      attention: () => callbacks.current.requestAttention(),
    };
  const ensureSession = () => {
    if (!session) throw new Error('请先选择智能体新建会话');
    return session;
  };
  useEffect(() => {
    if (!props.open || history || !session || session.workspace.id !== workspace?.id) return;
    if (!profiles.some((profile) => profile.id === session.profile.id)) return;
    if (!session.snapshot().record.archived && session.snapshot().phase === 'idle')
      void session.connect();
  }, [props.open, history, workspace, profiles, session]);
  const isBusy = () =>
    !!session && ['configuring', 'running', 'cancelling'].includes(session.snapshot().phase);
  const loadHistory = async () => {
    if (!workspace) return;
    const owner = workspace;
    await session?.flush();
    if (workspaceId.current !== owner.id) return;
    const records = await agentApi.history(owner.path);
    if (workspaceId.current === owner.id) setHistory(records);
  };
  const manage = async (
    id: string,
    action: 'archive' | 'restore' | 'delete' | 'rename',
    title?: string,
  ) => {
    if (!workspace || historyOperation.current) return false;
    if (session?.snapshot().record.id === id && isBusy()) {
      setError('请先停止当前任务，再管理此会话。');
      return false;
    }
    const owner = workspace;
    historyOperation.current = true;
    setManagingHistory(true);
    try {
      if (session?.snapshot().record.id === id) {
        await session.disconnect();
        sessionRef.current = null;
        setSession(null);
      }
      await agentApi.manage(owner.path, id, action, title);
      if (action === 'delete') forgetAttachments(id);
      const records = await agentApi.history(owner.path);
      if (workspaceId.current === owner.id) setHistory(records);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      historyOperation.current = false;
      setManagingHistory(false);
    }
  };
  const removeRecords = async (items: HistoryItem[], progress: (completed: number) => void) => {
    if (!workspace || historyOperation.current) throw new Error('请等待当前操作结束');
    const owner = workspace;
    const active = sessionRef.current;
    if (active && items.some((item) => item.id === active.snapshot().record.id) && isBusy())
      throw new Error('请先停止当前任务，再删除此会话。');
    historyOperation.current = true;
    setManagingHistory(true);
    try {
      if (active && items.some((item) => item.id === active.snapshot().record.id)) {
        await active.disconnect();
        if (sessionRef.current === active) {
          sessionRef.current = null;
          setSession(null);
        }
      }
      const result = await removeHistory(
        items,
        async (id, action) => {
          if (workspaceId.current !== owner.id) throw new Error('工作区已切换，未继续删除');
          await agentApi.manage(owner.path, id, action);
          if (action === 'delete') forgetAttachments(id);
        },
        progress,
      );
      if (workspaceId.current === owner.id) {
        setHistory(
          (current) => current?.filter((item) => !result.removed.includes(item.id)) ?? null,
        );
        try {
          const records = await agentApi.history(owner.path);
          if (workspaceId.current === owner.id) setHistory(records);
        } catch (error) {
          setError(`删除结果已保存，刷新列表失败：${String(error)}`);
        }
      }
      return result;
    } finally {
      historyOperation.current = false;
      setManagingHistory(false);
    }
  };
  const openHistory = async (id: string) => {
    if (!workspace || isBusy() || historyOperation.current) return;
    try {
      const record = await agentApi.read(workspace.path, id);
      const selected = profiles.find((p) => p.id === record.profileId) ?? {
        id: record.profileId,
        agentId: record.agentId,
        name: record.agentName,
        enabled: false,
        executable: '',
        args: [],
        env: {},
        secretKeys: [],
        version: null,
        managedPath: null,
        mcpEnabled: true,
      };
      await session?.disconnect();
      setSession(
        new AgentSession(
          selected,
          workspace,
          { beforeWrite: props.beforeWrite, changed: props.changed },
          record,
        ),
      );
      setHistory(null);
      setComposerReset((n) => n + 1);
      setReferences([]);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="ai-panel">
      <header className="ai-panel-heading">
        <fieldset className="ai-heading-actions" aria-label="AI 会话操作">
          <AgentSessionMenu
            active={props.open}
            profiles={installedProfiles}
            {...(session ? { selectedId: session.profile.id } : {})}
            canCreate={!!workspace && !managingHistory}
            create={(profile) => {
              if (!workspace || historyOperation.current) return;
              if (isBusy()) {
                setError('请先停止当前任务再新建会话。');
                return;
              }
              void session?.disconnect();
              const created = new AgentSession(profile, workspace, {
                beforeWrite: (path) => callbacks.current.beforeWrite(path),
                changed: () => callbacks.current.changed(),
                snapshot: () => callbacks.current.snapshot(),
                attention: () => callbacks.current.requestAttention(),
              });
              sessionRef.current = created;
              setSession(created);
              setComposerReset((n) => n + 1);
              setHistory(null);
              setError('');
            }}
            settings={props.settings}
          />
          <button
            type="button"
            title="历史会话"
            aria-label="AI 历史会话"
            aria-pressed={history !== null}
            disabled={managingHistory}
            onClick={() => void loadHistory().catch((e) => setError(String(e)))}
          >
            <Icon name="history" />
          </button>
          <button
            type="button"
            title="智能体设置"
            aria-label="智能体设置"
            disabled={managingHistory}
            onClick={props.settings}
          >
            <Icon name="settings" />
          </button>
        </fieldset>
      </header>
      {error && (
        <div className="ai-error" role="alert">
          {error}
          <button type="button" aria-label="关闭提示" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {history && (
        <HistoryPanel
          records={history}
          archived={archived}
          setArchived={setArchived}
          query={historyQuery}
          setQuery={setHistoryQuery}
          back={() => setHistory(null)}
          open={openHistory}
          rename={(item) => setRename({ id: item.id, title: item.title })}
          manage={manage}
          remove={removeRecords}
        />
      )}
      <div className="ai-conversation-shell" hidden={!!history} inert={!!history}>
        {session && (
          <section className="ai-session-identity" aria-label="当前会话智能体">
            <AgentIcon id={session.profile.agentId} size={18} />
            <span>{session.profile.name}</span>
            <span className="ai-workspace-name" title={workspace?.path}>
              {workspace?.name}
            </span>
          </section>
        )}
        {!workspace ? (
          <div className="ai-empty-area">
            <div className="ai-empty">
              <div className="ai-empty-heading">
                <h2>尚未打开文件夹</h2>
                <button className="ai-empty-action" type="button" onClick={props.chooseFolder}>
                  打开文件夹 <Icon name="arrowRight" />
                </button>
              </div>
              <p>在文件夹内读取、编写和整理文档。</p>
            </div>
          </div>
        ) : !profiles.length && !session ? (
          <div className="ai-empty-area">
            <div className="ai-empty">
              <div className="ai-empty-heading">
                <h2>尚未启用智能体</h2>
                <button className="ai-empty-action" type="button" onClick={props.settings}>
                  管理智能体 <Icon name="arrowRight" />
                </button>
              </div>
              <p>连接后，即可围绕文档提问、修改与写作。</p>
            </div>
          </div>
        ) : !session ? (
          <div className="ai-empty-area">
            <div className="ai-empty">
              <h2>开始新的对话</h2>
              <p>从上方「新建会话」选择智能体，开始文档协作。</p>
            </div>
          </div>
        ) : (
          <Conversation
            key={workspace.id}
            reset={composerReset}
            enabled={profiles.some((profile) => profile.id === session.profile.id)}
            session={session}
            ensureSession={ensureSession}
            workspace={workspace}
            currentPath={props.currentPath}
            includeCurrent={includeCurrent}
            setIncludeCurrent={setIncludeCurrent}
            standalone={!props.workspace}
            chooseFolder={props.chooseFolder}
            references={references}
            automaticReference={automaticReference.current}
            retainReference={(path) => explicitReferences.current.add(path)}
            releaseReference={(path) => explicitReferences.current.delete(path)}
            setReferences={updateReferences}
            openDocument={(path) => props.openDocument(path, workspace?.id)}
            report={setError}
          />
        )}
      </div>
      {rename && (
        <form
          className="ai-confirm"
          onSubmit={(e) => {
            e.preventDefault();
            void manage(rename.id, 'rename', rename.title);
            setRename(null);
          }}
        >
          <label>
            会话名称
            <input
              maxLength={120}
              value={rename.title}
              onChange={(e) => setRename({ ...rename, title: e.target.value })}
            />
          </label>
          <button type="button" onClick={() => setRename(null)}>
            取消
          </button>
          <button type="submit" disabled={!rename.title.trim()}>
            保存
          </button>
        </form>
      )}
    </div>
  );
}
const noSubscribe = () => () => {};
const emptySnapshot = () => null;
function Conversation({
  reset,
  enabled,
  session,
  ensureSession,
  workspace,
  currentPath,
  includeCurrent,
  setIncludeCurrent,
  standalone,
  chooseFolder,
  references,
  automaticReference,
  retainReference,
  releaseReference,
  setReferences,
  openDocument,
  report,
}: {
  reset: number;
  enabled: boolean;
  session: AgentSession | null;
  ensureSession: () => AgentSession;
  workspace: WorkspaceFolder;
  currentPath: string | null;
  includeCurrent: boolean;
  setIncludeCurrent: (value: boolean) => void;
  standalone: boolean;
  chooseFolder: () => void;
  references: string[];
  automaticReference: string | null;
  retainReference: (path: string) => void;
  releaseReference: (path: string) => void;
  setReferences: (update: string[] | ((current: string[]) => string[])) => void;
  openDocument: (path: string) => void;
  report: (e: string) => void;
}) {
  const state = useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.snapshot ?? emptySnapshot,
  );
  const [input, setInput] = useState('');
  const [mentionedPaths, setMentionedPaths] = useState<string[]>([]);
  const mentionPathsRef = useRef<string[]>([]);
  const syncMentions = (paths: string[]) => {
    for (const path of paths) retainReference(path);
    const removed = mentionPathsRef.current.filter((path) => !paths.includes(path));
    for (const path of removed) releaseReference(path);
    const automatic = automaticReference;
    setReferences((current) => [
      ...new Set([
        ...current.filter((path) => !removed.includes(path) || path === automatic),
        ...paths,
      ]),
    ]);
    mentionPathsRef.current = paths;
    setMentionedPaths(paths);
  };
  const [visibleMessages, setVisibleMessages] = useState(100);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const inputRef = useRef(input);
  inputRef.current = input;
  const draftEpoch = useRef(0);
  const [uploading, setUploading] = useState(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only explicit conversation navigation clears the draft, never first connection/authentication.
  useEffect(() => {
    setInput('');
    mentionPathsRef.current = [];
    setMentionedPaths([]);
    setAttachments([]);
    attachmentsRef.current = [];
    draftEpoch.current++;
    setVisibleMessages(100);
  }, [reset]);
  const [login, setLogin] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [mentionBoundary, setMentionBoundary] = useState(0);
  const [files, setFiles] = useState<WorkspaceDocument[]>([]);
  const [filesError, setFilesError] = useState('');
  const [selected, setSelected] = useState(0);
  const [sending, setSending] = useState(false);
  const textarea = useRef<ComposerHandle>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [unread, setUnread] = useState(false);
  const busy =
    sending ||
    (!!state && ['running', 'connecting', 'configuring', 'cancelling'].includes(state.phase));
  const editingLocked = false;
  const candidateMention = mentionAt(input, caret);
  const mention =
    candidateMention && candidateMention.start >= mentionBoundary ? candidateMention : null;
  const matches = mention
    ? files
        .filter((f) => f.relativePath.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 12)
    : [];
  const catalogGeneration = useRef(0);
  const refreshFiles = useCallback(() => {
    const generation = ++catalogGeneration.current;
    void workspaces.articles(workspace.id).then(
      (report) => {
        if (generation !== catalogGeneration.current) return;
        setFiles(report.entries);
        setFilesError(report.truncated ? '文件索引已达扫描上限，仅显示已索引文档。' : '');
      },
      (error) => {
        if (generation === catalogGeneration.current) setFilesError(String(error));
      },
    );
  }, [workspace.id]);
  useEffect(() => {
    refreshFiles();
    window.addEventListener('marklyra-ai-files-changed', refreshFiles);
    window.addEventListener('focus', refreshFiles);
    return () => {
      catalogGeneration.current++;
      window.removeEventListener('marklyra-ai-files-changed', refreshFiles);
      window.removeEventListener('focus', refreshFiles);
    };
  }, [refreshFiles]);
  const mentionOpen = mention !== null;
  useEffect(() => {
    if (mentionOpen) refreshFiles();
  }, [mentionOpen, refreshFiles]);
  const last = state?.record.messages.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only new streamed text or an interaction changes scroll anchoring.
  useEffect(() => {
    if (pinned.current) {
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
      setUnread(false);
    } else setUnread(true);
  }, [last?.id, last?.text, last?.attachments?.length, state?.interactions.length]);
  const add = (path: string) => {
    if (references.length >= 32 && !references.includes(path)) {
      report('最多附加 32 份文档');
      return;
    }
    if (mention) {
      textarea.current?.insertMention(path, mention.start, caret);
    }
    setSelected(0);
    textarea.current?.focus();
  };
  const submit = async () => {
    if (busy || uploading || (!input.trim() && !attachments.length) || input.length > 64_000)
      return;
    if (references.length > 32) {
      report('上下文最多附加 32 份文档，请移除部分引用。');
      return;
    }
    const message = input;
    const submittedAttachments = [...attachmentsRef.current];
    const epoch = draftEpoch.current;
    setSending(true);
    try {
      const target = ensureSession();
      const active = currentPath ? documentLink(currentPath, workspace.path) : null;
      await target.prompt(
        message,
        references,
        active && references.includes(active) ? active : null,
        includeCurrent && (currentPath ? !active || references.includes(active) : true),
        submittedAttachments,
        () => {
          if (epoch !== draftEpoch.current) return;
          if (inputRef.current === message) {
            setInput('');
            syncMentions([]);
          }
          const ids = new Set(submittedAttachments.map((item) => item.id));
          attachmentsRef.current = attachmentsRef.current.filter((item) => !ids.has(item.id));
          setAttachments(attachmentsRef.current);
        },
      );
    } catch (e) {
      report(String(e));
    } finally {
      setSending(false);
    }
  };
  useEffect(
    () => () => {
      draftEpoch.current++;
    },
    [],
  );
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    if (files.length > maxAttachments) {
      report('一次最多添加 8 个附件');
      return;
    }
    const epoch = draftEpoch.current;
    setUploading((value) => value + 1);
    try {
      const results = await Promise.allSettled(files.map(prepareAttachment));
      if (epoch !== draftEpoch.current) return;
      const next = [...attachmentsRef.current];
      const errors: string[] = [];
      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(String(result.reason));
          continue;
        }
        if (
          next.some(
            (value) => value.digest === result.value.digest && value.name === result.value.name,
          )
        )
          continue;
        if (
          next.length >= maxAttachments ||
          next.reduce((n, value) => n + value.size, 0) + result.value.size > maxAttachmentBytes
        ) {
          errors.push(`${result.value.name} 未添加：附件最多 8 个，总量不能超过 4 MiB`);
          continue;
        }
        next.push(result.value);
      }
      attachmentsRef.current = next;
      setAttachments(next);
      if (errors.length) report(errors.join('；'));
    } finally {
      setUploading((value) => Math.max(0, value - 1));
    }
  };
  const nativeDrop = useRef<(ticket: string) => void>(() => {});
  nativeDrop.current = (ticket) => {
    const epoch = draftEpoch.current;
    void agentApi
      .invoke<{ files: { name: string; base64: string }[] }>('agent_import_dropped_attachments', {
        ticket,
      })
      .then(
        (value) => {
          if (epoch === draftEpoch.current)
            void addFiles(
              value.files.map((file) => new File([bytesFromBase64(file.base64)], file.name)),
            );
        },
        (error) => report(String(error)),
      )
      .finally(() => {
        void agentApi.invoke('cancel_native_input', { ticket }).catch(() => {});
      });
  };
  useEffect(() => {
    const receive = (event: Event) => {
      const ticket = (event as CustomEvent<{ ticket?: string }>).detail?.ticket;
      if (ticket) nativeDrop.current(ticket);
    };
    window.addEventListener('marklyra-ai-native-drop', receive);
    return () => window.removeEventListener('marklyra-ai-native-drop', receive);
  }, []);
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length) {
      void addFiles(files);
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!desktopAvailable) {
      textarea.current?.insertText(text);
      return;
    }
    const epoch = draftEpoch.current,
      before = inputRef.current,
      target = event.currentTarget;
    const selection = getSelection();
    const pastePoint = { node: selection?.focusNode, offset: selection?.focusOffset };
    void agentApi
      .invoke<{ files?: { name: string; type?: string; base64: string }[]; text?: string } | null>(
        'agent_clipboard_attachments',
      )
      .then(
        (value) => {
          if (epoch !== draftEpoch.current) return;
          if (value?.files?.length) {
            void addFiles(
              value.files.map(
                (file) =>
                  new File([bytesFromBase64(file.base64)], file.name, { type: file.type ?? '' }),
              ),
            );
          } else if (
            inputRef.current === before &&
            document.activeElement === target &&
            getSelection()?.focusNode === pastePoint.node &&
            getSelection()?.focusOffset === pastePoint.offset
          ) {
            if ((value?.text ?? text) && !textarea.current?.insertText(value?.text ?? text))
              report('输入区暂不可编辑，请重试粘贴');
          } else if (value?.text ?? text) report('粘贴期间输入或焦点已变化，请重试粘贴');
        },
        (error) => {
          if (
            /尚未实现|尚未验证/.test(String(error)) &&
            text &&
            epoch === draftEpoch.current &&
            inputRef.current === before &&
            document.activeElement === target
          )
            textarea.current?.insertText(text);
          else report(String(error));
        },
      );
  };
  const renderMessage = (message: import('./types.js').Message, activity = false) => (
    <article
      key={message.id}
      className={`ai-message ai-message-${message.role}`}
      aria-label={
        message.role === 'user'
          ? '用户消息'
          : message.role === 'assistant'
            ? '智能体消息'
            : undefined
      }
    >
      {!!message.attachments?.length && (
        <AttachmentRail
          values={message.attachments}
          recordId={state?.record.id ?? ''}
          rootPath={workspace.path}
          report={report}
        />
      )}
      {message.references?.some(
        (path) => !message.text.includes(`](${encodeDocumentPath(path)})`),
      ) && (
        <div className="ai-message-references">
          {message.references
            .filter((path) => !message.text.includes(`](${encodeDocumentPath(path)})`))
            .map((path) => (
              <a
                key={path}
                href={`#document:${encodeURIComponent(path)}`}
                onClick={(e) => {
                  e.preventDefault();
                  openDocument(path);
                }}
              >
                {path.split('/').at(-1)}
              </a>
            ))}
        </div>
      )}
      <div className="ai-message-body" hidden={!message.text.trim() && message.role !== 'tool'}>
        {message.role === 'tool' ? (
          <details>
            <summary>
              {message.text}
              <span>{message.tool ? toolStatus(message.tool.status) : ''}</span>
            </summary>
            <MessageContent
              source={toolContent(message.tool)}
              root={workspace.path}
              open={openDocument}
              report={report}
            />
          </details>
        ) : (
          <>
            {message.role !== 'user' && message.role !== 'assistant' && (
              <div className="ai-message-label">
                {message.role === 'plan'
                  ? '执行计划'
                  : message.role === 'thought'
                    ? '思考过程'
                    : '状态'}
              </div>
            )}
            <MessageContent
              source={message.text}
              root={workspace.path}
              open={openDocument}
              report={report}
            />
          </>
        )}
      </div>
      {!activity && (message.role === 'user' || message.role === 'assistant') && (
        <MessageActions
          text={message.text}
          {...(message.createdAt !== undefined ? { createdAt: message.createdAt } : {})}
          report={report}
        />
      )}
    </article>
  );
  let attachmentError = '';
  if (state?.phase === 'ready') {
    try {
      attachmentBlocks(attachments, state.promptCapabilities);
    } catch (error) {
      attachmentError = String(error);
    }
  }
  return (
    <>
      {login && session && (
        <AgentLogin session={session} methodId={login} close={() => setLogin(null)} />
      )}
      <div
        className={`ai-messages${!state?.record.messages.length ? ' ai-messages-empty' : ''}`}
        role="log"
        aria-label="AI 对话"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) {
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
            if (pinned.current) setUnread(false);
          }
        }}
      >
        {!state?.record.messages.length && (
          <div className="ai-empty">
            <h2>从这篇文档开始</h2>
            <div className="ai-suggestions">
              {[
                { label: '概括要点', prompt: '概括这篇文档的要点' },
                { label: '检查结构', prompt: '检查结构并提出改进建议' },
                { label: '起草文档', prompt: '帮我起草一篇新文档' },
              ].map(({ label, prompt }) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    textarea.current?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {state && state.record.messages.length > visibleMessages && (
          <button type="button" onClick={() => setVisibleMessages((n) => n + 100)}>
            显示更早的消息
          </button>
        )}
        {conversationGroups(state?.record.messages.slice(-visibleMessages) ?? []).map((group) => (
          <div className="ai-turn" key={group.id}>
            {group.before.map((message) => renderMessage(message))}
            {!!group.activity.length && (
              <TurnActivity
                key={`${reset}:${group.id}`}
                running={
                  !!state &&
                  ['running', 'cancelling'].includes(state.phase) &&
                  group.id === state.record.messages.at(-1)?.turnId
                }
                startedAt={group.startedAt}
                completedAt={group.completedAt}
              >
                {group.activity.map((message) => renderMessage(message, true))}
              </TurnActivity>
            )}
            {group.after.map((message) => renderMessage(message))}
          </div>
        ))}
        {state?.interactions.map((interaction) => (
          <Permission
            key={interaction.id}
            value={interaction}
            decide={(choice, form) => void session?.decide(interaction.id, choice, form)}
          />
        ))}
        {state?.phase === 'auth' && (
          <div className="ai-auth">
            <strong>连接账号</strong>
            <p>由智能体完成登录；MarkLyra 不接收账号密码。</p>
            {state.authMethods.map((method) => (
              <button
                type="button"
                key={method.id}
                onClick={() => {
                  if (method.type === 'terminal') setLogin(method.id);
                  else void session?.authenticate(method.id);
                }}
              >
                {method.name}
              </button>
            ))}
          </div>
        )}
        {state?.error && (
          <div className="ai-error" role="alert">
            {state.error}
          </div>
        )}
        {state?.phase === 'disconnected' && enabled && !state.record.archived && (
          <button type="button" onClick={() => void session?.reconnect()}>
            重新连接智能体
          </button>
        )}
        {busy && (
          <p className="ai-running" role="status">
            <span />
            {state?.phase === 'cancelling'
              ? '正在停止…'
              : state?.phase === 'configuring'
                ? '正在应用智能体配置…'
                : state?.phase === 'connecting'
                  ? '正在连接智能体…'
                  : state?.interactions.length
                    ? '等待你的操作'
                    : '正在处理…'}
          </p>
        )}
      </div>
      {unread && (
        <button
          type="button"
          className="ai-jump"
          onClick={() => {
            pinned.current = true;
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
            setUnread(false);
          }}
        >
          ↓ 回到最新消息
        </button>
      )}
      {state?.record.archived ? (
        <div className="ai-composer-hint">已归档会话只读。在历史列表中恢复后可继续。</div>
      ) : !enabled ? (
        <div className="ai-composer-hint">此智能体已停用或卸载，历史仍可查看。</div>
      ) : (
        <div className="ai-composer-area">
          {standalone && (
            <div className="ai-scope-hint">
              新建内容保存在 AI 草稿。
              <button type="button" onClick={chooseFolder}>
                打开工作文件夹
              </button>
            </div>
          )}
          {includeCurrent && (!currentPath || !documentLink(currentPath, workspace.path)) && (
            <div className="ai-context">
              <span className="ai-context-chip">
                <span>{currentPath?.split(/[\\/]/).at(-1) ?? '未命名文稿'} · 当前正文</span>
                <button
                  type="button"
                  aria-label="移除当前正文上下文"
                  disabled={busy}
                  onClick={() => setIncludeCurrent(false)}
                >
                  ×
                </button>
              </span>
            </div>
          )}
          {references.length > 32 && (
            <p className="ai-error" role="alert">
              上下文最多附加 32 份文档，请移除部分引用。
            </p>
          )}
          {references.some((path) => !mentionedPaths.includes(path)) && (
            <fieldset className="ai-context" aria-label="文档上下文">
              {references
                .filter((path) => !mentionedPaths.includes(path))
                .map((path) => (
                  <span className="ai-context-chip" key={path}>
                    <a
                      href={`#document:${encodeURIComponent(path)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        openDocument(path);
                      }}
                      title={path}
                    >
                      {path.split('/').at(-1)}
                    </a>
                    <button
                      type="button"
                      aria-label={`移除上下文 ${path}`}
                      disabled={busy}
                      onClick={() => setReferences((current) => current.filter((p) => p !== path))}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </fieldset>
          )}
          <section
            aria-label="消息输入区"
            className={`ai-composer${draggingFiles ? ' ai-composer-drop' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setDraggingFiles(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDraggingFiles(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDraggingFiles(false);
              const files = [...event.dataTransfer.files];
              if (files.length) void addFiles(files);
              else textarea.current?.insertText(event.dataTransfer.getData('text/plain'));
            }}
          >
            {!!attachments.length && (
              <AttachmentRail
                values={attachments}
                recordId={state?.record.id ?? ''}
                rootPath={workspace.path}
                remove={(id) => {
                  attachmentsRef.current = attachmentsRef.current.filter(
                    (value) => value.id !== id,
                  );
                  setAttachments(attachmentsRef.current);
                }}
                report={report}
              />
            )}
            {mention && (
              <div
                id="ai-mentions"
                className="ai-mentions"
                role="listbox"
                aria-label="选择上下文文档"
              >
                {matches.map((file, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === selected}
                    id={`ai-mention-${index}`}
                    key={file.relativePath}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(file.relativePath)}
                  >
                    <span>{file.name}</span>
                    <small>{file.folderRelativePath || '根目录'}</small>
                  </button>
                ))}
                {!matches.length && <p>{filesError || '没有匹配的文档'}</p>}
              </div>
            )}
            <ComposerEditor
              ref={textarea}
              value={input}
              disabled={editingLocked}
              {...(mention && matches.length ? { activeMention: `ai-mention-${selected}` } : {})}
              change={(value, caret, boundary, paths) => {
                syncMentions(paths);
                setMentionBoundary(boundary);
                setInput(value);
                setCaret(caret);
                setSelected(0);
              }}
              paste={paste}
              open={openDocument}
              keyDown={(event) => {
                if (
                  mention &&
                  matches.length &&
                  ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)
                ) {
                  event.preventDefault();
                  if (event.key === 'ArrowDown') setSelected((selected + 1) % matches.length);
                  else if (event.key === 'ArrowUp')
                    setSelected((selected - 1 + matches.length) % matches.length);
                  else if (event.key === 'Enter') {
                    const match = matches[selected];
                    if (match) add(match.relativePath);
                  } else setCaret(0);
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="ai-composer-tools">
              <input
                ref={uploadInput}
                className="ai-file-input"
                type="file"
                multiple
                aria-label="选择附件"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  void addFiles(files);
                }}
              />
              <button
                type="button"
                title="添加图片或文件"
                aria-label="添加图片或文件"
                disabled={uploading > 0}
                onClick={() => uploadInput.current?.click()}
              >
                <Icon name="attachment" />
              </button>
              <button
                type="button"
                title="添加文档上下文"
                aria-label="添加文档上下文"
                disabled={busy}
                onClick={() => {
                  textarea.current?.insertText(' @');
                }}
              >
                @
              </button>
              <span>{uploading ? '正在添加附件…' : 'Enter 发送 · Shift Enter 换行'}</span>
              {busy ? (
                <button
                  type="button"
                  className="ai-send"
                  aria-label="停止 AI 任务"
                  title={
                    state?.phase === 'connecting'
                      ? '取消连接'
                      : state?.phase === 'cancelling'
                        ? '正在停止…'
                        : '停止生成'
                  }
                  disabled={state?.phase === 'cancelling'}
                  onClick={() => void session?.cancel()}
                >
                  {state?.phase === 'connecting' ||
                  state?.phase === 'configuring' ||
                  state?.phase === 'cancelling' ||
                  (sending && state?.phase !== 'running') ? (
                    <span className="ai-send-spinner" />
                  ) : (
                    <Icon name="stop" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="ai-send"
                  aria-label="发送 AI 消息"
                  disabled={
                    (!input.trim() && !attachments.length) ||
                    uploading > 0 ||
                    !!attachmentError ||
                    input.length > 64_000 ||
                    state?.phase !== 'ready'
                  }
                  onClick={() => void submit()}
                >
                  <Icon name="send" />
                </button>
              )}
            </div>
          </section>
          {(attachmentError || input.length > 64_000) && (
            <p className="ai-composer-error" role="alert">
              {attachmentError || '消息不能超过 64,000 个字符'}
            </p>
          )}
          {(state?.configOptions.length || state?.modes) && (
            <div className="ai-session-options">
              {state.configOptions.map((option) => (
                <SessionOption
                  key={option.id}
                  name={option.name}
                  value={option.currentValue}
                  options={option.options}
                  disabled={state.phase !== 'ready'}
                  change={(value) => void session?.setOption(option.id, value)}
                />
              ))}
              {state.modes && !state.configOptions.length && (
                <SessionOption
                  name="智能体模式"
                  value={state.modes.currentModeId}
                  options={state.modes.availableModes.map((mode) => ({
                    value: mode.id,
                    name: mode.name,
                  }))}
                  disabled={state.phase !== 'ready'}
                  change={(value) => void session?.setMode(value)}
                />
              )}
            </div>
          )}
          {state?.usage && (
            <div className="ai-composer-hint">
              上下文 {Math.round((state.usage.used / Math.max(1, state.usage.size)) * 100)}%
            </div>
          )}
        </div>
      )}
    </>
  );
}
function SessionOption({
  name,
  value,
  options,
  disabled,
  change,
}: {
  name: string;
  value: string;
  options: { value: string; name: string }[];
  disabled: boolean;
  change: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value)?.name ?? value;
  return (
    <label className="ai-session-option" title={`${name}：${selected}`}>
      <span className="ai-session-option-measure" aria-hidden="true">
        {selected}
      </span>
      <select
        aria-label={name}
        value={value}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Permission({
  value,
  decide,
}: {
  value: Interaction;
  decide: (choice: string, form?: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  return (
    <div className="ai-permission">
      <strong>{value.title}</strong>
      {value.detail && <pre>{value.detail}</pre>}
      {value.preview !== undefined && (
        <details>
          <summary>查看写入内容（最多 12,000 字符）</summary>
          <pre>{value.preview}</pre>
        </details>
      )}
      {value.schema &&
        Object.entries(object(value.schema.properties)).map(([key, raw]) => {
          const property = object(raw);
          return (
            <label key={key}>
              {text(property.title) || key}
              <input
                type={
                  property.type === 'boolean'
                    ? 'checkbox'
                    : property.type === 'number' || property.type === 'integer'
                      ? 'number'
                      : 'text'
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    [key]:
                      property.type === 'boolean'
                        ? e.target.checked
                        : property.type === 'number' || property.type === 'integer'
                          ? Number(e.target.value)
                          : e.target.value,
                  })
                }
              />
            </label>
          );
        })}
      <div>
        {value.options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={option.allow ? 'ai-primary' : ''}
            onClick={() => decide(option.id, form)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
function toolStatus(status: unknown) {
  return (
    (
      { pending: '等待中', in_progress: '进行中', completed: '完成', failed: '失败' } as Record<
        string,
        string
      >
    )[text(status)] ?? ''
  );
}
function toolContent(tool: Record<string, unknown> | undefined) {
  if (!tool) return '';
  return Array.isArray(tool.content)
    ? tool.content
        .map((raw) => {
          const item = object(raw);
          if (item.type === 'diff')
            return `\`\`\`diff\n${text(item.oldText)}\n→\n${text(item.newText)}\n\`\`\``;
          return text(object(item.content).text);
        })
        .join('\n')
    : '';
}
