import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { stemRange } from './rename-model.js';
import type { RenameState } from './useDocumentRename.js';
import './document-name-popover.css';

/** Equal compact widths; only the macOS popover reserves room for a title arrow. */
const WIDTH = { mac: 320, windows: 320 } as const;
const GAP = { mac: 8, windows: 6 } as const;
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
  const composing = useRef(false);
  const deferredOutside = useRef(false);
  const settleOutside = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    const [start, end] = stemRange(field.value);
    field.setSelectionRange(start, end);
  }, []);

  useEffect(() => {
    let active = true;
    let frame: number | undefined;
    const confirmOutside = () => {
      if (!active || busy.current) return;
      if (composing.current) {
        deferredOutside.current = true;
        return;
      }
      deferredOutside.current = false;
      // Composition's final DOM input may precede React's state update.
      latest.current.onCommit(input.current?.value ?? latest.current.value);
    };
    const scheduleOutside = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        confirmOutside();
      });
    };
    settleOutside.current = scheduleOutside;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      // The title button toggles the popover itself; its press is not an "elsewhere" click.
      if (event.target instanceof Element && event.target.closest('.titlebar-title-button')) return;
      confirmOutside();
    };
    // Cross-origin editor pointer events never bubble here. Entering that frame
    // blurs this window; inspect focus after the browser finishes transferring it.
    const frameFocus = () => {
      queueMicrotask(() => {
        if (
          active &&
          document.hasFocus() &&
          document.activeElement instanceof HTMLIFrameElement &&
          !root.current?.contains(document.activeElement)
        )
          scheduleOutside();
      });
    };
    const resize = () => setViewport(document.documentElement.clientWidth);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', frameFocus);
    window.addEventListener('blur', frameFocus);
    window.addEventListener('resize', resize);
    return () => {
      active = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      settleOutside.current = () => {};
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', frameFocus);
      window.removeEventListener('blur', frameFocus);
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
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            if (deferredOutside.current) settleOutside.current();
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
