import { expect, it } from 'vitest';
import { conversationGroups } from '../src/features/ai/TurnActivity.js';
import type { Message } from '../src/features/ai/types.js';

it('keeps final answers and notices visible while grouping actual process commentary', () => {
  const messages: Message[] = [
    { id: 'u', turnId: 'a', role: 'user', text: 'Question', createdAt: 1000, completedAt: 17000 },
    { id: 'p', turnId: 'a', role: 'assistant', text: 'Reading' },
    { id: 't', turnId: 'a', role: 'tool', text: 'Read' },
    { id: 'n', turnId: 'a', role: 'notice', text: 'Stopped' },
    { id: 'a', turnId: 'a', role: 'assistant', text: 'Answer' },
    { id: 'u2', turnId: 'b', role: 'user', text: 'Next' },
    { id: 'a2', turnId: 'b', role: 'assistant', text: 'Direct answer' },
  ];
  const [first, second] = conversationGroups(messages);
  expect(first?.activity.map((message) => message.id)).toEqual(['p', 't']);
  expect(first?.after.map((message) => message.id)).toEqual(['n', 'a']);
  expect(first?.completedAt).toBe(17000);
  expect(second?.activity).toEqual([]);
  expect(second?.completedAt).toBeUndefined();
  expect(messages).toHaveLength(7);
});
