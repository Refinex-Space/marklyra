import {
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { stemRange } from './rename-model.js';
import type { RenameState } from './useDocumentRename.js';
import './document-name-popover.css';

/** The macOS popover is a little wider and hangs from an arrow; the Windows flyout does not. */
const WIDTH = { mac: 340, windows: 320 } as const;
const GAP = { mac: 10, windows: 6 } as const;
const MARGIN = 12;

export interface DocumentNamePopoverProps {
  platform: 'mac' | 'windows';
  state: RenameState;
  onCommit(value: string): void;
  onCancel(): void;
  onEdit(): void;
}

/**
 * Rename the open document's file from its title. One component with two native-feeling looks:
 * the macOS popover with a leading "名称：" label and arrow, and the Windows flyout with the
 * label above the field. Enter or a click elsewhere confirms, Escape cancels.
 */
export function DocumentNamePopover(props: DocumentNamePopoverProps) {
  const { platform, state, onCommit, onCancel, onEdit } = props;
  const [value, setValue] = useState(state.name);
  const [viewport, setViewport] = useState(() => document.documentElement.clientWidth);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(state.busy);
  busy.current = state.busy;
  const latest = useRef({ value, onCommit });
  latest.current = { value, onCommit };

  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    const [start, end] = stemRange(field.value);
    field.setSelectionRange(start, end);
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      // The title button toggles the popover itself; its press is not an "elsewhere" click.
      if (event.target instanceof Element && event.target.closest('.titlebar-title-button')) return;
      if (!busy.current) latest.current.onCommit(latest.current.value);
    };
    const resize = () => setViewport(document.documentElement.clientWidth);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const width = Math.min(WIDTH[platform], viewport - 2 * MARGIN);
  const center = (state.anchor.left + state.anchor.right) / 2;
  const left = Math.max(MARGIN, Math.min(center - width / 2, viewport - width - MARGIN));
  const style = {
    left,
    top: state.anchor.bottom + GAP[platform],
    width,
    '--arrow-x': `${Math.max(18, Math.min(center - left, width - 18))}px`,
  } as CSSProperties;

  const keys = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!state.busy) onCommit(value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!state.busy) onCancel();
    }
  };

  return (
    <div
      ref={root}
      className="document-name-popover"
      data-platform={platform}
      data-busy={state.busy || undefined}
      role="dialog"
      aria-label="重命名文稿"
      style={style}
    >
      <label className="document-name-row">
        <span className="document-name-label">{platform === 'mac' ? '名称：' : '文件名'}</span>
        <input
          ref={input}
          className="document-name-input"
          type="text"
          value={value}
          spellCheck={false}
          autoComplete="off"
          readOnly={state.busy}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'document-name-error' : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (state.error) onEdit();
          }}
          onKeyDown={keys}
        />
      </label>
      {state.error && (
        <p className="document-name-error" id="document-name-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
