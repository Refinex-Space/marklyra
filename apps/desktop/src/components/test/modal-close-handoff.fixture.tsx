import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useModalCloseHandoff } from '../useModalCloseHandoff.js';

export interface ModalCloseHandoffFixture {
  pending: boolean;
  abortedAtLayout: boolean | null;
  requestSettled: boolean;
  closeCalls: (boolean | undefined)[];
  replace(): void;
}
export type ModalCloseHandoffWindow = Window &
  typeof globalThis & {
    __modalCloseHandoffFixture: ModalCloseHandoffFixture;
  };
let signal: AbortSignal | undefined;
let acknowledge: (() => void) | undefined;
const fixture: ModalCloseHandoffFixture = {
  pending: false,
  abortedAtLayout: null,
  requestSettled: false,
  closeCalls: [],
  replace: () => {},
};
Object.assign(window, { __modalCloseHandoffFixture: fixture });
function OldModal({ close }: { close(focusHandled?: boolean): void }) {
  const handoff = useModalCloseHandoff({
    close,
    locked: false,
    beforeClose: (_target, current) => {
      signal = current;
      fixture.pending = true;
      return new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
    },
  });
  return (
    <section role="dialog" aria-label="旧面板" ref={handoff.panel}>
      <button
        type="button"
        data-modal-close
        disabled={handoff.closing}
        onClick={() => {
          void handoff.request().then(() => {
            fixture.requestSettled = true;
          });
        }}
      >
        关闭
      </button>
    </section>
  );
}
function Harness() {
  const [stage, setStage] = useState<'old' | 'new' | 'closed'>('old');
  const control = useRef<HTMLInputElement>(null);
  fixture.replace = () => setStage('new');
  useLayoutEffect(() => {
    if (stage !== 'new') return;
    // The old modal DOM has already been removed. Release the actual pending
    // promise in this commit, before passive cleanup can revoke old callbacks.
    fixture.abortedAtLayout = signal?.aborted ?? null;
    acknowledge?.();
    control.current?.focus();
  }, [stage]);
  return stage === 'old' ? (
    <OldModal
      close={(handled) => {
        fixture.closeCalls.push(handled);
        setStage('closed');
      }}
    />
  ) : stage === 'new' ? (
    <section role="dialog" aria-label="新面板">
      <label>
        新的输入位置
        <input ref={control} />
      </label>
    </section>
  ) : (
    <output>Closed by old callback</output>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing modal test root');
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
