import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext, Script } from 'node:vm';
import { transformRuntimeContextCursor } from './runtime-context-cursor.mjs';
import { transformRuntimeFocus } from './runtime-focus.mjs';
import { transformRuntimeHTMLLifecycle } from './runtime-html-lifecycle.mjs';
import { transformRuntimeHTMLPreview } from './runtime-html-preview.mjs';
import { transformRuntimeLiteral } from './runtime-literal.mjs';
import { transformRuntimePairing } from './runtime-pairing.mjs';
import { transformRuntimeRenderLifecycle } from './runtime-render-lifecycle.mjs';
import { transformRuntimeSerialization } from './runtime-serialization.mjs';
import { transformRuntimeTableColumns } from './runtime-table-columns.mjs';

const mainPath = new URL('../../resources/editor/appsrc/main.js', import.meta.url),
  indexPath = new URL('../../resources/editor/index.html', import.meta.url),
  original = await readFile(mainPath, 'utf8'),
  index = await readFile(indexPath, 'utf8'),
  digest = (value) => createHash('sha256').update(value).digest('hex');
let prior = transformRuntimeSerialization(original).code;
for (const transform of [
  transformRuntimePairing,
  transformRuntimeFocus,
  transformRuntimeContextCursor,
  transformRuntimeLiteral,
  transformRuntimeTableColumns,
])
  prior = transform(original, prior).code;
const html = transformRuntimeHTMLLifecycle(original, prior),
  render = transformRuntimeRenderLifecycle(original, html.code),
  pagePrior = index.replace('<head>', '<head><script src="frame-host.js"></script>'),
  preview = transformRuntimeHTMLPreview(index, pagePrior);

function restored(output, input, edits) {
  let shift = 0;
  const positions = edits.map((edit) => {
    const position = edit.start + shift;
    shift += edit.text.length - (edit.end - edit.start);
    return { edit, position };
  });
  for (const { edit, position } of positions.reverse())
    output =
      output.slice(0, position) +
      input.slice(edit.start, edit.end) +
      output.slice(position + edit.text.length);
  return output;
}
function syntax(code) {
  try {
    new Script(code);
    return true;
  } catch {
    return false;
  }
}
test('HTML and render transforms require exact original provenance, unchanged modules and single application', () => {
  for (const transform of [transformRuntimeHTMLLifecycle, transformRuntimeRenderLifecycle]) {
    for (const bad of [null, 42, '', original + '\n'])
      assert.throws(() => transform(bad), /unknown original/);
    assert.throws(() => transform(original, null), /Expected generated/);
  }
  assert.throws(() => transformRuntimeHTMLLifecycle(original, html.code), /duplicate hook/);
  assert.throws(() => transformRuntimeRenderLifecycle(original, render.code), /duplicate hook/);
  const h = html.metadata.edits[0].start,
    r = render.metadata.edits[0].start;
  assert.throws(
    () => transformRuntimeHTMLLifecycle(original, prior.slice(0, h) + ' ' + prior.slice(h)),
    /unknown module/,
  );
  assert.throws(
    () =>
      transformRuntimeRenderLifecycle(original, html.code.slice(0, r) + ' ' + html.code.slice(r)),
    /unknown module/,
  );
});
test('only the two HTML and nine render boundary edits change the composed source bytes', async () => {
  for (const [result, input, count] of [
    [html, prior, 2],
    [render, html.code, 9],
  ]) {
    assert.equal(result.metadata.edits.length, count);
    assert.equal(result.metadata.inputSha256, digest(input));
    assert.equal(result.metadata.transformedSha256, digest(result.code));
    assert.equal(digest(restored(result.code, input, result.metadata.edits)), digest(input));
    assert.ok(
      restored(result.code, input, result.metadata.edits) === input,
      'Bytes outside guarded edits changed',
    );
    assert.equal(syntax(result.code), true);
  }
  assert.equal(digest(await readFile(mainPath)), html.metadata.originalSha256);
});
test('the original Enter callback remains unchanged with no host hook and is suppressible at its exact hook', () => {
  const expression = html.metadata.edits[0].text,
    calls = [];
  const context = { c: { UserOp: { insertParagraph: (...args) => calls.push(args) } } };
  runInNewContext(expression, context)();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], []);
  calls.length = 0;
  runInNewContext(expression, { ...context, __MARKLYRA_HTML_CALLBACK__: () => () => undefined })();
  assert.equal(calls.length, 0);
});
test('preview rewrites only four top destinations in the hash-bound generated iframe template', async () => {
  assert.equal(preview.metadata.edits.length, 4);
  assert.equal(
    digest(restored(preview.code, pagePrior, preview.metadata.edits)),
    digest(pagePrior),
  );
  assert.ok(
    restored(preview.code, pagePrior, preview.metadata.edits) === pagePrior,
    'Unrelated page bytes changed',
  );
  for (const edit of preview.metadata.edits) {
    assert.equal(pagePrior.slice(edit.start, edit.end), 'top');
    assert.equal(edit.text, 'parent');
  }
  assert.equal(preview.metadata.inputSha256, digest(pagePrior));
  assert.equal(preview.metadata.transformedSha256, digest(preview.code));
  assert.throws(() => transformRuntimeHTMLPreview(index + '\n'), /unknown original/);
  assert.throws(() => transformRuntimeHTMLPreview(index, preview.code), /unknown iframe template/);
  assert.equal(digest(await readFile(indexPath)), preview.metadata.originalSha256);
});
