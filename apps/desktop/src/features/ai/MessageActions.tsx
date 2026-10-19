import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { agentApi } from './api.js';
export function MessageActions({
  text,
  createdAt,
  report,
}: {
  text: string;
  createdAt?: number;
  report: (error: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="ai-message-actions">
      {!!text && (
        <button
          type="button"
          title={copied ? '已复制' : '复制消息'}
          aria-label={copied ? '已复制消息' : '复制消息'}
          onClick={() => {
            void agentApi.invoke('clipboard_write', { data: { text } }).then(
              () => {
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), 1600);
              },
              (error) => report(`复制失败：${String(error)}`),
            );
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      )}
      {createdAt !== undefined && (
        <time
          dateTime={new Date(createdAt).toISOString()}
          title={new Date(createdAt).toLocaleString()}
        >
          {new Date(createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </time>
      )}
    </div>
  );
}
