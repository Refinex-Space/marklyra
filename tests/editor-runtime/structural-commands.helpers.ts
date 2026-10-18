import type { Frame, FrameLocator } from '@playwright/test';
import type {
  LegacyGlobals,
  LegacyNode,
} from '../../packages/editor-runtime/src/runtime/legacy-types.js';

export async function selectStructure(
  frame: Frame | FrameLocator,
  from: string,
  to?: string,
  backward = false,
): Promise<void> {
  await frame.locator('#write').evaluate(
    (area, selection) => {
      const paragraphs = [...area.querySelectorAll<HTMLElement>('p[cid]')];
      const first = paragraphs.find((node) => node.textContent === selection.from);
      const last = selection.to
        ? paragraphs.find((node) => node.textContent === selection.to)
        : first;
      if (!first || !last) throw new Error('Missing structural command selection');
      area.focus();
      const end = (element: Element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let last = walker.nextNode();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
        if (!last) throw new Error('Missing structural Text endpoint');
        return last;
      };
      const a = end(first),
        b = end(last),
        native = getSelection();
      if (!native) throw new Error('Missing native Selection');
      if (selection.to && selection.backward)
        native.setBaseAndExtent(b, b.textContent?.length ?? 0, a, 0);
      else
        native.setBaseAndExtent(
          a,
          selection.to ? 0 : (a.textContent?.length ?? 0),
          b,
          b.textContent?.length ?? 0,
        );
    },
    { from, to, backward },
  );
}

/** Model meaning, not cid identity or decorative ordered-item pattern text. */
export async function structuralSemantics(frame: Frame | FrameLocator) {
  return frame.locator('#write').evaluate((area) => {
    const editor = (window as unknown as LegacyGlobals).editor;
    if (!editor) throw new Error('Missing structural model');
    const output: { type: unknown; text: unknown; lang: unknown; path: unknown[] }[] = [],
      seen = new Set<LegacyNode>();
    const read = (node: LegacyNode, key: string): unknown => Reflect.apply(node.get, node, [key]);
    const visit = (node: LegacyNode, path: unknown[], itemIndex = 0) => {
      if (seen.has(node)) throw new Error('Cyclic structural model');
      seen.add(node);
      const type = node.get('type');
      let next = path;
      if (type === 'list_item') {
        const parent = node.get('parent') as LegacyNode;
        next = [
          ...path,
          [
            'list',
            read(parent, 'style'),
            read(node, 'style') ?? null,
            read(node, 'checked') ?? null,
            itemIndex,
          ],
        ];
      }
      if (type === 'blockquote') next = [...path, ['quote', read(node, 'alert') ?? null]];
      if (type === 'list' || type === 'list_item' || type === 'blockquote') {
        let index = 0;
        for (let child = node.getFirstChild(); child; child = child.get('after'))
          visit(child, next, index++);
      } else {
        if (type === 'paragraph' && node.get('text') === '') {
          const dom = [...area.querySelectorAll('[cid]')].find(
            (element) => element.getAttribute('cid') === node.cid,
          );
          if (dom?.classList.contains('unholdable')) return;
        }
        output.push({ type, text: node.get('text'), lang: read(node, 'lang') ?? null, path: next });
      }
    };
    for (let node = editor.nodeMap.blocks.sortedFirst(); node; node = node.get('after'))
      visit(node, []);
    return output;
  });
}
