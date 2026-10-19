import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { AgentIcon } from './AgentIcon.js';
import type { AgentProfile } from './types.js';

export function AgentSessionMenu({
  profiles,
  active,
  selectedId,
  canCreate,
  create,
  settings,
}: {
  profiles: AgentProfile[];
  active: boolean;
  selectedId?: string;
  canCreate: boolean;
  create: (profile: AgentProfile) => void;
  settings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);
  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    const current = menu.current?.querySelector<HTMLButtonElement>(
      '[aria-checked="true"]:not(:disabled)',
    );
    (current ?? items?.[0])?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [open]);
  return (
    <div className="ai-new-session" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="ai-new-session-trigger"
        aria-label="新建 AI 会话"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="ai" />
        <span className="ai-new-session-label">新建会话</span>
        <span className="ai-menu-chevron" aria-hidden="true">
          <Icon name="chevronDown" />
        </span>
      </button>
      {open && (
        <div
          className="ai-new-session-menu"
          role="menu"
          aria-label="选择新会话智能体"
          ref={menu}
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              event.preventDefault();
              close();
              const next = root.current?.nextElementSibling;
              if (!event.shiftKey && next instanceof HTMLElement) next.focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const items = [
                ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ??
                  []),
              ];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          {!profiles.length && <p className="ai-new-session-empty">尚未安装智能体</p>}
          {profiles.map((profile) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selectedId === profile.id}
              disabled={!profile.enabled || !canCreate}
              key={profile.id}
              onClick={() => {
                close();
                create(profile);
              }}
            >
              <AgentIcon id={profile.agentId} size={18} />
              <span>{profile.name}</span>
              {!profile.enabled ? (
                <small>已停用</small>
              ) : selectedId === profile.id ? (
                <span aria-hidden="true">✓</span>
              ) : null}
            </button>
          ))}
          <hr className="ai-new-session-divider" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              settings();
            }}
          >
            <Icon name="add" />
            <span>管理智能体…</span>
          </button>
        </div>
      )}
    </div>
  );
}
