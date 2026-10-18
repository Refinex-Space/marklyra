import { createHash } from 'node:crypto';
import { parse } from 'acorn';

const originalSha256 = '8d2048f9fc9aff8a307a784dd8bf5976dce50a35eb8c9b8b334e2933e58f1289',
  templateSha256 = '9af0f490291a94fee8355770a94e5d889547395c67379c932b7440856b105c39';
const digest = (value) => createHash('sha256').update(value).digest('hex');
function locate(source) {
  const matches = [
    ...source.matchAll(
      /<script\b[^>]*\bid=["']md-html-iframe-preload-temp["'][^>]*>([\s\S]*?)<\/script>/gu,
    ),
  ];
  const match = matches[0],
    text = match?.[1];
  if (matches.length !== 1 || !text || digest(text) !== templateSha256)
    throw Error('Runtime HTML preview: unknown iframe template SHA-256');
  const from = match.index + match[0].indexOf(text),
    objects = [];
  function walk(node) {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.name === 'postMessage' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'top'
    )
      objects.push(node.callee.object);
    for (const value of Object.values(node))
      for (const child of Array.isArray(value) ? value : [value])
        if (child && typeof child === 'object' && typeof child.type === 'string') walk(child);
  }
  walk(parse(text, { ecmaVersion: 'latest' }));
  if (objects.length !== 4) throw Error('Runtime HTML preview: unknown message destination count');
  return { from, text, objects };
}
/** The runtime editor is itself an iframe. Its own generated HTML preview
 * must send to its immediate editor parent, without forwarding arbitrary top messages. */
export function transformRuntimeHTMLPreview(original, generated = original) {
  if (typeof original !== 'string' || digest(original) !== originalSha256)
    throw Error('Runtime HTML preview: unknown original index SHA-256');
  if (typeof generated !== 'string') throw Error('Expected generated runtime page');
  locate(original);
  const target = locate(generated),
    edits = target.objects.map((node) => ({
      start: target.from + node.start,
      end: target.from + node.end,
      text: 'parent',
    }));
  let code = generated;
  for (const edit of [...edits].reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'html-preview-editor-parent',
      version: 1,
      originalSha256,
      templateSha256,
      inputSha256: digest(generated),
      transformedSha256: digest(code),
      edits,
    },
  };
}
