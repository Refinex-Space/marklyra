import { describe, expect, it } from 'vitest';
import {
  builtinSkill,
  configOptions,
  documentLink,
  mentionAt,
  slashCommands,
  slashQuery,
  updateMessages,
} from '../src/features/ai/model.js';

describe('AI document references', () => {
  it('confines navigation to workspace documents and rejects encoded escapes', () => {
    expect(documentLink('file:///vault/Notes/My%20file.md#heading', '/vault')).toBe(
      'Notes/My file.md',
    );
    expect(documentLink('C:\\vault\\note.md', 'C:/vault')).toBe('note.md');
    for (const value of [
      '../outside.md',
      '%2e%2e/outside.md',
      'file:///other/a.md',
      'javascript:alert(1)',
      'https://example.com/a.md',
      '.private/secret.md',
      'file://remote/vault/a.md',
      'a%00.md',
      'image.svg',
    ])
      expect(documentLink(value, '/vault')).toBeNull();
  });
  it('only opens mentions at a word boundary and honors caret location', () => {
    expect(mentionAt('请阅读 @Notes/a', 12)).toEqual({ start: 4, query: 'Notes/a' });
    expect(mentionAt('user@example.com', 16)).toBeNull();
    expect(mentionAt('hello @a\ntext', 13)).toBeNull();
  });
});
describe('ACP stream reducer', () => {
  it('merges chunks within a turn and preserves partial tool updates', () => {
    const first = updateMessages(
      [],
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'A' } },
      'turn1',
    );
    expect(
      updateMessages(
        first,
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'B' } },
        'turn1',
      )[0]?.text,
    ).toBe('AB');
    expect(
      updateMessages(
        first,
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'B' } },
        'turn2',
      ),
    ).toHaveLength(2);
    const tool = updateMessages(
      [],
      { sessionUpdate: 'tool_call', toolCallId: 'tool', title: 'Read', status: 'pending' },
      'turn',
    );
    const updated = updateMessages(
      tool,
      { sessionUpdate: 'tool_call_update', toolCallId: 'tool', status: 'completed' },
      'turn',
    );
    expect(updated[0]?.tool).toMatchObject({ title: 'Read', status: 'completed' });
  });
});

it('normalizes grouped ACP selectors without enabling unadvertised option types', () => {
  expect(
    configOptions([
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        currentValue: 'a',
        options: [{ group: 'Provider', options: [{ value: 'a', name: 'Alpha' }] }],
      },
      { id: 'brave', type: 'boolean', currentValue: true },
    ]),
  ).toEqual([
    {
      id: 'model',
      name: 'Model',
      currentValue: 'a',
      options: [{ value: 'a', name: 'Provider / Alpha' }],
    },
  ]);
});

it('updates plan status in place so late completion cannot move a final answer into activity', () => {
  const plan = updateMessages(
    [],
    { sessionUpdate: 'plan', entries: [{ content: 'Read', status: 'in_progress' }] },
    'turn',
  );
  const answer = updateMessages(
    plan,
    { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Final answer' } },
    'turn',
  );
  const complete = updateMessages(
    answer,
    { sessionUpdate: 'plan', entries: [{ content: 'Read', status: 'completed' }] },
    'turn',
  );
  expect(complete.map((message) => message.role)).toEqual(['plan', 'assistant']);
  expect(complete[0]?.text).toBe('✓ Read');
  expect(complete[0]?.createdAt).toBe(plan[0]?.createdAt);
});

describe('slash commands', () => {
  it('opens only while the whole draft is a command name', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/Mark')).toBe('mark');
    expect(slashQuery('/marklyra-task ')).toBeNull();
    expect(slashQuery('see /mark')).toBeNull();
    expect(slashQuery('/a/b')).toBeNull();
  });
  it('lists the built-in skill first, then safe agent commands without duplicates', () => {
    const agent = [
      { name: 'review', description: 'Review' },
      { name: 'marklyra-task', description: 'shadow' },
      { name: 'bad name', description: 'x' },
    ];
    expect(slashCommands(agent, '').map((c) => c.name)).toEqual(['marklyra-task', 'review']);
    expect(slashCommands(agent, '').at(0)?.builtin).toBe(true);
    expect(slashCommands(agent, 'rev').map((c) => c.name)).toEqual(['review']);
    expect(slashCommands(agent, 'task').map((c) => c.name)).toEqual(['marklyra-task']);
  });
  it('recognizes only the built-in skill and keeps the request', () => {
    expect(builtinSkill('/marklyra-task  完成 WEB-12\n并评论')).toEqual({
      skill: 'marklyra-task',
      text: '完成 WEB-12\n并评论',
    });
    expect(builtinSkill('/marklyra-task')?.text).toContain('概览');
    expect(builtinSkill('/marklyra-tasks 1')).toBeNull();
    expect(builtinSkill('/review')).toBeNull();
    expect(builtinSkill('请用 /marklyra-task')).toBeNull();
  });
});
