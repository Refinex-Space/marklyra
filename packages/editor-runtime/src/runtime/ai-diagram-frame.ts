import { mermaidSvgImage, svgPreviewSize } from './mermaid-svg.js';

// One isolated frame accepts one job from its parent, over a private reply port.
window.addEventListener(
  'message',
  async (event) => {
    if (event.source !== window.parent || event.data?.kind !== 'marklyra-diagram') return;
    const port = event.ports[0];
    if (!port) return;
    try {
      const { source, dark } = event.data;
      if (typeof source !== 'string' || source.length > 12000 || /%%\s*\{|^\s*---/.test(source))
        throw new Error('不支持此图表配置');
      const api = Reflect.get(window, 'mermaid') as {
        initialize(options: Record<string, unknown>): void;
        render(id: string, source: string, root: HTMLElement): Promise<{ svg: string }>;
      };
      api.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        theme: 'base',
        themeVariables: {
          darkMode: dark === true,
          fontFamily: 'system-ui, sans-serif',
          primaryColor: dark ? '#283842' : '#edf3f6',
          primaryTextColor: dark ? '#e1edf3' : '#293a45',
          primaryBorderColor: dark ? '#6c889a' : '#9aaebb',
          lineColor: dark ? '#abc0cd' : '#5d7381',
          secondaryColor: dark ? '#343c31' : '#eff3e9',
          tertiaryColor: dark ? '#393643' : '#f3f0f5',
        },
        maxEdges: 350,
        maxTextSize: 12000,
        flowchart: { htmlLabels: false, useMaxWidth: false },
        suppressErrorRendering: true,
      });
      const root = document.getElementById('diagram');
      if (!root) throw new Error('图表容器不可用');
      const result = await api.render('diagram-output', source, root);
      // Read the generated SVG only inside this sandbox. No event bindings are installed.
      const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
      const svg = document.importNode(parsed.documentElement, true);
      if (!(svg instanceof SVGSVGElement)) throw new Error('图表格式无效');
      root.replaceChildren(svg);
      const bounds = svg.getBoundingClientRect();
      const box = svg.viewBox.baseVal;
      const size = svgPreviewSize(box.width || bounds.width, box.height || bounds.height);
      port.postMessage({ image: mermaidSvgImage(svg), ...size });
    } catch {
      port.postMessage({ error: '图表未能绘制，请检查 Mermaid 源码。' });
    } finally {
      port.close();
    }
  },
  { once: true },
);
