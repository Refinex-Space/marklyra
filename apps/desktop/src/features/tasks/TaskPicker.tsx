import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon.js';

export interface PickerOption<T> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
  /** Digit shortcut shown on the right; pressed with an empty filter it picks directly. */
  digit?: string;
  selected?: boolean;
}
interface Props<T> {
  title: string;
  /** Who is being changed, e.g. "WEB-3 · 修复导航" or "3 个任务". */
  context?: ReactNode;
  options: PickerOption<T>[];
  multiple?: boolean;
  /** Anchored pickers open under the control that was clicked; keyboard pickers centre on top. */
  anchor?: DOMRect | null;
  onPick(option: PickerOption<T>): void;
  onClose(): void;
  /** Free text that matches nothing can become a new value (e.g. a label). */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  /** Free text parsed into an extra first option (e.g. a typed date). */
  parse?: (text: string) => PickerOption<T> | null;
}

export function TaskPicker<T>(props: Props<T>) {
  const { options, multiple = false, anchor = null } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useId();
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = options.filter(
      (o) => !q || `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q),
    );
    const parsed = q && props.parse ? props.parse(query.trim()) : null;
    return parsed ? [parsed, ...filtered] : filtered;
  }, [options, query, props.parse]);
  const creating =
    !!props.onCreate && query.trim() !== '' && !options.some((o) => o.label === query.trim());
  const count = visible.length + (creating ? 1 : 0);
  useEffect(() => setActive((i) => Math.min(i, Math.max(0, count - 1))), [count]);
  useLayoutEffect(() => {
    input.current?.focus();
  }, []);
  useLayoutEffect(() => {
    panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const choose = (index: number) => {
    if (index === visible.length && creating) {
      props.onCreate?.(query.trim());
      setQuery('');
      return;
    }
    const option = visible[index];
    if (!option) return;
    props.onPick(option);
    if (multiple) {
      setQuery('');
      // Picked options can re-sort and remount; the filter keeps the keyboard (Escape, typing).
      input.current?.focus();
    }
  };
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) setActive((i) => (i + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    } else if (!query && /^[0-9]$/.test(event.key)) {
      const index = visible.findIndex((o) => o.digit === event.key);
      if (index >= 0) {
        event.preventDefault();
        choose(index);
      }
    }
  };
  const style = anchor
    ? {
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - 276)),
        top:
          anchor.bottom + 340 > window.innerHeight
            ? Math.max(8, anchor.top - 346)
            : anchor.bottom + 6,
      }
    : undefined;
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: keys from the filter input bubble here to drive the option list.
    <div className="task-layer" onKeyDown={keyDown}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press outside only dismisses; Escape is the keyboard path. */}
      <div className={anchor ? 'task-scrim clear' : 'task-scrim'} onMouseDown={props.onClose} />
      <div
        ref={panel}
        className={anchor ? 'task-picker anchored' : 'task-picker'}
        style={style}
        role="dialog"
        aria-label={props.title}
      >
        {!anchor && props.context && <div className="task-picker-context">{props.context}</div>}
        <div className="task-picker-input">
          <Icon name="search" />
          <input
            ref={input}
            value={query}
            placeholder={props.title}
            aria-label={props.title}
            aria-controls={list}
            aria-activedescendant={`${list}-${active}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              // With an input method on, digits come in as text, not as a keydown.
              const direct =
                !query && /^[0-9]$/.test(value) ? visible.findIndex((o) => o.digit === value) : -1;
              if (direct >= 0) {
                choose(direct);
                return;
              }
              setQuery(value);
              setActive(0);
            }}
          />
        </div>
        <div
          className="task-picker-options"
          id={list}
          role="listbox"
          aria-multiselectable={multiple}
        >
          {visible.map((option, index) => (
            <button
              type="button"
              // Values are unique per list except the parsed date, which may repeat a preset.
              // biome-ignore lint/suspicious/noArrayIndexKey: index disambiguates that one duplicate.
              key={`${String(option.value)}-${index}`}
              id={`${list}-${index}`}
              data-index={index}
              role="option"
              aria-selected={!!option.selected}
              data-active={index === active}
              className="task-option"
              onMouseMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {multiple && (
                <span className={option.selected ? 'task-check on' : 'task-check'}>
                  {option.selected && <Icon name="check" />}
                </span>
              )}
              {option.icon}
              <span className="task-option-label">{option.label}</span>
              {option.hint && <span className="task-option-hint">{option.hint}</span>}
              {option.digit && <kbd>{option.digit}</kbd>}
              {!multiple && option.selected && (
                <span className="task-option-current">
                  <Icon name="check" />
                </span>
              )}
            </button>
          ))}
          {creating && (
            <button
              type="button"
              data-index={visible.length}
              data-active={active === visible.length}
              className="task-option"
              onMouseMove={() => setActive(visible.length)}
              onClick={() => choose(visible.length)}
            >
              <Icon name="add" />
              <span className="task-option-label">
                {props.createLabel?.(query.trim()) ?? query.trim()}
              </span>
            </button>
          )}
          {!count && <div className="task-picker-empty">没有匹配项</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
