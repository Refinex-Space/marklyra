import { createHash } from 'node:crypto';

const originalSha256 = '61225843f078dd2ec9155bbf588423fb12db7ac66dc87a2082346792d04a0899';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const scope = ':where(.zenuml,.zenuml *)';
const rules = [
  {
    selector: '*,:before,:after',
    start: 9704,
    end: 10668,
    sha256: '713be0a21e294c767059f6ab76fcbac759dd1fc1c806fbeebbfa05779c3e9216',
    text: `${scope},${scope}:before,${scope}:after`,
  },
  {
    selector: '::backdrop',
    start: 10668,
    end: 11626,
    sha256: '34e7255542d787985ad8b32e06da75e26fbf8d066ec5290c1c43da39f425622e',
    text: `${scope}::backdrop`,
  },
];

/** Confine the bundled Tailwind initializers to the diagrams that use them.
 * The raw asset stays unchanged. :where preserves the original specificity,
 * including the ZenUML root's own pseudo-elements, so utility overrides still win. */
export function transformRuntimeZenUMLStyles(originalCSS) {
  if (typeof originalCSS !== 'string' || digest(originalCSS) !== originalSha256)
    throw new Error('Runtime ZenUML style transform: unknown original CSS SHA-256');
  const edits = rules.map((rule) => {
    const marker = `${rule.selector}{`,
      source = originalCSS.slice(rule.start, rule.end),
      body = source.slice(marker.length, -1),
      declarations = body.split(';').filter((value) => value.trim());
    if (
      originalCSS.indexOf(marker) !== rule.start ||
      originalCSS.indexOf(marker, rule.start + 1) !== -1 ||
      digest(source) !== rule.sha256 ||
      !source.endsWith('}') ||
      declarations.length !== 44 ||
      declarations.some((value) => !/^--tw-[\w-]+:/.test(value.trim()))
    )
      throw new Error('Runtime ZenUML style transform: unknown initializer rule');
    return {
      start: rule.start,
      end: rule.start + rule.selector.length,
      text: rule.text,
      selector: rule.selector,
      ruleSha256: rule.sha256,
      declarations: declarations.length,
    };
  });
  let code = originalCSS;
  for (const edit of edits.toReversed())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return {
    code,
    metadata: {
      transform: 'zenuml-tailwind-scope',
      version: 1,
      originalSha256,
      inputSha256: digest(originalCSS),
      transformedSha256: digest(code),
      edits,
    },
  };
}
