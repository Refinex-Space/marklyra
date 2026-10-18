import { SourceMirror } from '@marklyra/editor-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sourceInlineTree } from '../src/runtime/inline-input.js';
import { plainTextPatch } from '../src/runtime/input-range.js';

type Tree = {
  nodeType: number;
  tagName?: string;
  childNodes: Tree[];
  readonly children: Tree[];
  readonly firstElementChild: Tree | null;
  readonly textContent: string;
  readonly classList: string[] & { contains(name: string): boolean };
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
};
function tree(tag: string, attributes: Record<string, string>, ...nodes: (Tree | string)[]): Tree {
  const childNodes = nodes.map((value) =>
    typeof value === 'string' ? tree('#text', { text: value }) : value,
  );
  const classList = (attributes.class ?? '').split(/\s+/).filter(Boolean) as Tree['classList'];
  classList.contains = (name) => classList.includes(name);
  return {
    nodeType: tag === '#text' ? 3 : 1,
    tagName: tag.toUpperCase(),
    childNodes,
    classList,
    get children() {
      return childNodes.filter((node) => node.nodeType === 1);
    },
    get firstElementChild() {
      return this.children[0] ?? null;
    },
    get textContent() {
      return tag === '#text'
        ? (attributes.text ?? '')
        : childNodes.map((node) => node.textContent).join('');
    },
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name),
  };
}
const paragraph = (...children: Tree[]) => tree('p', {}, ...children) as unknown as HTMLElement;
const meta = (source: string, extra: Record<string, string> = {}) =>
  tree('span', { class: 'md-meta md-before', ...extra }, source);
const escapeToken = (character = '*', extra: Record<string, string> = {}) =>
  tree('span', { 'md-inline': 'escape', ...extra }, meta('\\'), character);
const entity = (source = '&amp;', extra: Record<string, string> = {}) =>
  tree(
    'span',
    { 'md-inline': 'html_entity', class: 'md-entity', 'data-content': '&', ...extra },
    meta(source, { class: 'md-meta' }),
  );
const hardbreak = (render = '') =>
  tree(
    'span',
    { 'md-inline': 'linebreak', class: 'md-linebreak' },
    '  ',
    tree('span', { class: 'md-linebreak-mark' }, ...(render ? [render] : [])),
    '\n',
  );

describe('source-equivalent token proof boundary', () => {
  it.each(['*', '_', '[', ']', '\\', '`', '!'])(
    'accepts the observed escaped punctuation %s without decoding the source',
    (character) => {
      expect(sourceInlineTree(paragraph(escapeToken(character)))).toBe(true);
    },
  );
  it.each(['&amp;', '&nbsp;', '&#35;', '&#x1F600;'])(
    'accepts literal entity spelling %s as source text',
    (source) => {
      expect(sourceInlineTree(paragraph(entity(source)))).toBe(true);
    },
  );
  it('accepts two-space hard breaks and nested source tokens', () => {
    const strong = tree(
      'span',
      { 'md-inline': 'strong', class: 'md-pair-s' },
      meta('**'),
      tree('strong', {}, escapeToken(), entity()),
      meta('**', { class: 'md-meta md-after' }),
    );
    expect(sourceInlineTree(paragraph(strong, hardbreak(), escapeToken()))).toBe(true);
  });
  it('declines unproven decorations, altered structure and control text', () => {
    for (const node of [
      escapeToken('a'),
      escapeToken('*', { class: 'future-decoration' }),
      entity('&amp'),
      entity('&a;'),
      entity('&amp;', { contenteditable: 'false' }),
      hardbreak('rendered'),
      tree('span', { 'md-inline': 'html_inline' }, 'same'),
      escapeToken('\u200b'),
    ])
      expect(sourceInlineTree(paragraph(node))).toBe(false);
  });
  it('proves chosen repeated token ranges and untouched raw EOL through edit/Undo/Redo', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '\\*same\\*',
          '&amp;same',
          'same  \nsame',
          '**same *\\*same\\* &amp;same* same**',
        ),
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom('\r\n', '\n'),
        fc.constantFrom('\r\n', '\n'),
        (word, index, first, second) => {
          const model = `${word}\n${word}\n${word}`,
            canonical = model.replace(/\n/g, '\r\n');
          const raw = `${word}${first}${word}${second}${word}`;
          const start = index === 2 ? 2 * word.length + 1 : index * (word.length + 1),
            end = index === 2 ? model.length : start + word.length + 1;
          const patch = plainTextPatch({
            canonical,
            block: { id: 'p', from: 0, to: canonical.length, text: canonical },
            model,
            raw: model,
            rawWithoutControls: model,
            mark: canonical,
            ahead: 0,
            ending: '\r\n',
            startPrefix: model.slice(0, start),
            endPrefix: model.slice(0, end),
            insert: '',
          });
          expect(patch).toBeDefined();
          if (!patch) throw Error('Missing source proof');
          const next = canonical.slice(0, patch.from) + canonical.slice(patch.to),
            mirror = new SourceMirror(raw, canonical),
            initial = mirror.stateId;
          const expected = `${word}${index === 0 ? second : first}${word}`;
          expect(
            mirror.update(next, {
              kind: 'edit',
              baseStateId: initial,
              baseCanonical: canonical,
              patches: [patch],
            }).source,
          ).toBe(expected);
          const edited = mirror.stateId;
          expect(
            mirror.update(canonical, {
              kind: 'history',
              baseStateId: edited,
              targetStateId: initial,
            }).source,
          ).toBe(raw);
          expect(
            mirror.update(next, { kind: 'history', baseStateId: initial, targetStateId: edited })
              .source,
          ).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
