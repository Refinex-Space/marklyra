import { describe, expect, it } from 'vitest';
import { editorThemeSelector } from '../src/styles/theme-namespaces.js';

describe('editor theme namespace roles', () => {
  it('adapts only finite editor roles while retaining original selector matches', () => {
    expect(editorThemeSelector('#legacy-editor-source .CodeMirror, #legacy-editor-sidebar')).toBe(
      ':is(#legacy-editor-source,#marklyra-source) .CodeMirror, :is(#legacy-editor-sidebar,#marklyra-sidebar)',
    );
    expect(editorThemeSelector('.cm-s-legacy-editor-default .cm-keyword')).toBe(
      ':is(.cm-s-legacy-editor-default,.cm-s-marklyra-default) .cm-keyword',
    );
    expect(editorThemeSelector('body.legacy-editor-export #write p')).toBe(
      'body:is(.legacy-editor-export,.marklyra-export) #write p',
    );
    expect(
      editorThemeSelector('body.dark.legacy-editor-print, body.legacy-editor-sourceview-on'),
    ).toBe(
      'body.dark:is(.legacy-editor-print,.marklyra-print), body:is(.legacy-editor-sourceview-on,.marklyra-sourceview-on)',
    );
  });
  it('preserves negation and zero-specificity selector structure', () => {
    expect(
      editorThemeSelector(':not(#legacy-editor-source) > :where(#legacy-editor-sidebar)'),
    ).toBe(
      ':not(:is(#legacy-editor-source,#marklyra-source)) > :where(:is(#legacy-editor-sidebar,#marklyra-sidebar))',
    );
    expect(editorThemeSelector('body:not(.legacy-editor-export) #write')).toBe(
      'body:not(:is(.legacy-editor-export,.marklyra-export)) #write',
    );
    expect(editorThemeSelector('body:where(:not(.legacy-editor-print))')).toBe(
      'body:where(:not(:is(.legacy-editor-print,.marklyra-print)))',
    );
  });
  it.each([
    '#marklyra-source .cm-s-marklyra-default, body.marklyra-export',
    '#legacy-editor-widget .legacy-editor-toolbar',
    'div.legacy-editor-export',
    '[data-id="#legacy-editor-source"][data-url="url(#legacy-editor-sidebar)"]',
    '[data-id=#legacy-editor-source]',
    String.raw`#legacy\-editor-source`,
    '#legacy-editor-source中文',
    '#legacy-editor-Source',
    '/* #legacy-editor-source */ .unchanged',
  ])(
    'leaves canonical, unknown, attribute, quoted or escaped selector %s untouched',
    (selector) => {
      expect(editorThemeSelector(selector)).toBe(selector);
    },
  );
  it('preserves an existing custom element instead of assigning its role to the editor', () => {
    expect(
      editorThemeSelector(
        '#custom-sidebar, #legacy-editor-source',
        (selector) => selector === '#custom-sidebar',
      ),
    ).toBe('#custom-sidebar, :is(#legacy-editor-source,#marklyra-source)');
  });
  it('is idempotent before and after CSSOM whitespace serialization', () => {
    const original =
      'body.legacy-editor-export :not(#legacy-editor-source) .cm-s-legacy-editor-default';
    const once = editorThemeSelector(original);
    expect(editorThemeSelector(once)).toBe(once);
    const serialized = once.replaceAll(',', ', ');
    expect(editorThemeSelector(serialized)).toBe(serialized);
    const negated = editorThemeSelector('body:not(.legacy-editor-export)');
    expect(editorThemeSelector(negated)).toBe(negated);
  });
});
