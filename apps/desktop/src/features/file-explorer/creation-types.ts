import type { CreatedWorkspaceEntry } from '../../services/workspaces.js';

export type CreationKind = 'file' | 'directory';
export type CreationView = 'tree' | 'articles';
export interface WorkspaceCreationState {
  workspaceId: string;
  parentRelativePath: string;
  view: CreationView;
  kind: CreationKind;
  phase:
    | 'creating'
    | 'opening'
    | 'inspecting'
    | 'resolving'
    | 'naming'
    | 'renaming'
    | 'finishing'
    | 'failed';
  entry?: CreatedWorkspaceEntry;
  error: string;
}
export interface CreationEditor {
  state: WorkspaceCreationState | null;
  commit(name: string): Promise<void>;
  finish(): Promise<void>;
  retryResolution?(): Promise<void>;
  retryPrepared?: (() => Promise<void>) | undefined;
  registerInput?(entryToken: string, input: HTMLInputElement | null): void;
}
export type PrepareCreatedDocument = () => Promise<
  ((workspaceId: string, relativePath: string) => Promise<void>) | undefined
>;
export function parentPath(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/');
  return separator < 0 ? '' : relativePath.slice(0, separator);
}

/** The browser input is a filename, never a path or a capability. */
export function creationName(value: string, windows: boolean): string {
  let result = '';
  for (const character of value) {
    if (character.charCodeAt(0) <= 25 || character === '/' || character === '\\') continue;
    if (windows && ':*?"<>|'.includes(character)) continue;
    result += character;
  }
  return result.trim();
}
