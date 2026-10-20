import { dismissNotice, type Notice, useNotices } from './notices.js';
import './notices.css';

function run(notice: Notice, index: number) {
  const action = notice.actions[index];
  if (!action) return;
  dismissNotice(notice.id);
  void Promise.resolve(action.run()).catch(() => {
    /* The action reports its own failure; a notice must never throw into the shell. */
  });
}

/** Bottom-right stack for transient messages from any pane. */
export function NoticeHost() {
  const notices = useNotices();
  return (
    <div className="notice-host" aria-live="polite" aria-atomic="false">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`notice notice-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          <div className="notice-body">
            <span className="notice-text">{notice.text}</span>
            {notice.actions.length > 0 && (
              <span className="notice-actions">
                {notice.actions.map((action, index) => (
                  <button
                    key={action.label}
                    type="button"
                    className="notice-action"
                    onClick={() => run(notice, index)}
                  >
                    {action.label}
                  </button>
                ))}
              </span>
            )}
          </div>
          <button
            type="button"
            className="notice-close"
            aria-label="关闭提示"
            onClick={() => dismissNotice(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
