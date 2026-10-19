import { expect, it } from 'vitest';
import { sessionRecord, sessionSummary } from '../src/features/ai/history-validation.js';

const record = {
  id: 'id',
  profileId: 'profile',
  agentId: 'codex-acp',
  agentName: 'Codex',
  title: 'Title',
  rootPath: '/workspace',
  providerSessionId: 'provider',
  createdAt: 1,
  updatedAt: 2,
  messages: [{ id: 'message', role: 'assistant', turnId: 'turn', text: 'Safe text' }],
};
it('rejects corrupt history before it can replace the mounted editor UI', () => {
  expect(() => sessionSummary({ ...record, title: { html: 'invalid' } })).toThrow('原始记录已保留');
  expect(() => sessionRecord({ ...record, messages: {} })).toThrow('原始记录已保留');
  expect(() =>
    sessionRecord({ ...record, messages: [{ ...record.messages[0], text: {} }] }),
  ).toThrow('原始记录已保留');
  expect(sessionRecord(record).archived).toBe(false);
});
it('validates persisted turn completion and accepts old histories without timing', () => {
  const message = {
    id: 'user',
    role: 'user',
    turnId: 'turn',
    text: 'hi',
    createdAt: 100,
    completedAt: 16000,
  };
  expect(sessionRecord({ ...record, messages: [message] }).messages[0]?.completedAt).toBe(16000);
  expect(() => sessionRecord({ ...record, messages: [{ ...message, completedAt: 99 }] })).toThrow();
  expect(() =>
    sessionRecord({ ...record, messages: [{ ...message, role: 'assistant' }] }),
  ).toThrow();
  expect(sessionRecord(record).messages[0]?.completedAt).toBeUndefined();
});
