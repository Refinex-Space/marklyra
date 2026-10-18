import type {
  DraftContent,
  FallbackImport,
  RecoveryCheckpoint,
  RecoveryDraft,
  RecoveryLease,
  RecoveryReceipt,
} from '../../apps/desktop/src/services/recovery.js';
import type { MockCall, TestWindow } from './desktop.helpers.js';

export type RecoveryMockCommand =
  | 'fallback_recovery_context'
  | 'import_fallback_recovery'
  | 'begin_recovery_session'
  | 'checkpoint_recovery'
  | 'list_recovery_drafts'
  | 'read_recovery_draft'
  | 'consume_recovery_draft'
  | 'end_recovery_session';
export type RecoveryMockRecord = RecoveryDraft & { active: boolean };
export interface RecoveryMock {
  records: Record<string, RecoveryMockRecord>;
  calls: MockCall[];
  fail: Partial<Record<RecoveryMockCommand, string>>;
  defer: Partial<Record<RecoveryMockCommand, boolean>>;
  pending: MockCall[];
  issues: { file: string; reason: string }[];
  loseCheckpointReplyOnce: boolean;
  seed(content: DraftContent, options?: { id?: string; version?: number }): string;
  release(command: RecoveryMockCommand, index?: number): void;
}
export type RecoveryMockWindow = TestWindow & { __recoveryMock: RecoveryMock };

/** Test-only IPC double. Its own localStorage simulates a Rust store surviving
 * process restart; it is not the product's old marklyra-draft localStorage. */
export function installRecoveryMock() {
  if (window !== window.top) return;
  const target = window as RecoveryMockWindow;
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internals.invoke;
  const key = '__test_recovery_store_v1';
  const persisted = JSON.parse(localStorage.getItem(key) ?? '{"records":{},"serial":0}') as {
    records: Record<string, RecoveryMockRecord>;
    serial: number;
  };
  let serial = persisted.serial;
  const records = persisted.records;
  const owner = crypto.randomUUID();
  const imports = JSON.parse(localStorage.getItem('__test_fallback_imports_v1') ?? '{}') as Record<
    string,
    { request: FallbackImport; id: string }
  >;

  for (const record of Object.values(records)) record.active = false;
  type Request = Omit<RecoveryCheckpoint, 'version'>;
  const sessions = new Map<string, RecoveryLease & { last?: Request; receipt?: RecoveryReceipt }>();
  const deferred: { call: MockCall; run(): void }[] = [];
  const persist = () => localStorage.setItem(key, JSON.stringify({ records, serial }));
  const mock: RecoveryMock = {
    records,
    calls: [],
    fail: {},
    defer: {},
    pending: [],
    issues: [],
    loseCheckpointReplyOnce: false,
    seed(content, options = {}) {
      const id = options.id ?? `recovery-${++serial}`;
      records[id] = {
        ...structuredClone(content),
        id,
        version: options.version ?? 1,
        sequence: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: false,
      };
      persist();
      return id;
    },
    release(command, index = 0) {
      const entry = deferred.filter((entry) => entry.call.command === command)[index];
      if (!entry) throw new Error(`No deferred recovery command: ${command}`);
      deferred.splice(deferred.indexOf(entry), 1);
      this.pending = deferred.map((entry) => entry.call);
      entry.run();
    },
  };
  target.__recoveryMock = mock;
  const execute = (command: RecoveryMockCommand, args: Record<string, unknown>): unknown => {
    if (mock.fail[command]) throw new Error(mock.fail[command]);
    if (command === 'fallback_recovery_context')
      return { owner, activeOwners: [owner], activeLabels: ['main'] };
    if (command === 'import_fallback_recovery') {
      const request = args.fallback as FallbackImport;
      if (request.owner === owner || request.legacyLabel === 'main')
        throw new Error('活动窗口副本不能导入');
      const key = `${request.id}:${request.version}`;
      const old = imports[key];
      if (old && JSON.stringify(old.request) !== JSON.stringify(request))
        throw new Error('恢复副本版本不匹配');
      const id = old?.id ?? mock.seed(request.content);
      imports[key] = { request: structuredClone(request), id };
      localStorage.setItem('__test_fallback_imports_v1', JSON.stringify(imports));
      return {
        id,
        version: records[id]?.version ?? 2,
        updatedAt: Date.now(),
        available: !!records[id],
      };
    }
    if (command === 'begin_recovery_session') {
      const lease = { id: `recovery-${++serial}`, lease: `lease-${serial}`, version: 0 };
      sessions.set(lease.id, { ...lease });
      persist();
      return lease;
    }
    if (command === 'checkpoint_recovery') {
      const request = args.checkpoint as Request;
      const session = sessions.get(request.id);
      if (!session || session.lease !== request.lease) throw new Error('恢复会话已失效');
      if (session.last && JSON.stringify(session.last) === JSON.stringify(request))
        return structuredClone(session.receipt);
      if (
        session.version !== request.expectedVersion ||
        request.sequence <= (session.last?.sequence ?? 0)
      )
        throw new Error('恢复记录版本已改变');
      if (
        request.document &&
        !['UTF-8', 'UTF-8 BOM', 'UTF-16LE BOM', 'UTF-16BE BOM'].includes(request.document.encoding)
      )
        throw new Error('恢复记录编码无效');
      const old = records[request.id];
      const receipt = { id: request.id, version: session.version + 1, updatedAt: Date.now() };
      records[request.id] = {
        id: request.id,
        version: receipt.version,
        updatedAt: receipt.updatedAt,
        createdAt: old?.createdAt ?? receipt.updatedAt,
        sequence: request.sequence,
        text: request.text,
        savedText: request.savedText,
        document: structuredClone(request.document),
        selection: structuredClone(request.selection),
        active: true,
      };
      session.version = receipt.version;
      session.last = structuredClone(request);
      session.receipt = receipt;
      persist();
      if (mock.loseCheckpointReplyOnce) {
        mock.loseCheckpointReplyOnce = false;
        throw new Error('模拟：已落盘但 IPC 回复丢失');
      }
      return receipt;
    }
    if (command === 'list_recovery_drafts')
      return {
        drafts: Object.values(records)
          .filter((record) => record.text !== record.savedText)
          .map((record) => ({
            id: record.id,
            version: record.version,
            updatedAt: record.updatedAt,
            textBytes: new TextEncoder().encode(record.text).length,
            document: record.document,
            active: record.active,
          })),
        savedCopies: Object.values(records)
          .filter((record) => record.text === record.savedText)
          .map((record) => ({
            id: record.id,
            version: record.version,
            updatedAt: record.updatedAt,
            textBytes: new TextEncoder().encode(record.text).length,
            document: record.document,
            active: record.active,
          })),
        issues: mock.issues,
      };
    const id = String(args.id),
      record = records[id],
      session = sessions.get(id);
    if (command === 'end_recovery_session') {
      if (!session || session.lease !== args.lease) throw new Error('恢复会话已失效');
      sessions.delete(id);
      if (record) record.active = false;
      persist();
      return null;
    }
    if (
      command === 'consume_recovery_draft' &&
      !record &&
      session?.version === 0 &&
      args.version === 0 &&
      args.lease === session.lease
    ) {
      sessions.delete(id);
      return null;
    }
    if (!record) throw new Error('恢复记录不存在或已消费');
    if (args.version !== record.version) throw new Error('恢复记录版本已改变');
    if (command === 'read_recovery_draft') {
      const { active: _active, ...draft } = record;
      return structuredClone(draft);
    }
    if (session ? session.lease !== args.lease : args.lease != null)
      throw new Error('恢复会话已失效');
    delete records[id];
    sessions.delete(id);
    persist();
    return null;
  };
  const commands: RecoveryMockCommand[] = [
    'fallback_recovery_context',
    'import_fallback_recovery',
    'begin_recovery_session',
    'checkpoint_recovery',
    'list_recovery_drafts',
    'read_recovery_draft',
    'consume_recovery_draft',
    'end_recovery_session',
  ];
  internals.invoke = async (command, args = {}) => {
    if (!commands.includes(command as RecoveryMockCommand)) return previous(command, args);
    const call = { command, args: structuredClone(args) };
    mock.calls.push(call);
    target.__desktopMock?.calls.push(call);
    const name = command as RecoveryMockCommand;
    if (mock.defer[name])
      return new Promise((resolve, reject) => {
        deferred.push({
          call,
          run() {
            try {
              resolve(execute(name, call.args));
            } catch (error) {
              reject(error);
            }
          },
        });
        mock.pending = deferred.map((entry) => entry.call);
      });
    return execute(name, call.args);
  };
}
