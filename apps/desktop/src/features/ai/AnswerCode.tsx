import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { agentApi } from './api.js';
import { codeTokens } from './code-tokens.js';
import { type DiagramImage, diagramImage } from './diagram-image.js';

interface Props {
  source: string;
  language: string;
  closed: boolean;
  runtimeUrl?: string | undefined;
  dark: boolean;
  report(message: string): void;
}

export const AnswerCode = memo(function AnswerCode({
  source,
  language,
  closed,
  dark,
  runtimeUrl,
  report,
}: Props) {
  const [wrapped, setWrapped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [result, setResult] = useState<{
    source: string;
    dark: boolean;
    image?: DiagramImage;
    error?: string;
  } | null>(null);
  const card = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const diagram = language === 'mermaid' || language === 'mmd';
  const tooLarge =
    diagram && (source.length > 12_000 || source.split(/\r\n?|\n/, 301).length > 300);
  const eligible = diagram && closed && !tooLarge && !!runtimeUrl;
  const current = result?.source === source && result.dark === dark ? result : null;
  const image = current?.image;
  const codeVisible = !image || showSource;
  const tokens = useMemo(
    () => (closed && !diagram ? codeTokens(source, language) : null),
    [source, language, closed, diagram],
  );

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    const element = card.current;
    if (!eligible || !runtimeUrl || !element || current) return;
    let active: AbortController | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        active?.abort();
        active = undefined;
        return;
      }
      if (active) return;
      const controller = new AbortController();
      active = controller;
      void diagramImage(runtimeUrl, source, dark, controller.signal).then(
        (image) => {
          if (!controller.signal.aborted) setResult({ source, dark, image });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              source,
              dark,
              error: error instanceof Error ? error.message : '图表未能绘制',
            });
        },
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      active?.abort();
    };
  }, [eligible, runtimeUrl, source, dark, current]);
  const copy = async () => {
    try {
      await agentApi.invoke('clipboard_write', { data: { text: source } });
      clearTimeout(copyTimer.current);
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      report('复制失败：' + String(error));
    }
  };
  return (
    <figure className="ai-code-card" ref={card}>
      <figcaption className="ai-code-bar">
        <span className="ai-code-language">{language || '代码'}</span>
        {image && (
          <button
            type="button"
            aria-pressed={showSource}
            onClick={() => setShowSource(!showSource)}
          >
            {showSource ? '图表' : '源码'}
          </button>
        )}
        {codeVisible && (
          <button
            type="button"
            aria-label="自动换行"
            aria-pressed={wrapped}
            onClick={() => setWrapped(!wrapped)}
          >
            换行
          </button>
        )}
        {image && !showSource && (
          <button type="button" onClick={() => dialog.current?.showModal()}>
            放大
          </button>
        )}
        <button
          type="button"
          aria-label={copied ? '已复制代码' : '复制代码'}
          title={copied ? '已复制' : '复制代码'}
          onClick={() => void copy()}
        >
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
      </figcaption>
      {diagram && closed && (tooLarge || current?.error) && (
        <p className="ai-code-note">{tooLarge ? '图表较大，显示源码。' : current?.error}</p>
      )}
      {codeVisible ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Both axes of a code sample can be scrolled by keyboard.
        <pre tabIndex={0} className={wrapped ? 'wrapped' : undefined}>
          <code>
            {tokens?.map((token) =>
              token.kind ? (
                <span key={token.from} className={'ai-token-' + token.kind}>
                  {token.text}
                </span>
              ) : (
                token.text
              ),
            ) ?? source}
          </code>
        </pre>
      ) : (
        <img
          className="ai-rendered-diagram"
          src={image.url}
          width={image.width}
          height={image.height}
          alt="Mermaid 图表"
        />
      )}
      {image && (
        <dialog ref={dialog} className="ai-diagram-dialog" aria-label="图表预览">
          <div className="ai-code-bar">
            <span className="ai-code-language">Mermaid</span>
            <button type="button" onClick={() => dialog.current?.close()}>
              关闭
            </button>
          </div>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The zoomed image can overflow on both axes. */}
          <section className="ai-diagram-canvas" tabIndex={0} aria-label="图表详情">
            <img
              src={image.url}
              width={image.width}
              height={image.height}
              alt="放大的 Mermaid 图表"
            />
          </section>
        </dialog>
      )}
    </figure>
  );
});
