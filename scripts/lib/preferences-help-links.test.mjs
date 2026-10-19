import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'acorn';
import { preferenceHelpLinkEdits } from './preferences-help-links.mjs';

const source = await readFile(
  new URL(
    '../../resources/editor/page-dist/static/js/Preferences.962926a4.d7f6a912.chunk.js',
    import.meta.url,
  ),
  'utf8',
);

test('help-link rendering omits fallback links and preserves descriptive hints', () => {
  const edits = preferenceHelpLinkEdits(source, parse(source, { ecmaVersion: 'latest' }));
  assert.equal(edits.length, 3);
  for (const edit of edits) {
    const context = (description) => ({
      t: description,
      a: description,
      o: 'https://example.com/help',
      i: 'https://example.com/help',
      C: 'hint',
      m: { a: { createElement: (component, props) => ({ component, props }) } },
    });
    for (const empty of ['', null, undefined])
      assert.equal(runInNewContext(edit.text, context(empty)), null);
    const description = 'Keep this explanation';
    const rendered = runInNewContext(edit.text, context(description));
    if (edit.text !== 'null') {
      assert.equal(rendered.component, 'hint');
      assert.equal(rendered.props.text, description);
      assert.equal(rendered.props.link, 'https://example.com/help');
    } else assert.equal(rendered, null);
  }
});

test('unknown help-link layouts are rejected', () => {
  assert.throws(
    () => preferenceHelpLinkEdits('', parse('', { ecmaVersion: 'latest' })),
    /Unexpected original Preferences help-link structure/,
  );
});
