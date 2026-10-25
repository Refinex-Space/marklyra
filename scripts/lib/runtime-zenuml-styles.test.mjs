import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(
  new URL('../../packages/editor-runtime/vendor/diagram/css/mermaid-zenuml.css', import.meta.url),
  'utf8',
);
const scope = ':where(.zenuml,.zenuml *)';
const selectors = [`${scope},${scope}:before,${scope}:after`, `${scope}::backdrop`];

test('Tailwind defaults remain confined to ZenUML roots, descendants and their pseudo-elements', () => {
  assert.ok(!css.includes('*,:before,:after{'));
  for (const selector of selectors) assert.equal(css.split(`${selector}{`).length, 2);
  assert.ok(!css.includes(`${scope}:where(:before,:after)`));
});

test('both scoped initializer bodies retain the reviewed 44 property defaults and priorities', () => {
  for (const selector of selectors) {
    const start = css.indexOf('{', css.indexOf(selector));
    const body = css.slice(start, css.indexOf('}', start) + 1);
    assert.equal([...body.matchAll(/--tw-[\w-]+\s*:/g)].length, 44);
    assert.equal(
      createHash('sha256').update(body).digest('hex'),
      '2e809e517f6261c586390d6e9d6a1de641cb172960f7d94f1ec3165ac75c2be2',
    );
  }
});
