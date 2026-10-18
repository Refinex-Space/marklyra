import type { MarkLyraCommand, RuntimeSelection } from '../protocol.js';

/** Content commands already handled by the runtime runtime, never native bridge names. */
export type MarkLyraExtensionEditorCommand =
  | {
      type:
        | 'undo'
        | 'redo'
        | 'insertTable'
        | 'codeBlock'
        | 'mathBlock'
        | 'horizontalRule'
        | 'indent'
        | 'outdent';
    }
  | Extract<MarkLyraCommand, { type: 'insertText' | 'heading' | 'list' | 'format' }>;

export interface MarkLyraExtensionContext {
  readonly signal: AbortSignal;
  readonly isComposing: boolean;
  /** Cached source, with the same flush boundary as MarkLyraEditor.getMarkdown(). */
  getMarkdown(): string;
  /** A detached snapshot; mutating it cannot change the SDK's selection cache. */
  getSelection(): RuntimeSelection;
  onChange(listener: (source: string) => void | Promise<void>): () => void;
}

export interface MarkLyraExtensionCommandContext extends MarkLyraExtensionContext {
  execute(command: MarkLyraExtensionEditorCommand): Promise<void>;
  insertImage(blob: Blob, name?: string): Promise<void>;
}

export type MarkLyraExtensionCommandHandler = (
  context: MarkLyraExtensionCommandContext,
  input: unknown,
) => void | Promise<void>;
export type MarkLyraExtensionCleanup = () => void | Promise<void>;

export interface MarkLyraExtension {
  readonly id: string;
  /** Globally unique names, e.g. blocks.code; built-in execute() remains separate. */
  readonly commands: Readonly<Record<string, MarkLyraExtensionCommandHandler>>;
  /** Read-only setup. Content changes belong to explicit command invocations. */
  readonly setup?: (
    context: MarkLyraExtensionContext,
  ) =>
    | void
    | MarkLyraExtensionCleanup
    | Promise<void>
    | Promise<undefined | MarkLyraExtensionCleanup>;
}

export interface MarkLyraExtensionRegistration {
  readonly id: string;
  readonly ready: Promise<void>;
  /** Idempotent; releases ownership synchronously, without undoing dispatched edits. */
  dispose(): void;
}

export interface MarkLyraExtensionError {
  readonly extensionId: string;
  readonly phase: 'setup' | 'command' | 'change' | 'dispose';
  readonly commandId?: string;
  readonly error: Error;
}
