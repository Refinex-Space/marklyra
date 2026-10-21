import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { GitGlyph, type GitGlyphName } from './GitGlyph.js';

export interface GitMenuItem {
  id: string;
  label: string;
  icon?: GitGlyphName;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  children?: GitMenuItem[];
  run?: () => void;
}
export type GitMenuEntry = GitMenuItem | 'separator' | { heading: string };

const isItem = (entry: GitMenuEntry): entry is GitMenuItem =>
  typeof entry === 'object' && 'id' in entry;

/** Keeps a floating box inside the viewport, flipping to the other side of its anchor. */
export function placeFloating(
  element: HTMLElement,
  x: number,
  y: number,
  anchor?: { left: number; right: number; top: number; bottom: number },
) {
  const margin = 8;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  let left = x;
  let top = y;
  if (left + width > viewportWidth - margin)
    left = anchor ? anchor.left - width : viewportWidth - margin - width;
  if (top + height > viewportHeight - margin)
    top = anchor ? Math.max(margin, anchor.bottom - height) : viewportHeight - margin - height;
  element.style.left = `${Math.max(margin, left)}px`;
  element.style.top = `${Math.max(margin, top)}px`;
}

/** A web menu with nested submenus, used where a native menu cannot show live repository data. */
export function GitMenu(props: {
  entries: GitMenuEntry[];
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  /** Bounds of the parent row, for submenus that must flip to the left. */
  anchor?: { left: number; right: number; top: number; bottom: number };
  /** Submenus close back to their parent instead of closing everything. */
  nested?: boolean;
  /** Focus the first item (a submenu opened from the keyboard). */
  autoFocus?: boolean;
  onBack?: () => void;
}) {
  const { entries, onClose } = props;
  const element = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<{ id: string; rect: DOMRect; focus: boolean } | null>(
    null,
  );
  const items = entries.filter(isItem);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    placeFloating(node, props.x, props.y, props.anchor);
    if (!props.nested || props.autoFocus)
      node.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [props.x, props.y, props.anchor, props.nested, props.autoFocus]);
  useEffect(() => {
    if (props.nested) return;
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (event.target instanceof Element && event.target.closest('.git-menu')) return;
      close.current();
    };
    const blur = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', blur);
    };
  }, [props.nested]);

  const open = (item: GitMenuItem, row: HTMLElement, focus = false) => {
    if (!item.children?.length || item.disabled) return;
    if (submenu?.id === item.id && !focus) return;
    setSubmenu({ id: item.id, rect: row.getBoundingClientRect(), focus });
  };
  const activate = (item: GitMenuItem, row: HTMLElement) => {
    if (item.disabled) return;
    if (item.children?.length) {
      open(item, row, true);
      return;
    }
    close.current();
    item.run?.();
  };
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const rows = [
      ...(element.current?.querySelectorAll<HTMLElement>(
        ':scope > [role^="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    const move = (step: number) => {
      event.preventDefault();
      event.stopPropagation();
      rows[(index + step + rows.length) % rows.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Home') {
      event.preventDefault();
      rows[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      rows.at(-1)?.focus();
    } else if (event.key === 'ArrowRight') {
      const row = rows[index];
      const item = items.find((entry) => entry.id === row?.dataset.id);
      if (row && item?.children?.length) {
        event.preventDefault();
        event.stopPropagation();
        open(item, row, true);
      }
    } else if (event.key === 'ArrowLeft' && props.nested) {
      event.preventDefault();
      event.stopPropagation();
      props.onBack?.();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (props.nested) props.onBack?.();
      else close.current();
    }
  };
  const child = submenu ? items.find((item) => item.id === submenu.id) : undefined;
  return (
    <div
      ref={element}
      className="git-menu"
      role="menu"
      aria-label={props.label}
      onKeyDown={keys}
      style={{ left: props.x, top: props.y }}
    >
      {entries.map((entry, index) => {
        if (entry === 'separator')
          // biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity.
          return <hr key={`separator-${index}`} className="git-menu-separator" />;
        if (!isItem(entry))
          return (
            <div key={`heading-${entry.heading}`} className="git-menu-heading" role="presentation">
              {entry.heading}
            </div>
          );
        const item = entry;
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is menuitemcheckbox whenever aria-checked is set.
          <button
            key={item.id}
            type="button"
            data-id={item.id}
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-haspopup={item.children?.length ? 'menu' : undefined}
            aria-expanded={item.children?.length ? submenu?.id === item.id : undefined}
            className="git-menu-item"
            data-danger={item.danger || undefined}
            data-open={submenu?.id === item.id || undefined}
            disabled={item.disabled}
            onPointerEnter={(event) => {
              if (item.children?.length) open(item, event.currentTarget);
              else if (submenu) setSubmenu(null);
            }}
            onClick={(event) => activate(item, event.currentTarget)}
          >
            <span className="git-menu-icon" aria-hidden="true">
              {item.checked ? (
                <GitGlyph name="check" />
              ) : item.icon ? (
                <GitGlyph name={item.icon} />
              ) : null}
            </span>
            <span className="git-menu-label">{item.label}</span>
            {item.hint && <span className="git-menu-hint">{item.hint}</span>}
            {item.children?.length ? (
              <span className="git-menu-chevron" aria-hidden="true">
                <GitGlyph name="chevronRight" />
              </span>
            ) : null}
          </button>
        );
      })}
      {child?.children && submenu && (
        <GitMenu
          nested
          autoFocus={submenu.focus}
          entries={child.children}
          label={child.label}
          x={submenu.rect.right - 2}
          y={submenu.rect.top - 5}
          anchor={submenu.rect}
          onClose={() => close.current()}
          onBack={() => {
            setSubmenu(null);
            element.current
              ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(child.id)}"]`)
              ?.focus();
          }}
        />
      )}
    </div>
  );
}
