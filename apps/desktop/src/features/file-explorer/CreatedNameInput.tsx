import { useLayoutEffect, useRef, useState } from 'react';
import { useNotice } from '../notices/notices.js';
import type { CreationEditor } from './creation-types.js';

export function CreatedNameInput({
  creation,
  disabled,
  view,
}: {
  creation: CreationEditor;
  disabled: boolean;
  view: 'tree' | 'articles';
}) {
  const entry = creation.state?.entry;
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(entry?.name ?? '');
  const composing = useRef(false),
    blurPending = useRef(false),
    submitting = useRef(false),
    focused = useRef(false);
  const alive = useRef(true);
  const busy = creation.state?.phase !== 'naming';
  // A failed name is reported in the window corner like every other file message; the input stays
  // in place so the name can be corrected. Only a result that needs a decision keeps buttons here.
  const needsDecision = creation.state?.phase === 'resolving';
  useNotice(needsDecision ? '' : creation.state?.error, 'error');
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const register = creation.registerInput;
  useLayoutEffect(() => {
    if (!entry) return;
    register?.(entry.entryToken, input.current);
    return () => register?.(entry.entryToken, null);
  }, [entry, register]);
  useLayoutEffect(() => {
    if (focused.current || disabled || busy || !input.current) return;
    focused.current = true;
    input.current.focus();
    const dot = input.current.value.lastIndexOf('.');
    input.current.setSelectionRange(0, dot > 0 ? dot : input.current.value.length);
    input.current.scrollIntoView({ block: 'nearest' });
  }, [disabled, busy]);
  const submit = async (cancel: boolean, name: string) => {
    if (submitting.current || composing.current || disabled || busy) return;
    submitting.current = true;
    try {
      await (cancel ? creation.finish() : creation.commit(name));
    } finally {
      if (alive.current) submitting.current = false;
    }
  };
  return (
    <span className={`workspace-created-name workspace-created-name-${view}`}>
      <input
        ref={input}
        className="workspace-creation-input"
        aria-label={entry?.kind === 'directory' ? '文件夹名称' : '文件名'}
        value={value}
        readOnly={busy || disabled}
        aria-busy={busy}
        onChange={(event) => setValue(event.currentTarget.value)}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          if (blurPending.current) {
            blurPending.current = false;
            void submit(false, event.currentTarget.value);
          }
        }}
        onBlur={(event) => {
          if (composing.current) {
            blurPending.current = true;
            return;
          }
          void submit(false, event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            void submit(event.key === 'Escape', event.currentTarget.value);
          }
        }}
      />
      {creation.state?.error && needsDecision && (
        <span className="workspace-creation-error" role="alert">
          {creation.state.error}
          {creation.state.phase === 'resolving' && creation.retryResolution && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void creation.retryResolution?.()}
            >
              核对结果
            </button>
          )}
          {creation.state.phase === 'resolving' && creation.retryPrepared && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void creation.retryPrepared?.()}
            >
              重试改名
            </button>
          )}
        </span>
      )}
    </span>
  );
}
