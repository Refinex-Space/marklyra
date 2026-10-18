import type { MockCall, TestWindow } from './desktop.helpers.js';

export interface IssuedNativeCommand {
  context: string;
  sequence: number;
  action: string;
  delivered: boolean;
}
export interface NativeCommandFenceMock {
  context: string | null;
  issued: number;
  registrations: string[];
  commands: IssuedNativeCommand[];
  calls: MockCall[];
  reads: { context: string; issued: number }[];
  earlyWrites: string[];
  writes: string[];
  issue(action: string): number;
  deliver(sequence: number): void;
  emit(payload: unknown): void;
}
export type NativeCommandFenceWindow = TestWindow & {
  __nativeCommandFence: NativeCommandFenceMock;
};

/** Two independent channels: issuance happens now, Tauri event delivery is held.
 * No production timeout, SDK patch, fake editor state or save retry is involved. */
export function installNativeCommandFenceMock(runtime: string) {
  if (window !== window.top) return;
  const host = window as NativeCommandFenceWindow;
  host.__desktopMock.startupBoot.document = {
    id: 'native-fence-document',
    path: '/mock/A.md',
    text: 'Alpha',
    encoding: 'UTF-8',
  };
  const internals = Reflect.get(window, '__TAURI_INTERNALS__') as {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  };
  const previous = internals.invoke;
  const mock: NativeCommandFenceMock = {
    context: null,
    issued: 0,
    registrations: [],
    commands: [],
    calls: [],
    reads: [],
    earlyWrites: [],
    writes: [],
    issue(action) {
      const sequence = ++this.issued;
      this.commands.push({
        context: this.context ?? 'legacy-unregistered',
        sequence,
        action,
        delivered: false,
      });
      return sequence;
    },
    deliver(sequence) {
      const command = this.commands.find((entry) => entry.sequence === sequence);
      if (!command || command.delivered) throw new Error('Missing held native command');
      command.delivered = true;
      // The actual pre-fence App only accepts legacy strings. New App receives
      // exactly the tagged native event; registration is not inferred from time.
      this.emit(
        this.context === null
          ? command.action
          : {
              context: command.context,
              sequence: command.sequence,
              action: command.action,
            },
      );
    },
    emit(payload) {
      host.__desktopMock.emitEvent('menu-action', payload);
    },
  };
  host.__nativeCommandFence = mock;
  internals.invoke = async (command, args = {}) => {
    if (command === 'editor_runtime_url') return runtime;
    if (command === 'register_editor_command_context') {
      mock.calls.push({ command, args });
      if (typeof args.context !== 'string' || !args.context)
        throw new Error('Invalid editor command context');
      mock.registrations.push(args.context);
      if (mock.context !== args.context) {
        mock.context = args.context;
        mock.issued = 0;
        mock.commands = [];
      }
      return { context: mock.context, issued: mock.issued };
    }
    if (command === 'editor_command_fence') {
      mock.calls.push({ command, args });
      if (typeof args.context !== 'string' || args.context !== mock.context)
        throw new Error('Retired editor command context');
      const result = { context: args.context, issued: mock.issued };
      mock.reads.push(result);
      return result;
    }
    if (command === 'save_document') {
      const text = String(args.text);
      mock.writes.push(text);
      if (mock.commands.some((entry) => !entry.delivered)) mock.earlyWrites.push(text);
    }
    return previous(command, args);
  };
}
