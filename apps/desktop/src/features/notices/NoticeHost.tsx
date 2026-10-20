import { dismissNotice, useNotices } from './notices.js';
import './notices.css';

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
          <span className="notice-text">{notice.text}</span>
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
