/** Links between notes and the task store: `[WEB-12 标题](task:<id>)` and `[官网](project:<slug>)`.
 * They are ordinary Markdown links, so other editors still show readable text; the internal id
 * keeps them valid when a task changes project or number. */
const escapeText = (text: string) =>
  text
    .replace(/[\\[\]]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
    .trim();

export const taskLinkText = (humanId: string, title: string) => `${humanId} ${title}`.trim();
export const taskLink = (humanId: string, title: string, id: string) =>
  `[${escapeText(taskLinkText(humanId, title))}](task:${id})`;
export const projectLink = (name: string, slug: string) => `[${escapeText(name)}](project:${slug})`;

export type LinkTarget = { kind: 'task' | 'project'; id: string };
/** `task:<id>` / `project:<slug>` as reported by a clicked link. */
export function parseLinkTarget(url: string): LinkTarget | null {
  const m = /^(task|project):([a-z0-9][a-z0-9-]{0,39})$/.exec(url.trim());
  return m ? { kind: m[1] as LinkTarget['kind'], id: m[2] ?? '' } : null;
}

/** Task ids a note links to, in order of first appearance; `[[task:id]]` still counts. */
export function linkedTaskIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(
    /\]\(task:([0-9a-z]{6,40})\)|\[\[task:([0-9a-z]{6,40})(?:\|[^\]]*)?\]\]/g,
  ))
    ids.add(m[1] ?? m[2] ?? '');
  ids.delete('');
  return [...ids];
}
