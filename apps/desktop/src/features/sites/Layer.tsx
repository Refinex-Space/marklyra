import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../../components/Icon.js';
import { useModalFocus } from '../../components/useModalFocus.js';

/** A modal dialog on `document.body`: focus stays inside, Escape and a press outside close it. */
export function Modal({
  label,
  close,
  children,
  className = '',
}: {
  label: string;
  close(): void;
  children: ReactNode;
  className?: string;
}) {
  const panel = useModalFocus(true, close, false);
  return createPortal(
    <div className="site-layer">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
      <div className="site-scrim" onMouseDown={close} />
      <div
        ref={panel as RefObject<HTMLDivElement | null>}
        className={`site-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type MenuEntry =
  | { separator: true }
  | {
      id: string;
      label: string;
      icon?: IconName;
      danger?: boolean;
      /** Shown on the right: a shortcut, or a mark for the current choice. */
      hint?: string;
      checked?: boolean;
      /** A coloured dot before the label (group colour). */
      dot?: string;
      /** Any other mark before the label, such as a search engine's icon. */
      leading?: ReactNode;
      indent?: boolean;
    };

/**
 * A popover menu at a screen point. Arrow keys move, Enter picks, Escape or a press outside
 * closes. It measures itself to stay inside the window, so it only fades in.
 */
export function Menu({
  x,
  y,
  entries,
  label,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  entries: readonly MenuEntry[];
  label: string;
  onPick(id: string): void;
  onClose(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ left: x, top: y, visibility: 'hidden' });
  const closing = useRef(onClose);
  closing.current = onClose;
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);
  useEffect(() => {
    // A menu still hidden for measurement cannot receive keyboard focus.
    if (place.visibility === 'hidden') return;
    const items = () => [
      ...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
    ];
    items()[0]?.focus();
    const down = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) closing.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closing.current();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        list[(at + step + list.length) % list.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        list[event.key === 'Home' ? 0 : list.length - 1]?.focus();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        closing.current();
      }
    };
    const blur = () => closing.current();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
    };
  }, [place.visibility]);
  return createPortal(
    <div className="site-layer site-layer-menu">
      <div ref={root} className="site-menu" role="menu" aria-label={label} style={place}>
        {entries.map((entry, index) =>
          'separator' in entry ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static separators
            <hr key={`s${index}`} className="site-menu-sep" />
          ) : (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              aria-current={entry.checked ? 'true' : undefined}
              className={`site-menu-item${entry.danger ? ' danger' : ''}${entry.indent ? ' indent' : ''}`}
              onClick={() => onPick(entry.id)}
            >
              {entry.leading ? (
                <span className="site-menu-lead">{entry.leading}</span>
              ) : entry.dot ? (
                <span className="site-dot" style={{ background: entry.dot }} aria-hidden="true" />
              ) : entry.icon ? (
                <Icon name={entry.icon} />
              ) : null}
              <span className="site-menu-label">{entry.label}</span>
              {entry.checked ? (
                <span className="site-menu-hint">
                  <Icon name="check" />
                </span>
              ) : entry.hint ? (
                <span className="site-menu-hint">{entry.hint}</span>
              ) : null}
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
  );
}
