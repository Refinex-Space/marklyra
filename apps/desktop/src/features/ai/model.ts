import { type Message, object, type SessionView, text } from './types.js';

export function updateMessages(
  messages: Message[],
  update: Record<string, unknown>,
  turnId: string,
): Message[] {
  const kind = update.sessionUpdate;
  if (
    kind === 'agent_message_chunk' ||
    kind === 'agent_thought_chunk' ||
    kind === 'user_message_chunk'
  ) {
    const role =
      kind === 'agent_message_chunk'
        ? 'assistant'
        : kind === 'agent_thought_chunk'
          ? 'thought'
          : 'user';
    const content = object(update.content);
    const chunk =
      content.type === 'text'
        ? text(content.text)
        : content.type === 'resource_link'
          ? `[${text(content.name)}](${text(content.uri)})`
          : '';
    if (!chunk) return messages;
    const previous = messages.at(-1);
    if (previous?.role === role && previous.turnId === turnId)
      return [...messages.slice(0, -1), { ...previous, text: previous.text + chunk }];
    return [
      ...messages,
      { id: crypto.randomUUID(), role, text: chunk, turnId, createdAt: Date.now() },
    ];
  }
  if (kind === 'tool_call' || kind === 'tool_call_update') {
    const id = text(update.toolCallId);
    const index = messages.findIndex((m) => m.id === id && m.turnId === turnId);
    const tool = {
      ...(index >= 0 ? messages[index]?.tool : {}),
      ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null)),
    };
    const next: Message = {
      id,
      role: 'tool',
      text: text(tool.title) || '工具操作',
      tool,
      turnId,
      createdAt: messages[index]?.createdAt ?? Date.now(),
    };
    return index < 0 ? [...messages, next] : messages.map((m, i) => (i === index ? next : m));
  }
  if (kind === 'plan' && Array.isArray(update.entries)) {
    const id = `plan:${turnId}`;
    const previous = messages.find((message) => message.id === id && message.turnId === turnId);
    const plan: Message = {
      id,
      role: 'plan',
      turnId,
      createdAt: previous?.createdAt ?? Date.now(),
      text: update.entries
        .map((e) => {
          const entry = object(e);
          return `${entry.status === 'completed' ? '✓' : entry.status === 'in_progress' ? '→' : '○'} ${text(entry.content)}`;
        })
        .join('\n'),
    };
    return previous
      ? messages.map((message) => (message === previous ? plan : message))
      : [...messages, plan];
  }
  return messages;
}

/** Only a relative document path or a file URL inside this workspace can navigate. */
export function documentLink(href: string, root: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(href.split('#')[0] ?? '');
    if (value.startsWith('file:')) {
      const url = new URL(href);
      if (url.hostname && url.hostname !== 'localhost') return null;
      value = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1);
    }
  } catch {
    return null;
  }
  value = value.replaceAll('\\', '/');
  const prefix = root.replaceAll('\\', '/').replace(/\/$/, '') + '/';
  if (value.startsWith(prefix)) value = value.slice(prefix.length);
  if (!value || value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('\0'))
    return null;
  while (value.startsWith('./')) value = value.slice(2);
  if (value.split('/').some((p) => !p || p === '..' || p.startsWith('.'))) return null;
  return /\.(md|markdown|mdx|mkd|mdown|mdtext|mdtxt|mdwn|mmd|qmd|rmd|rmarkdown|txt|text|apib)$/i.test(
    value,
  )
    ? value
    : null;
}
export function mentionAt(value: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|\s)@([^\n@]*)$/.exec(value.slice(0, caret));
  return match && (match[1]?.length ?? 0) <= 120
    ? { start: caret - (match[1]?.length ?? 0) - 1, query: match[1] ?? '' }
    : null;
}

/** Flatten provider groups without accepting unadvertised experimental option kinds. */
export function configOptions(value: unknown): SessionView['configOptions'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((raw) => {
    const item = object(raw);
    if ((item.type && item.type !== 'select') || !text(item.id) || !Array.isArray(item.options))
      return [];
    const options = item.options
      .flatMap((raw) => {
        const option = object(raw);
        if (Array.isArray(option.options))
          return option.options.map((raw) => {
            const child = object(raw);
            return {
              value: text(child.value),
              name: `${text(option.group)} / ${text(child.name)}`,
            };
          });
        return [{ value: text(option.value), name: text(option.name) }];
      })
      .filter((option) => option.value && option.name)
      .slice(0, 500);
    return [
      { id: text(item.id), name: text(item.name), currentValue: text(item.currentValue), options },
    ];
  });
}

export function encodeDocumentPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .split('/')
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}
