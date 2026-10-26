/** A finite DOM grammar for source-equivalent inline paragraphs. This is a proof
 * boundary, not an HTML-to-Markdown converter. The caller must additionally
 * compare captured rawText, model text, serializer output and actual next text. */
export function sourceInlineTree(paragraph: HTMLElement): boolean {
  // Literal Unicode (including emoji joiners) is source. Runtime controls and
  // structural characters with unproven rawText behavior are not accepted.
  for (const char of paragraph.textContent ?? '') {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 9 && code !== 10) || [127, 0x200b, 0xe027].includes(code))
      return false;
  }
  const classes = (element: Element, allowed: readonly string[]) =>
    [...element.classList].every((name) => allowed.includes(name));
  const leaf = (element: Element) => [...element.childNodes].every((node) => node.nodeType === 3);
  const safe = (element: Element) => element.getAttribute('contenteditable') !== 'false';
  const meta = (element: Element | undefined, role: 'before' | 'after' | 'middle') =>
    element !== undefined &&
    safe(element) &&
    element.tagName === 'SPAN' &&
    !element.hasAttribute('md-inline') &&
    element.classList.contains('md-meta') &&
    classes(element, ['md-meta', 'md-before', 'md-after', 'md-meta-i', 'md-expand']) &&
    (role === 'middle' || element.classList.contains(`md-${role}`)) &&
    leaf(element);
  const children = (element: Element): boolean =>
    [...element.childNodes].every((node) =>
      node.nodeType === 3 ? true : node.nodeType === 1 && inline(node as Element),
    );
  const inline = (element: Element): boolean => {
    if (!safe(element) || element.tagName !== 'SPAN') return false;
    const type = element.getAttribute('md-inline');
    if (type === 'plain') return classes(element, ['md-plain', 'md-expand']) && leaf(element);
    if (type === 'softbreak')
      return (
        classes(element, ['md-softbreak', 'md-expand']) &&
        leaf(element) &&
        element.textContent === '\n'
      );
    if (type === 'escape') {
      const [marker, escaped] = [...element.childNodes];
      return (
        classes(element, ['md-expand']) &&
        element.childNodes.length === 2 &&
        marker?.nodeType === 1 &&
        meta(marker as Element, 'before') &&
        marker.textContent === '\\' &&
        escaped?.nodeType === 3 &&
        escaped.textContent !== null &&
        /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/.test(escaped.textContent)
      );
    }
    if (type === 'html_entity') {
      const [source] = [...element.children];
      return (
        element.classList.contains('md-entity') &&
        classes(element, ['md-entity', 'md-expand']) &&
        element.hasAttribute('data-content') &&
        element.childNodes.length === 1 &&
        meta(source, 'middle') &&
        /^&(?:[A-Za-z][A-Za-z0-9]+|#[0-9]+|#[xX][0-9A-Fa-f]+);$/.test(source?.textContent ?? '')
      );
    }
    if (type === 'linebreak') {
      const [spaces, marker, newline] = [...element.childNodes];
      return (
        element.classList.contains('md-linebreak') &&
        classes(element, ['md-linebreak', 'md-expand']) &&
        element.childNodes.length === 3 &&
        spaces?.nodeType === 3 &&
        spaces.textContent === '  ' &&
        marker?.nodeType === 1 &&
        (marker as Element).tagName === 'SPAN' &&
        safe(marker as Element) &&
        (marker as Element).classList.contains('md-linebreak-mark') &&
        classes(marker as Element, ['md-linebreak-mark']) &&
        marker.childNodes.length === 0 &&
        newline?.nodeType === 3 &&
        newline.textContent === '\n'
      );
    }
    if (type === 'strong' || type === 'em' || type === 'del' || type === 'code') {
      if (!classes(element, ['md-pair-s', 'md-empty', 'md-expand'])) return false;
      const [before, body, after] = [...element.children];
      if (
        element.childNodes.length !== 3 ||
        !meta(before, 'before') ||
        !meta(after, 'after') ||
        !body ||
        !safe(body) ||
        body.tagName !==
          (type === 'strong' ? 'STRONG' : type === 'em' ? 'EM' : type === 'del' ? 'DEL' : 'CODE') ||
        body.hasAttribute('md-inline') ||
        body.classList.length
      )
        return false;
      return type === 'code' ? leaf(body) : children(body);
    }
    if (type === 'link') {
      if (!classes(element, ['md-meta-i-c', 'md-empty-link', 'md-link', 'md-expand'])) return false;
      const [open, label, middle, url, gap, title, close] = [...element.children];
      return (
        element.childNodes.length === 7 &&
        meta(open, 'before') &&
        open?.textContent === '[' &&
        label !== undefined &&
        safe(label) &&
        label.tagName === 'A' &&
        classes(label, ['md-inner-link']) &&
        children(label) &&
        meta(middle, 'before') &&
        middle?.textContent === '](' &&
        url !== undefined &&
        safe(url) &&
        url.tagName === 'SPAN' &&
        url.classList.contains('md-url') &&
        classes(url, ['md-content', 'md-url', 'md-expand']) &&
        leaf(url) &&
        meta(gap, 'middle') &&
        title !== undefined &&
        safe(title) &&
        title.tagName === 'SPAN' &&
        title.classList.contains('md-link-title') &&
        classes(title, ['md-content', 'md-link-title', 'md-expand']) &&
        leaf(title) &&
        meta(close, 'after')
      );
    }
    // Rendering wraps an empty formatting pair after body deletion.
    // Other block-like constructs (heading, rule, quote...) are not accepted.
    if (type === null && classes(element, ['md-block-like']) && element.classList.length === 1) {
      const pair = element.firstElementChild;
      return (
        element.childNodes.length === 1 &&
        pair !== null &&
        pair.classList.contains('md-empty') &&
        ['strong', 'em'].includes(pair.getAttribute('md-inline') ?? '') &&
        inline(pair)
      );
    }
    return false;
  };
  return children(paragraph);
}

export interface SourceDOMPoint {
  readonly path: readonly number[];
  readonly offset: number;
  readonly nodeType: number;
  readonly role: string;
}
function roleOf(paragraph: HTMLElement, node: Node): string {
  const roles: string[] = [];
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element && element !== paragraph) {
    roles.unshift(
      `${element.tagName}:${element.getAttribute('md-inline') ?? ''}:${[...element.classList]
        .filter((name) => name !== 'md-expand')
        .sort()
        .join('.')}`,
    );
    element = element.parentElement;
  }
  return roles.join('/');
}
/** No live DOM or document text is retained by history metadata. */
export function captureSourceDOMPoint(
  paragraph: HTMLElement,
  node: Node,
  offset: number,
): SourceDOMPoint | undefined {
  const path: number[] = [];
  let current = node;
  while (current !== paragraph) {
    const parent = current.parentNode;
    if (!parent) return;
    const index = [...parent.childNodes].indexOf(current as ChildNode);
    if (index < 0) return;
    path.unshift(index);
    current = parent;
  }
  return { path, offset, nodeType: node.nodeType, role: roleOf(paragraph, node) };
}
export function restoreSourceDOMPoint(
  paragraph: HTMLElement,
  saved: SourceDOMPoint,
  prefix: string,
  readPrefix: (node: Node, offset: number) => string | undefined,
): [Node, number] | undefined {
  let node: Node | undefined = paragraph;
  for (const index of saved.path) node = node?.childNodes[index];
  const matches = (candidate: Node, offset: number) =>
    candidate.nodeType === saved.nodeType &&
    roleOf(paragraph, candidate) === saved.role &&
    readPrefix(candidate, offset) === prefix;
  if (node && matches(node, saved.offset)) return [node, saved.offset];
  // Reparsing can split a text leaf. Accept only a unique matching semantic
  // endpoint, never the first occurrence of an equal source string.
  if (saved.nodeType !== 3) return;
  const walker = paragraph.ownerDocument.createTreeWalker(paragraph, 4);
  let current = walker.nextNode(),
    at = 0;
  const candidates: [Node, number][] = [];
  while (current) {
    const length = current.textContent?.length ?? 0,
      local = prefix.length - at;
    if (local >= 0 && local <= length && matches(current, local)) candidates.push([current, local]);
    at += length;
    current = walker.nextNode();
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
