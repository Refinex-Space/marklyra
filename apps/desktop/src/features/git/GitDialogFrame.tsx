import { type ReactNode, useId } from 'react';
import { useModalFocus } from '../../components/useModalFocus.js';
import { GitGlyph } from './GitGlyph.js';

/**
 * Modal frame for Git dialogs. Dialogs stack (a diff opened from the conflict list); only the
 * top one is active, the ones below stay mounted and hidden so they keep their state.
 */
export function GitDialogFrame(props: {
  title: ReactNode;
  /** Short text after the title, e.g. the file path. */
  subtitle?: ReactNode;
  active: boolean;
  onClose: () => void;
  /** Escape does nothing while work is running. */
  locked?: boolean;
  size?: 'small' | 'medium' | 'large' | 'full';
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const heading = useId();
  const panel = useModalFocus(props.active, props.onClose, props.locked === true);
  return (
    <div className="git-dialog-backdrop" hidden={!props.active}>
      <section
        ref={panel}
        className={`git-dialog git-dialog-${props.size ?? 'medium'}${props.className ? ` ${props.className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
      >
        <header className="git-dialog-header">
          <h2 id={heading}>{props.title}</h2>
          {props.subtitle && <span className="git-dialog-subtitle">{props.subtitle}</span>}
          {props.toolbar && <div className="git-dialog-toolbar">{props.toolbar}</div>}
          <button
            type="button"
            className="git-icon-button git-dialog-close"
            aria-label="关闭"
            title="关闭（Esc）"
            disabled={props.locked}
            onClick={props.onClose}
          >
            <GitGlyph name="close" />
          </button>
        </header>
        <div className="git-dialog-body">{props.children}</div>
        {props.footer && <footer className="git-dialog-footer">{props.footer}</footer>}
      </section>
    </div>
  );
}

/** Relative time for lists ("3 分钟前", then dates). */
export function relativeTime(seconds: number, now = Date.now()): string {
  const delta = Math.max(0, Math.round(now / 1000 - seconds));
  if (delta < 60) return '刚刚';
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
  if (delta < 86_400) return `${Math.floor(delta / 3600)} 小时前`;
  if (delta < 86_400 * 7) return `${Math.floor(delta / 86_400)} 天前`;
  return formatDate(seconds);
}
export function formatDate(seconds: number, time = false): string {
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return time ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}
export const shortOid = (oid: string | null | undefined) => (oid ? oid.slice(0, 8) : '');
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const dirname = (path: string) => {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
};
