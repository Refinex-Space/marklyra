import { type ReactNode, useEffect, useState } from 'react';
import type { Message } from './types.js';

export function conversationGroups(messages: Message[]) {
  const groups: {
    id: string;
    before: Message[];
    activity: Message[];
    after: Message[];
    startedAt: number | undefined;
    completedAt: number | undefined;
  }[] = [];
  for (const message of messages) {
    let group = groups.at(-1);
    if (!group || group.id !== message.turnId) {
      group = {
        id: message.turnId,
        before: [],
        activity: [],
        after: [],
        startedAt: undefined,
        completedAt: undefined,
      };
      groups.push(group);
    }
    if (message.role === 'user') {
      group.before.push(message);
      group.startedAt = message.createdAt;
      group.completedAt = message.completedAt;
    } else group.after.push(message);
  }
  for (const group of groups) {
    let lastActivity = -1;
    group.after.forEach((message, index) => {
      if (['thought', 'tool', 'plan'].includes(message.role)) lastActivity = index;
    });
    if (lastActivity >= 0) {
      const process = group.after.splice(0, lastActivity + 1);
      // Notices remain visible, including cancellation and connection failures.
      group.activity = process.filter((message) => message.role !== 'notice');
      group.after.unshift(...process.filter((message) => message.role === 'notice'));
    }
  }
  return groups;
}
function elapsed(start: number, end: number) {
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
export function TurnActivity({
  running,
  startedAt,
  completedAt,
  children,
}: {
  running: boolean;
  startedAt: number | undefined;
  completedAt: number | undefined;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(running);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setExpanded(running);
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const label = running
    ? `正在处理${startedAt !== undefined ? ` · ${elapsed(startedAt, now)}` : ''}`
    : startedAt !== undefined && completedAt !== undefined
      ? `用时 ${elapsed(startedAt, completedAt)}`
      : '处理过程';
  return (
    <details className="ai-turn-activity" open={expanded}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: native summary is keyboard-activatable; control expansion independently of nested tool toggles. */}
      <summary
        onClick={(event) => {
          event.preventDefault();
          setExpanded((value) => !value);
        }}
      >
        {label}
        <span className="ai-activity-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="ai-activity-content">{children}</div>
    </details>
  );
}
