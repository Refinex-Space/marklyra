import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { answerSections } from '../src/features/ai/answer-sections.js';
import { codeTokens } from '../src/features/ai/code-tokens.js';
import { MessageContent } from '../src/features/ai/MessageContent.js';
import { documentLink, encodeDocumentPath } from '../src/features/ai/model.js';

function render(source: string, answer = true) {
  return renderToStaticMarkup(
    createElement(MessageContent, {
      source,
      answer,
      root: '/vault',
      open: () => {},
      report: () => {},
    }),
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

it('renders aligned tables, semantic lists, literal inline code and frontmatter', () => {
  const html = render(
    '---\nowner: team\n---\n\n## Results\n\n| Item | Cost |\n| --- | ---: |\n| **One** | 12 |\n\n3. Third\n   - [x] Done\n\n`Notes/Plan.md`',
  );
  expect(html).toContain('owner: team');
  expect(html).toContain('<table>');
  expect(html).toContain('text-align:right');
  expect(html).toContain('<strong>One</strong>');
  expect(html).toContain('<ol start="3">');
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('<code>Notes/Plan.md</code>');
});

it('keeps prose around tables, pipes inside code, Windows paths and nested tables', () => {
  const html = render(
    [
      '说明',
      '文件 | 表达式',
      '--- | ---:',
      'C:\\notes\\ | ``a|b``',
      '结束 | C:\\folder\\',
      '正常的结语',
      '',
      '- 检查',
      '  | 键 | 值 |',
      '  |---|---|',
      '  | x | a\\|b |',
    ].join('\r\n'),
  );
  expect(html.match(/<table>/g)).toHaveLength(2);
  expect(html).toContain('C:\\folder\\</td>');
  expect(html).toContain('<code>a|b</code>');
  expect(html).toContain('a|b</td>');
  expect(html).toContain('正常的结语');
  expect(html).toMatch(/<li>[\s\S]+<table>[\s\S]+<\/li>/);
});

it('keeps original fence contents, YAML and loose list boundaries across streaming appends', () => {
  const text = [
    '---',
    'note: original',
    '',
    'keep: true',
    '---',
    '',
    '# A',
    '',
    '3. Three',
    '',
    '4. Four',
    '',
    '~~~~js',
    'const code = 1;',
    '',
    '~~~',
    '',
    'still code',
    '~~~~',
    '',
    'After',
  ].join('\r\n');
  for (const length of [40, 80, text.length]) {
    const prefix = text.slice(0, length);
    expect(
      answerSections(prefix)
        .map((p) => p.text)
        .join(''),
    ).toBe(prefix);
  }
  expect(answerSections(text).some((p) => p.text.includes('3. Three\r\n\r\n4. Four'))).toBe(true);
  expect(answerSections(text).some((p) => p.text.includes('~~~\r\n\r\nstill code'))).toBe(true);
  expect(render(text)).toContain('<ol start="3">');
});
it('syntax colouring preserves all bytes and oversized or unknown examples remain plain', () => {
  for (const language of ['typescript', 'json', 'bash', 'python', 'diff']) {
    const source = 'const n = 3;\r\n  # sample\n+line\n';
    expect(
      codeTokens(source, language)
        ?.map((t) => t.text)
        .join(''),
    ).toBe(source);
  }
  expect(codeTokens('sample', 'other')).toBeNull();
  expect(codeTokens('x'.repeat(20001), 'js')).toBeNull();
  const longText = 'x'.repeat(97000) + '原文结尾';
  expect(render(longText)).toContain(longText);
  expect(render('```mermaid\n' + 'x'.repeat(13000) + '\n```')).toContain('图表较大');
});
