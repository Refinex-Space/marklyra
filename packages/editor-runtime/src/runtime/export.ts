import {
  type ExportHTMLOptions,
  exportOptions,
  MAX_EXPORT_BYTES,
  MAX_EXPORT_RESOURCE_BYTES,
  sameRuntimeOrigin,
} from '../export/options.js';
import { printArtifactStyles } from '../export/print-styles.js';
import { imageData, portableCss, resourceBytes } from '../export/resources.js';
import { cssUrlTokens, stripLocalFontSources } from '../styles/css-resources.js';
import type { LegacyGlobals } from './legacy-types.js';

interface Dependencies {
  runtime: LegacyGlobals;
  composing(): boolean;
  loading(): boolean;
}
const csp =
  "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'";
/** Used only in a disposable renderer, never against the active editor state. */
export class RuntimeExport {
  private readonly abort = new AbortController();
  private busy = false;
  private bytes = 0;
  private readonly resources = new Map<string, Promise<string>>();
  constructor(private readonly deps: Dependencies) {}
  destroy(): void {
    this.abort.abort();
  }
  private async pause(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    if (this.abort.signal.aborted) throw new Error('HTML 导出已取消');
  }
  private async readyAssets(): Promise<void> {
    const deadline = Date.now() + 15_000;
    do {
      const root = this.deps.runtime.editor?.writingArea;
      if (!root) throw new Error('编辑器尚未初始化');
      const unavailable = root.querySelector(
        '.md-image[data-marklyra-image-state="unavailable"],.md-image[data-marklyra-image-state="error"]',
      );
      if (unavailable) throw new Error('图片不可用，无法生成完整的自包含 HTML');
      const images = Array.from(root.querySelectorAll('img'));
      const graphs = Array.from(root.querySelectorAll('.md-fences[lang="mermaid"]'));
      const formulas = Array.from(root.querySelectorAll('.md-math-block'));
      if (
        !root.querySelector('.md-image[data-marklyra-image-state="loading"]') &&
        document.fonts.status === 'loaded' &&
        images.every((image) => image.complete && image.naturalWidth > 0) &&
        graphs.every((graph) => graph.querySelector('svg')) &&
        formulas.every((formula) => formula.querySelector('svg'))
      )
        return;
      await this.pause();
    } while (Date.now() < deadline);
    throw new Error('图片、公式或图表未完成渲染，HTML 导出已停止');
  }
  private async dataUrl(url: string, type: 'image' | 'font'): Promise<string> {
    const key = `${type}:${url}`;
    const cached = this.resources.get(key);
    if (cached) return cached;
    const work = (async () => {
      const parsed = new URL(url, location.href);
      if (
        type === 'image' &&
        !['data:', 'blob:'].includes(parsed.protocol) &&
        !sameRuntimeOrigin(parsed, new URL(location.href))
      )
        throw new Error('拒绝导出未经授权的图片网络地址');
      if (parsed.protocol === 'data:') {
        const data = imageData(url);
        return this.encode(data.bytes, data.mime);
      }
      const response = await fetch(parsed.href, {
        signal: this.abort.signal,
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`导出资源读取失败：${response.status}`);
      const contentType =
        (response.headers.get('content-type') ?? '').split(';')[0]?.toLowerCase() ?? '';
      if (type === 'image' && !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(contentType))
        throw new Error('导出图片类型无效');
      const bytes = await resourceBytes(response);
      const mime =
        type === 'image'
          ? contentType
          : /\.woff2(?:$|[?#])/i.test(url)
            ? 'font/woff2'
            : /\.woff(?:$|[?#])/i.test(url)
              ? 'font/woff'
              : 'font/ttf';
      return this.encode(bytes, mime);
    })();
    this.resources.set(key, work);
    return work;
  }
  private encode(bytes: Uint8Array, mime: string): string {
    if (!bytes.length || bytes.byteLength > MAX_EXPORT_RESOURCE_BYTES)
      throw new Error('导出资源为空或超过 8 MiB');
    this.bytes += bytes.byteLength;
    if (this.bytes > MAX_EXPORT_BYTES / 1.4) throw new Error('自包含 HTML 超过 32 MiB');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return `data:${mime};base64,${btoa(binary)}`;
  }
  private async themeStyles(forPrint: boolean): Promise<string> {
    const theme = document.querySelector<HTMLLinkElement>('#theme_css');
    if (!theme?.sheet) throw new Error('导出主题尚未加载');
    const visited = new Set<CSSStyleSheet>();
    const collect = async (sheet: CSSStyleSheet): Promise<string> => {
      if (visited.has(sheet)) return '';
      visited.add(sheet);
      const url = new URL(sheet.href ?? theme.href, location.href);
      if (
        !sameRuntimeOrigin(url, new URL(location.href)) ||
        !url.pathname.toLowerCase().endsWith('.css')
      )
        throw new Error('导出主题包含未授权样式');
      const output: string[] = [];
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule.type === CSSRule.IMPORT_RULE) {
          const imported = rule as CSSImportRule;
          if (!imported.styleSheet) throw new Error('导出主题的引用样式未加载');
          const css = await collect(imported.styleSheet);
          output.push(
            imported.media.mediaText ? `@media ${imported.media.mediaText} {${css}}` : css,
          );
          continue;
        }
        let css = rule.cssText;
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const declaration = (rule as CSSFontFaceRule).style;
          const source = stripLocalFontSources(declaration.getPropertyValue('src'));
          if (!source) throw new Error('无法将仅引用本机字体的主题导出为自包含 HTML');
          css = `@font-face{${Array.from(declaration)
            .map((property) => {
              const value = property === 'src' ? source : declaration.getPropertyValue(property);
              return `${property}:${value}${declaration.getPropertyPriority(property) ? '!important' : ''}`;
            })
            .join(';')}}`;
        }
        for (const token of cssUrlTokens(css).reverse()) {
          const source = token.value;
          if (source.startsWith('#') || source.startsWith('data:')) continue;
          const resource = new URL(source, url);
          const font = /\.(?:woff2?|ttf|otf|eot)$/i.test(resource.pathname);
          if (
            !sameRuntimeOrigin(resource, new URL(location.href)) ||
            (!font && !/\.(?:png|jpe?g|gif|webp|svg)$/i.test(resource.pathname))
          )
            throw new Error('导出主题包含未授权资源');
          const embedded = `url("${await this.dataUrl(resource.href, font ? 'font' : 'image')}${font ? '' : resource.hash}")`;
          css = css.slice(0, token.from) + embedded + css.slice(token.to);
        }
        output.push(portableCss(css));
      }
      return output.join('\n');
    };
    const output: string[] = [];
    const links = [
      ...(forPrint ? document.querySelectorAll('link[css-include]') : []),
      ...['theme_css', 'base_user_css', 'theme_user_css'].map((id) => document.getElementById(id)),
    ];
    for (const link of links) {
      if (!(link instanceof HTMLLinkElement) || !link.sheet)
        throw new Error('导出主题覆盖样式尚未加载');
      output.push(await collect(link.sheet));
    }
    return output.join('\n');
  }
  async html(value: ExportHTMLOptions): Promise<string> {
    if (this.busy || this.deps.loading() || this.deps.composing())
      throw new Error('请先完成当前编辑操作');
    const options = exportOptions(value),
      editor = this.deps.runtime.editor;
    if (!editor) throw new Error('编辑器尚未初始化');
    this.busy = true;
    try {
      editor.export.beforeExport(!!options.print);
      await this.readyAssets();
      // The original exporter intentionally emits Markdown destinations, not decorated img.src.
      // Rebind only destinations already resolved by this renderer's document-scoped image host.
      const imageUrls = new Map<string, string>();
      for (const image of editor.writingArea.querySelectorAll<HTMLImageElement>('img')) {
        const wrapper = image.closest<HTMLElement>('.md-image');
        const source = wrapper?.dataset.marklyraImageSource ?? wrapper?.dataset.src;
        if (source) imageUrls.set(source, image.src);
        imageUrls.set(image.src, image.src);
      }
      const html = await editor.export.exportToHTML({
        noStyle: !options.styled,
        ...(options.print ? { forPrint: true, splitPages: options.print.splitPages } : {}),
      });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (options.print) {
        // The Mac serializer delegates af:/at: links to its original native
        // PDF host. Convert only its actual heading destinations into standard
        // document fragments for this scriptless HTML/PDF preview.
        const headings = new Map<string, string>();
        for (const anchor of doc.querySelectorAll('a.md-print-anchor[name][href]')) {
          const source = anchor.getAttribute('href') ?? '';
          const name = anchor.getAttribute('name') ?? '';
          if (/^af:\/\/[\w-]+$/.test(source) && /^[\w-]+$/.test(name)) {
            headings.set(source.slice(5), name);
            anchor.id = name;
            anchor.setAttribute('href', `#${name}`);
          }
        }
        for (const anchor of doc.querySelectorAll('a[href]')) {
          const source = anchor.getAttribute('href') ?? '';
          if (!/^(?:af|at):/i.test(source)) continue;
          const target = source.startsWith('at://') ? headings.get(source.slice(5)) : undefined;
          if (target) anchor.setAttribute('href', `#${target}`);
          else anchor.removeAttribute('href');
        }
      }
      for (const element of doc.querySelectorAll(
        'script,iframe,frame,object,embed,base,link,meta[http-equiv],form,video,audio,source,track,animate,animateMotion,animateTransform,set,discard,template',
      ))
        element.remove();
      for (const element of doc.querySelectorAll('*')) {
        for (const attribute of Array.from(element.attributes)) {
          if (
            /^on/i.test(attribute.name) ||
            [
              'srcdoc',
              'srcset',
              'contenteditable',
              'autofocus',
              'formaction',
              'action',
              'ping',
            ].includes(attribute.name)
          )
            element.removeAttribute(attribute.name);
        }
        if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
          for (const name of [
            'fill',
            'stroke',
            'filter',
            'clip-path',
            'mask',
            'marker-start',
            'marker-mid',
            'marker-end',
            'cursor',
          ]) {
            const value = element.getAttribute(name);
            if (value) portableCss(value);
          }
        }
        if (element.matches('input')) element.setAttribute('disabled', '');
        if (
          element.matches('a[href]') &&
          /^(?:javascript|vbscript|data|blob|file|runtime):/i.test(
            element.getAttribute('href')?.trim() ?? '',
          )
        )
          element.removeAttribute('href');
      }
      for (const image of doc.querySelectorAll(
        'img[src],svg image[href],svg image[xlink\\:href]',
      )) {
        const attribute = image.hasAttribute('src')
          ? 'src'
          : image.hasAttribute('href')
            ? 'href'
            : 'xlink:href';
        const url = image.getAttribute(attribute) ?? '';
        if (!url) throw new Error('导出图片没有有效地址');
        const authorized = url.startsWith('data:') ? url : imageUrls.get(url);
        if (!authorized) throw new Error('导出图片尚未获得当前文档授权');
        image.setAttribute(attribute, await this.dataUrl(authorized, 'image'));
      }
      for (const style of doc.querySelectorAll('style')) {
        if (!options.styled) style.remove();
        else style.textContent = portableCss(style.textContent ?? '');
      }
      for (const element of doc.querySelectorAll('[style]'))
        element.setAttribute('style', portableCss(element.getAttribute('style') ?? ''));
      if (options.styled) {
        // Native path.readText is deliberately unavailable. Include the actual bundled
        // theme explicitly; original export's null-read join can suppress its fallback.
        const theme = doc.createElement('style');
        theme.id = 'marklyra-export-theme';
        theme.textContent = await this.themeStyles(!!options.print);
        doc.head.append(theme);
      }
      if (options.print) {
        const print = doc.createElement('style');
        print.id = 'marklyra-print-layout';
        print.textContent = printArtifactStyles;
        doc.head.append(print);
      }
      if (options.extraCss) {
        const extra = doc.createElement('style');
        extra.id = 'marklyra-export-extra';
        extra.textContent = portableCss(options.extraCss);
        doc.head.append(extra);
      }
      if (options.title !== undefined) doc.title = options.title;
      const policy = doc.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = csp;
      doc.head.prepend(policy);
      const result = `<!doctype html>\n${doc.documentElement.outerHTML}`;
      if (new TextEncoder().encode(result).byteLength > MAX_EXPORT_BYTES)
        throw new Error('自包含 HTML 超过 32 MiB');
      return result;
    } finally {
      this.busy = false;
    }
  }
}
