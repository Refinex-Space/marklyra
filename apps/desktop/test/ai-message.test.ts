import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MessageContent } from '../src/features/ai/MessageContent.js';
import { documentLink, encodeDocumentPath } from '../src/features/ai/model.js';

function render(source: string) {
  return renderToStaticMarkup(
    createElement(MessageContent, { source, root: '/vault', open: () => {}, report: () => {} }),
  );
}
it('document labels do not create nested anchors or lose relative directory targets', () => {
  const html = render('[Other.md](Notes/Other.md)');
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).toContain('#document:Notes%2FOther.md');
});
it('supports parenthesized filenames and mention paths containing URL-reserved characters', () => {
  const path = 'Notes/Plan (final)#1.md';
  expect(documentLink(encodeDocumentPath(path), '/vault')).toBe(path);
  const html = render('[Plan (final).md](Notes/Plan (final).md) tail');
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).toContain('#document:Notes%2FPlan%20(final).md');
  expect(html).toContain(' tail');
});
it('long plain prose stays plain and raw HTML never executes', () => {
  expect(render('文'.repeat(50_000))).not.toContain('<a ');
  expect(render('<script>alert(1)</script>')).not.toContain('<script>');
});

it('preserves literal environment variable names in provider error messages', () => {
  const source =
    '[error] No API key found. Set the Z_AI_API_KEY environment variable, or run `glm-acp-agent --setup` to store one.';
  const html = render(source);
  expect(html).toContain('Set the Z_AI_API_KEY environment variable');
  expect(html).not.toContain('<em>');
  expect(html).toContain('<code>glm-acp-agent --setup</code>');
});
it('retains identifier underscores inside bold, code and document labels alongside real emphasis', () => {
  const html = render('_AI_ **Z_AI_API_KEY** `Z_AI_API_KEY` [Z_AI_API_KEY](Notes/my_file_name.md)');
  expect(html).toContain('<em>AI</em>');
  expect(html).toContain('<strong>Z_AI_API_KEY</strong>');
  expect(html).toContain('<code>Z_AI_API_KEY</code>');
  expect(html).toContain('#document:Notes%2Fmy_file_name.md');
  expect(html).toContain('>Z_AI_API_KEY</a>');
});
