import { displayImageUrl } from '../images/contracts.js';
import { cssUrlTokens } from '../styles/css-resources.js';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';
const svgTags = new Set(
  'svg g path rect circle ellipse line polyline polygon text tspan textPath defs marker pattern linearGradient radialGradient stop clipPath mask filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence image use foreignObject a title desc'
    .toLowerCase()
    .split(' '),
);
const htmlTags = new Set(
  'div span p br b strong i em u s small pre code sub sup table tr td th tbody thead ul ol li img a'.split(
    ' ',
  ),
);
const paint =
  'color fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit opacity visibility display font-family font-size font-weight font-style font-variant font-stretch letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline text-decoration white-space line-height text-align vertical-align background-color border-color border-width border-style border-radius padding margin box-sizing overflow vector-effect paint-order stop-color stop-opacity flood-color flood-opacity lighting-color clip-path mask filter marker-start marker-mid marker-end'.split(
    ' ',
  );

export function svgPreviewSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw Error('图表尺寸无效');
  const scale = Math.min(
    1,
    16384 / width,
    16384 / height,
    Math.sqrt(16_777_216 / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** Keep local paint references, never fetch styles, fonts, images or link targets. */
export function localSvgPaint(
  value: string,
  base: string,
  ids: ReadonlySet<string>,
): string | undefined {
  let result = value;
  for (const token of cssUrlTokens(value).reverse()) {
    let fragment = token.value;
    if (!fragment.startsWith('#')) {
      try {
        const url = new URL(fragment, base),
          own = new URL(base);
        if (url.origin !== own.origin || url.pathname !== own.pathname || url.search !== own.search)
          return;
        fragment = url.hash;
      } catch {
        return;
      }
    }
    if (!fragment.startsWith('#') || !ids.has(fragment.slice(1)) || /[\s"'()\\]/.test(fragment))
      return;
    result =
      result.slice(0, token.from) +
      `url("${fragment.replaceAll('"', '\\"')}")` +
      result.slice(token.to);
  }
  return result;
}

/** Freeze only a detached, bounded SVG copy. HTML labels remain foreignObject content
 * inside an <img>, never executable DOM in the host document. */
export function mermaidSvgImage(svg: SVGSVGElement): string {
  const original = [svg, ...svg.querySelectorAll('*')];
  if (original.length > 10000) throw Error('图表过于复杂，暂不支持大图预览');
  const viewBox = svg.viewBox.baseVal;
  const bounds = svg.getBoundingClientRect();
  const width = viewBox.width || svg.width.baseVal.value || bounds.width;
  const height = viewBox.height || svg.height.baseVal.value || bounds.height;
  const size = svgPreviewSize(width, height);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const copies = [clone, ...clone.querySelectorAll('*')];
  const ids = new Set(original.map((element) => element.id).filter(Boolean));
  for (const [index, element] of original.entries()) {
    const copy = copies[index];
    if (!copy || (copy !== clone && !clone.contains(copy))) continue;
    const allowed =
      element.namespaceURI === SVG ? svgTags : element.namespaceURI === HTML ? htmlTags : undefined;
    if (!allowed?.has(element.localName.toLowerCase())) {
      copy.remove();
      continue;
    }
    for (const attribute of [...copy.attributes]) {
      const name = attribute.localName.toLowerCase();
      if (
        /^on/.test(name) ||
        [
          'style',
          'srcdoc',
          'srcset',
          'contenteditable',
          'tabindex',
          'autofocus',
          'ping',
          'target',
          'download',
          'formaction',
          'action',
        ].includes(name)
      )
        copy.removeAttributeNode(attribute);
      else if (name === 'href' || name === 'src') {
        const value = attribute.value;
        if (value.startsWith('#') && ids.has(value.slice(1))) continue;
        if (['image', 'img'].includes(element.localName) && value.startsWith('data:image/')) {
          try {
            displayImageUrl(value);
            continue;
          } catch {
            /* Drop unsupported image payloads. */
          }
        }
        copy.removeAttributeNode(attribute);
      } else if (/url\s*\(/i.test(attribute.value)) {
        const value = localSvgPaint(attribute.value, svg.ownerDocument.baseURI, ids);
        if (value === undefined) copy.removeAttributeNode(attribute);
        else copy.setAttribute(attribute.name, value);
      }
    }
    const computed = getComputedStyle(element),
      styled = copy as SVGElement | HTMLElement;
    for (const name of paint) {
      const value = localSvgPaint(computed.getPropertyValue(name), svg.ownerDocument.baseURI, ids);
      if (value) styled.style.setProperty(name, value);
    }
    if (element.namespaceURI === HTML) {
      for (const name of [
        'width',
        'height',
        'min-width',
        'max-width',
        'min-height',
        'max-height',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'justify-content',
        'align-items',
        'flex',
        'flex-direction',
        'gap',
        'word-break',
        'overflow-wrap',
        'text-transform',
      ]) {
        const value = computed.getPropertyValue(name);
        if (value) styled.style.setProperty(name, value);
      }
    }
  }
  clone.setAttribute('xmlns', SVG);
  if (!viewBox.width || !viewBox.height) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttribute('width', String(size.width));
  clone.setAttribute('height', String(size.height));
  clone.style.maxWidth = 'none';
  clone.style.width = `${size.width}px`;
  clone.style.height = `${size.height}px`;
  const serialized = new XMLSerializer().serializeToString(clone);
  if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024)
    throw Error('图表预览内容超过大小限制');
  return displayImageUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`);
}
