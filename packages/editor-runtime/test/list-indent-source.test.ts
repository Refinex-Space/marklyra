import { describe, expect, it } from 'vitest';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';
import { captureListIndent, type ListIndentAction } from '../src/runtime/list-indent-source.js';

class Model {
  attrs: Record<string, unknown> = {};
  children: Model[] = [];
  mark = '';
  constructor(
    readonly cid: string,
    type: string,
    text = '',
  ) {
    this.attrs = { type, text };
  }
  get(key: string): unknown {
    return this.attrs[key];
  }
  getFirstChild() {
    return this.children[0];
  }
  getFirstBrother() {
    return this;
  }
  toMark() {
    return this.mark;
  }
  append(...nodes: Model[]) {
    this.children = nodes;
    nodes.forEach((node, i) => {
      node.attrs.parent = this;
      node.attrs.after = nodes[i + 1];
    });
  }
}
function fixture(ending: '\n' | '\r\n' = '\r\n', marker = '- ', texts = ['Alpha', 'Beta']) {
  const root = new Model('list', 'list'),
    tail = new Model('tail', 'paragraph', 'Tail  ');
  const items = texts.map((text, index) => {
    const node = new Model(`li${index}`, 'list_item'),
      paragraph = new Model(`p${index}`, 'paragraph', text);
    node.append(paragraph);
    return { node, paragraph, text };
  });
  root.append(...items.map((item) => item.node));
  root.attrs.after = tail;
  root.attrs.tail = 1;
  root.mark = items.map((item) => marker + item.text).join(ending) + ending;
  const before = `Before${ending}${ending}`,
    canonical = `${before + root.mark + ending}Tail  ${ending}`;
  const block = {
    id: root.cid,
    from: before.length,
    to: before.length + root.mark.length + ending.length,
    text: root.mark + ending,
  };
  const registry = new Map(
    [root, tail, ...items.flatMap((item) => [item.node, item.paragraph])].map((node) => [
      node.cid,
      node,
    ]),
  );
  const rootElement = {
    parentElement: undefined as unknown,
    matches: () => true,
    children: items.map((item) => ({ getAttribute: () => item.node.cid })),
    getAttribute: () => root.cid,
  };
  const itemElement = {
    parentElement: rootElement,
    matches: () => true,
    getAttribute: () => items.at(-1)?.node.cid,
  };
  const paragraphElement = {
    parentElement: itemElement,
    contains: () => true,
    getAttribute: () => items.at(-1)?.paragraph.cid,
  };
  const endpoint = { nodeType: 3, parentElement: { closest: () => paragraphElement } };
  const selection = { rangeCount: 1, isCollapsed: true, anchorNode: endpoint, focusNode: endpoint };
  const document = { getSelection: () => selection };
  const area = { ownerDocument: document, contains: () => true };
  rootElement.parentElement = area;
  const editor = {
    sourceView: { inSourceMode: false },
    writingArea: area,
    getNode: (id: string) => registry.get(id),
  };
  return {
    root,
    items,
    registry,
    canonical,
    block,
    selection,
    editor,
    capture: (action: ListIndentAction = 'indent') =>
      captureListIndent(editor as unknown as LegacyEditor, canonical, [block], action, ending),
    indent: (indent = '  ', padding: string = ending) => {
      const target = items.at(-1),
        prior = items.at(-2);
      if (!target || !prior) throw Error('fixture needs two items');
      const nested = new Model('nested', 'list');
      nested.attrs.tail = 1;
      root.append(...items.slice(0, -1).map((item) => item.node));
      prior.node.append(prior.paragraph, nested);
      nested.append(target.node);
      registry.set(nested.cid, nested);
      const lines = items.map((item) => marker + item.text);
      lines[lines.length - 1] = indent + lines.at(-1);
      root.mark = lines.join(ending) + ending + padding;
      return `${before + root.mark + ending}Tail  ${ending}`;
    },
  };
}

describe('selected list-item indentation source receipt', () => {
  it.each(['\n', '\r\n'] as const)(
    'separates the exact prefix edit from generated container padding with %j',
    (ending) => {
      const f = fixture(ending),
        complete = f.capture(),
        next = f.indent(),
        receipt = complete?.(next);
      const from = f.block.from + `- Alpha${ending}`.length;
      expect(receipt).toEqual({
        base: f.canonical,
        patches: [{ from, to: from, insert: '  ' }],
        editCanonical: `${f.canonical.slice(0, from)}  ${f.canonical.slice(from)}`,
        canonical: next,
        normalizationPatches: [{ from: f.block.to + 2, to: f.block.to + 2, insert: ending }],
      });
    },
  );
  it.each(['- ', '+ ', '* ', '1. ', '31) ', '- [ ] ', '- [x] '])(
    'keeps the original marker %j and Unicode text',
    (marker) => {
      const f = fixture('\n', marker, ['中文😀', '中文😀', '中文😀']),
        complete = f.capture();
      const receipt = complete?.(f.indent('\t'));
      expect(receipt?.patches).toEqual([
        {
          from: f.block.from + `${marker}中文😀\n`.length * 2,
          to: f.block.from + `${marker}中文😀\n`.length * 2,
          insert: '\t',
        },
      ]);
    },
  );
  it('allows an unchanged serializer tail without inventing normalization', () => {
    const f = fixture(),
      complete = f.capture();
    expect(complete?.(f.indent('    ', ''))?.normalizationPatches).toEqual([]);
  });
  it.each([
    'outdent',
    'source',
    'expanded',
    'cross-item',
    'receipt',
    'nested',
    'loose',
    'first-item',
  ])('does not arm unsupported %s', (mode) => {
    const f = fixture();
    if (mode === 'source') f.editor.sourceView.inSourceMode = true;
    if (mode === 'expanded') f.selection.isCollapsed = false;
    if (mode === 'cross-item')
      f.selection.focusNode = null as unknown as typeof f.selection.focusNode;
    if (mode === 'receipt') f.block.text += 'x';
    if (mode === 'nested') f.root.attrs.parent = f.root;
    if (mode === 'loose') f.root.mark = f.root.mark.replace('Alpha\r\n', 'Alpha\r\n\r\n');
    if (mode === 'first-item') f.items.pop();
    expect(f.capture(mode === 'outdent' ? 'outdent' : 'indent')).toBeUndefined();
  });
  it.each([
    'text',
    'identity',
    'parent',
    'sibling',
    'outside',
    'extra-padding',
    'non-prefix',
    'source',
  ])('rejects stale or unexplained %s after the operation', (mode) => {
    const f = fixture(),
      complete = f.capture();
    let next = f.indent();
    const target = f.items.at(-1);
    if (!target) throw Error('missing target');
    if (mode === 'text') target.paragraph.attrs.text = 'changed';
    if (mode === 'identity')
      f.registry.set(target.paragraph.cid, new Model(target.paragraph.cid, 'paragraph', 'Beta'));
    if (mode === 'parent') target.node.attrs.parent = f.root;
    if (mode === 'sibling') target.node.attrs.after = f.root;
    if (mode === 'outside') next += '!';
    if (mode === 'extra-padding') {
      f.root.mark += '\r\n';
      next = next.replace('Tail', '\r\nTail');
    }
    if (mode === 'non-prefix') {
      f.root.mark = f.root.mark.replace('Beta', 'Beta!');
      next = next.replace('Beta', 'Beta!');
    }
    if (mode === 'source') f.editor.sourceView.inSourceMode = true;
    expect(complete?.(next)).toBeUndefined();
  });
});
