/** The project last shown in each workspace's task workbench; text turned into a task from a
 * note lands there. Kept outside the lazily loaded workbench so the shell can read it cheaply. */
const last = new Map<string, string | null>();
export const rememberTaskProject = (workspaceId: string, project: string | null) =>
  void last.set(workspaceId, project);
export const lastTaskProject = (workspaceId: string) => last.get(workspaceId) ?? null;
