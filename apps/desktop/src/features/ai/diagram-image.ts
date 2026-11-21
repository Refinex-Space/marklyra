// Mermaid layout can be expensive. Only one visible message starts an isolated frame at a time.
export interface DiagramImage {
  url: string;
  width: number;
  height: number;
}

let previous: Promise<void> = Promise.resolve();
export function diagramImage(
  runtimeUrl: string,
  source: string,
  dark: boolean,
  signal: AbortSignal,
) {
  const job = previous.then(() => {
    signal.throwIfAborted();
    return new Promise<DiagramImage>((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.sandbox.add('allow-scripts');
      frame.className = 'ai-diagram-renderer';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      const channel = new MessageChannel();
      const stop = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        channel.port1.close();
        channel.port2.close();
        frame.remove();
      };
      const fail = (message: string) => {
        stop();
        reject(new Error(message));
      };
      const abort = () => fail('图表渲染已取消');
      const timer = window.setTimeout(() => fail('图表渲染超时'), 12000);
      signal.addEventListener('abort', abort, { once: true });
      channel.port1.onmessage = ({ data }) => {
        const image = data?.image;
        if (
          !Number.isSafeInteger(data?.width) ||
          data.width < 1 ||
          data.width > 16384 ||
          !Number.isSafeInteger(data?.height) ||
          data.height < 1 ||
          data.height > 16384 ||
          typeof image !== 'string' ||
          image.length > 16_777_216 ||
          !image.startsWith('data:image/svg+xml;charset=utf-8,')
        ) {
          fail('图表未能绘制，请检查 Mermaid 源码。');
          return;
        }
        stop();
        resolve({ url: image, width: data.width, height: data.height });
      };
      frame.onload = () =>
        frame.contentWindow?.postMessage({ kind: 'marklyra-diagram', source, dark }, '*', [
          channel.port2,
        ]);
      frame.onerror = () => fail('无法加载本地图表组件');
      frame.src = new URL('html/ai-diagram.html', runtimeUrl).href;
      document.body.append(frame);
    });
  });
  previous = job.then(
    () => {},
    () => {},
  );
  return job;
}
