import { MAX_CLIPBOARD_CHARS } from '../context-menu/contracts.js';
import { displayImageUrl, imageHostReference, VIRTUAL_DOCUMENT_PATH } from '../images/contracts.js';
import { clipboardMarkupAddressAllowed } from './clipboard-address.js';

const semanticAncestors = new Set(['STRONG', 'EM', 'DEL', 'CODE', 'A', 'U', 'MARK', 'SUB', 'SUP']);
const removedElements =
  '.md-meta,.md-content,.md-tooltip-remove,script,style,iframe,object,embed,link,meta,base';
const privateAttributes = new Set([
  'cid',
  'mdtype',
  'md-inline',
  'contenteditable',
  'spellcheck',
  'tabindex',
  'draggable',
]);

/** Incoming rich content still rejects these addresses. Local copy may retain
 * the same document source only through the existing plain Markdown writer. */
export class ClipboardMarkupAddressError extends Error {
  constructor() {
    super('剪贴板 Markdown HTML 包含不允许的地址');
  }
}

/** MathJax's non-executable source carrier is text, never clipboard DOM. Keep
 * only its TeX body and discard the duplicate rendered/assistive presentation. */
function clipboardMathText(root: DocumentFragment | HTMLElement): void {
  for (const math of root.querySelectorAll('[md-inline="inline_math"]')) {
    const sources = math.querySelectorAll('script[type="math/tex"]');
    if (sources.length !== 1) continue;
    const source = sources[0];
    if (!source) continue;
    source.replaceWith(root.ownerDocument.createTextNode(source.textContent ?? ''));
    for (const rendered of math.querySelectorAll('mjx-container')) rendered.remove();
  }
}

/** The private flavor needs Markdown markers/type boundaries, never executable
 * DOM, editor identities, live capabilities or arbitrary widget attributes. */
export function clipboardMarkupHTML(html: string): string {
  if (html.length > MAX_CLIPBOARD_CHARS) throw new Error('剪贴板 Markdown HTML 超出大小限制');
  const template = document.createElement('template');
  template.innerHTML = html;
  clipboardMathText(template.content);
  for (const node of template.content.querySelectorAll(
    'script,style,iframe,frame,object,embed,link,meta,base,form,input,textarea,button,select,option,svg,math,template,video,audio,source',
  ))
    node.remove();
  const tags = new Set([
    'DIV',
    'FIGURE',
    'SPAN',
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'STRONG',
    'B',
    'EM',
    'I',
    'DEL',
    'S',
    'U',
    'MARK',
    'SUB',
    'SUP',
    'A',
    'IMG',
    'PRE',
    'CODE',
    'BR',
    'HR',
    'UL',
    'OL',
    'LI',
    'BLOCKQUOTE',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'TD',
    'TH',
  ]);
  let projectedSize = html.length;
  for (const node of template.content.querySelectorAll('*')) {
    if (!tags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const attribute of [...node.attributes]) {
      const key = attribute.name.toLowerCase();
      const imageBoundary = ['image', 'imgtag'].includes(node.getAttribute('md-inline') ?? '');
      if (imageBoundary && ['data-src', 'data-root', 'data-copy-from-path'].includes(key)) {
        if (key === 'data-copy-from-path') {
          if (attribute.value !== VIRTUAL_DOCUMENT_PATH) node.removeAttribute(attribute.name);
        } else if (key === 'data-root') {
          if (attribute.value) imageHostReference(imageHostReference('image.png', attribute.value));
        } else if (/^data:/i.test(attribute.value)) displayImageUrl(attribute.value);
        else imageHostReference(attribute.value);
        continue;
      }
      if (key === 'class') {
        const tasks =
          node.tagName === 'LI'
            ? attribute.value
                .split(/\s+/u)
                .filter((value) =>
                  ['md-task-list-item', 'task-list-done', 'task-list-not-done'].includes(value),
                )
            : [];
        if (tasks.length) node.setAttribute('class', [...new Set(tasks)].join(' '));
        else node.removeAttribute('class');
        continue;
      }
      // Shipped tables keep their type on FIGURE and column alignment on the
      // cells. Preserve only this finite CSS value, never arbitrary clipboard CSS.
      if (key === 'style' && (node.tagName === 'TH' || node.tagName === 'TD')) {
        const align = (node as HTMLElement).style.textAlign.toLowerCase();
        node.removeAttribute('style');
        if (['left', 'center', 'right'].includes(align))
          (node as HTMLElement).style.textAlign = align;
        continue;
      }
      const allowed =
        key === 'mdtype' ||
        key === 'md-inline' ||
        key === 'title' ||
        (node.hasAttribute('mdtype') &&
          (key === 'ahead' || key === 'tail') &&
          /^\d{1,6}$/u.test(attribute.value)) ||
        (node.tagName === 'A' && key === 'href') ||
        (node.tagName === 'IMG' && (key === 'src' || key === 'alt')) ||
        (node.tagName === 'PRE' && node.getAttribute('mdtype') === 'fences' && key === 'lang') ||
        (node.tagName === 'OL' && key === 'start');
      if (allowed && (key === 'ahead' || key === 'tail')) {
        projectedSize += Number(attribute.value) * 2;
        if (projectedSize > MAX_CLIPBOARD_CHARS)
          throw new Error('剪贴板 Markdown HTML 的空行展开超出大小限制');
      }
      if (!allowed) node.removeAttribute(attribute.name);
      else if (
        (key === 'href' || key === 'src') &&
        !clipboardMarkupAddressAllowed(attribute.value, node.tagName === 'IMG')
      ) {
        throw new ClipboardMarkupAddressError();
      }
    }
  }
  return template.innerHTML;
}

export function clipboardMarkupEvent(
  content: { text: string; html?: string; markHtml?: string },
  normalize: (html: string) => string,
): ClipboardEvent {
  const data = new DataTransfer();
  data.setData('text/plain', content.text);
  if (content.html) data.setData('text/html', normalize(content.html));
  if (content.markHtml) {
    const markup = clipboardMarkupHTML(normalize(content.markHtml));
    if (!markup) throw Error('剪贴板 Markdown HTML 没有可粘贴内容');
    data.setData('text/markhtml', markup);
  }
  return new ClipboardEvent('paste', { clipboardData: data });
}

/** cloneContents omits shared inline owners. Rebuild only their selected body
 * and syntax siblings, never the owner's unselected body or live identity. */
export function clipboardSelectionMarkupHTML(
  area: HTMLElement,
  range: Range,
  normalize: (html: string) => string,
  project: (html: string) => string = (html) => html,
): string | undefined {
  if (range.collapsed || !area.contains(range.startContainer) || !area.contains(range.endContainer))
    return;
  const document = area.ownerDocument;
  const syntax = (node: Node) => node instanceof Element && node.matches('.md-meta,.md-content');
  const restoreSyntax = (original: Element, copy: Element) => {
    if (!original.hasAttribute('md-inline') || original.getAttribute('md-inline') === 'plain')
      return;
    const body = document.createDocumentFragment();
    for (const child of [...copy.childNodes]) if (!syntax(child)) body.append(child);
    copy.replaceChildren();
    let inserted = false;
    for (const child of original.childNodes) {
      if (syntax(child)) copy.append(child.cloneNode(true));
      else if (!inserted) {
        copy.append(body);
        inserted = true;
      }
    }
    if (!inserted) copy.append(body);
  };
  const common = range.commonAncestorContainer;
  const root = common.nodeType === 1 ? (common as Element) : common.parentElement;
  const selected = range.cloneContents();
  // cloneContents also clips non-shared owners at either endpoint. Bind their
  // document order to the actual intersecting owners before changing the clone.
  const originals = [...(root?.querySelectorAll('[md-inline]') ?? [])].filter((node) =>
    range.intersectsNode(node),
  );
  const copies = [...selected.querySelectorAll('[md-inline]')];
  if (
    originals.length !== copies.length ||
    originals.some(
      (node, index) => node.getAttribute('md-inline') !== copies[index]?.getAttribute('md-inline'),
    )
  )
    throw Error('无法证明剪贴板 Markdown HTML 的格式边界');
  for (let index = originals.length - 1; index >= 0; index--) {
    const original = originals[index],
      copy = copies[index];
    if (original && copy) restoreSyntax(original, copy);
  }
  let fragment: Node = selected;
  for (let element = root; element && element !== area; element = element.parentElement) {
    if (!element.hasAttribute('md-inline') && !semanticAncestors.has(element.tagName)) continue;
    const wrapper = element.cloneNode(false) as Element;
    wrapper.append(fragment);
    restoreSyntax(element, wrapper);
    fragment = wrapper;
  }
  const container = document.createElement('div');
  container.append(fragment);
  return clipboardMarkupHTML(normalize(project(container.innerHTML)));
}

/** Project exactly the selected DOM into clipboard HTML. Range.cloneContents
 * omits a shared semantic ancestor (e.g. a text range inside STRONG), so clone
 * only that ancestor's tag/semantic attributes around the selected fragment.
 * No live selection, model, history, or unselected text is changed or copied. */
export function clipboardSelectionHTML(
  area: HTMLElement,
  range: Range,
  restoreImageURLs: (html: string) => string,
  project: (html: string) => string = (html) => html,
): string | undefined {
  if (range.collapsed || !area.contains(range.startContainer) || !area.contains(range.endContainer))
    return;
  const document = area.ownerDocument;
  if (
    range.startContainer.ownerDocument !== document ||
    range.endContainer.ownerDocument !== document
  )
    return;
  const common = range.commonAncestorContainer;
  let element = common.nodeType === 1 ? (common as Element) : common.parentElement;
  if (element?.closest(removedElements)) return '';
  let fragment: Node = range.cloneContents();
  for (; element && element !== area; element = element.parentElement) {
    if (!semanticAncestors.has(element.tagName)) continue;
    const wrapper = document.createElement(element.tagName.toLowerCase());
    if (element.tagName === 'A') {
      for (const name of ['href', 'title']) {
        const value = element.getAttribute(name);
        if (value !== null) wrapper.setAttribute(name, value);
      }
    }
    wrapper.append(fragment);
    fragment = wrapper;
  }
  const container = document.createElement('div');
  container.append(fragment);
  // Resolve image capabilities while the copied wrappers still have their
  // source metadata. The callback operates on detached HTML, never the document.
  container.innerHTML = restoreImageURLs(project(container.innerHTML));
  clipboardMathText(container);
  for (const unwanted of container.querySelectorAll(removedElements)) unwanted.remove();
  for (const copied of container.querySelectorAll('*')) {
    for (const attribute of [...copied.attributes]) {
      const name = attribute.name.toLowerCase();
      const imageSource = copied.tagName === 'IMG' && name === 'data-marklyra-image-source';
      if (
        privateAttributes.has(name) ||
        name === 'ahead' ||
        name === 'tail' ||
        name === 'pattern' ||
        name === 'patternend' ||
        name === 'prespace' ||
        name === 'markindent' ||
        name === 'isfixed' ||
        name.startsWith('on') ||
        name.startsWith('aria-') ||
        (name.startsWith('data-') && !imageSource) ||
        (name === 'id' && copied.namespaceURI !== 'http://www.w3.org/2000/svg')
      )
        copied.removeAttribute(attribute.name);
      else if (name === 'class') {
        const publicClasses = attribute.value
          .split(/\s+/)
          .filter((value) => value && !/^(?:md-|marklyra-|CodeMirror|MathJax)/.test(value));
        if (publicClasses.length) copied.setAttribute('class', publicClasses.join(' '));
        else copied.removeAttribute('class');
      }
    }
  }
  return container.innerHTML;
}
