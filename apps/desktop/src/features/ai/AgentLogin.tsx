import { useEffect, useRef, useState } from 'react';
import type { AgentSession } from './session.js';
import '@xterm/xterm/css/xterm.css';

export function AgentLogin({
  session,
  methodId,
  close,
}: {
  session: AgentSession;
  methodId: string;
  close: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [exited, setExited] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !container.current) return;
      const terminal = new Terminal({
        fontSize: 12,
        scrollback: 500,
        screenReaderMode: true,
        theme: { background: '#161b22', foreground: '#e6edf3' },
        linkHandler: {
          activate: (_event, uri) =>
            void session.openExternal(uri).catch((e) => setError(String(e))),
        },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(container.current);
      fit.fit();
      terminal.focus();
      const data = terminal.onData(
        (input) => void session.authIo({ input }).catch((e) => setError(String(e))),
      );
      let started = false,
        polling = false;
      const resize = new ResizeObserver(() => {
        fit.fit();
        if (started)
          void session.authIo({ cols: terminal.cols, rows: terminal.rows }).catch(() => {});
      });
      resize.observe(container.current);
      const timer = setInterval(() => {
        if (!started || polling || disposed) return;
        polling = true;
        void session
          .authIo({})
          .then(
            (result) => {
              if (disposed) return;
              if (result.data)
                terminal.write(Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0)));
              if (result.exitCode !== null && result.exitCode !== undefined) {
                setExited(result.exitCode);
                clearInterval(timer);
              }
            },
            (e) => {
              if (!disposed) setError(String(e));
            },
          )
          .finally(() => {
            polling = false;
          });
      }, 250);
      cleanup = () => {
        clearInterval(timer);
        resize.disconnect();
        data.dispose();
        terminal.dispose();
        void session.authIo({ close: true }).catch(() => {});
      };
      await session.startTerminalAuth(methodId);
      started = true;
      if (disposed) {
        cleanup();
        return;
      }
      await session.authIo({ cols: terminal.cols, rows: terminal.rows });
    })().catch((e) => {
      if (!disposed) setError(String(e));
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [session, methodId]);
  return (
    <div className="ai-login" role="dialog" aria-label="智能体登录">
      <header>
        <strong>登录 {session.profile.name}</strong>
        <button type="button" onClick={close}>
          关闭
        </button>
      </header>
      <p>按照智能体提示完成登录，凭据由智能体管理。</p>
      <div ref={container} className="ai-login-terminal" />
      {error && <p role="alert">{error}</p>}
      {exited !== null && <p>{exited === 0 ? '登录程序已完成' : `登录程序退出（${exited}）`}</p>}
      <button
        type="button"
        onClick={() => {
          void session.reconnect();
          close();
        }}
      >
        完成并重新连接
      </button>
    </div>
  );
}
