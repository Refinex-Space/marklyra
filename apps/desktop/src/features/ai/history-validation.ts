import { object, type SessionRecord } from './types.js';

type Summary = Omit<SessionRecord, 'messages'>;
function bounded(value: unknown, limit: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit;
}
export function sessionSummary(value: unknown): Summary {
  const record = object(value);
  if (
    !['id', 'profileId', 'agentId', 'agentName', 'title', 'rootPath'].every((key) =>
      bounded(record[key], key === 'rootPath' ? 16384 : 512),
    ) ||
    !bounded(record.providerSessionId, 512) ||
    ![record.createdAt, record.updatedAt].every(
      (time) => Number.isSafeInteger(time) && Number(time) >= 0,
    ) ||
    (record.archived !== undefined && typeof record.archived !== 'boolean')
  )
    throw new Error('会话记录损坏或版本不兼容，原始记录已保留。');
  return { ...record, archived: record.archived === true } as unknown as Summary;
}
export function sessionRecord(value: unknown): SessionRecord {
  const summary = sessionSummary(value);
  const { messages } = object(value);
  if (
    !Array.isArray(messages) ||
    messages.length > 5000 ||
    messages.some((value) => {
      const message = object(value);
      return (
        !bounded(message.id, 512) ||
        !['user', 'assistant', 'thought', 'tool', 'plan', 'notice'].includes(
          String(message.role),
        ) ||
        typeof message.text !== 'string' ||
        message.text.length > 4 * 1024 * 1024 ||
        typeof message.turnId !== 'string' ||
        (message.references !== undefined &&
          (!Array.isArray(message.references) ||
            message.references.length > 32 ||
            message.references.some((path) => !bounded(path, 16384)))) ||
        (message.createdAt !== undefined &&
          (!Number.isSafeInteger(message.createdAt) ||
            Number(message.createdAt) < 0 ||
            Number(message.createdAt) > 8.64e15)) ||
        (message.completedAt !== undefined &&
          (message.role !== 'user' ||
            !Number.isSafeInteger(message.completedAt) ||
            !Number.isSafeInteger(message.createdAt) ||
            Number(message.completedAt) < Number(message.createdAt) ||
            Number(message.completedAt) > 8.64e15)) ||
        (message.attachments !== undefined &&
          (!Array.isArray(message.attachments) ||
            message.attachments.length > 8 ||
            message.attachments.some((raw) => {
              const item = object(raw);
              return (
                !bounded(item.id, 128) ||
                !/^[a-zA-Z0-9-]+$/.test(String(item.id)) ||
                !bounded(item.name, 512) ||
                !bounded(item.mimeType, 128) ||
                item.data !== undefined ||
                !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(item.mimeType)) ||
                (String(item.mimeType).startsWith('image/') &&
                  !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
                    String(item.mimeType),
                  )) ||
                !Number.isSafeInteger(item.size) ||
                Number(item.size) < 0 ||
                Number(item.size) > 4 * 1024 * 1024 ||
                typeof item.digest !== 'string' ||
                !/^[a-f0-9]{64}$/.test(item.digest)
              );
            }))) ||
        (message.tool !== undefined &&
          (message.tool === null ||
            typeof message.tool !== 'object' ||
            Array.isArray(message.tool)))
      );
    })
  )
    throw new Error('会话消息损坏或超过限制，原始记录已保留。');
  return { ...summary, messages } as SessionRecord;
}
