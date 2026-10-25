import type { BlockIndentAction } from '../../packages/editor-runtime/src/runtime/block-indent-source.js';

export interface BlockIndentFixture {
  readonly name: string;
  readonly source: string;
  readonly from: string;
  readonly to?: string;
  readonly action: BlockIndentAction;
  readonly canonical: string;
  readonly edited: string;
  readonly noop: boolean;
}
/** Authored documents; internal editor command observations plus reviewed raw-format intent. */
export const blockIndentFixtures: readonly BlockIndentFixture[] = [
  {
    name: 'indent-middle',
    source: '- Alpha\n- Beta\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '- Alpha\n  - Beta\n\n- Gamma\n\nTail',
    edited: '- Alpha\n  - Beta\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'indent-multiple',
    source: '- Alpha\n- Beta\n- Gamma\n- Delta\n\nTail',
    from: 'Beta',
    to: 'Gamma',
    action: 'indent',
    canonical: '- Alpha\n  - Beta\n  - Gamma\n\n- Delta\n\nTail',
    edited: '- Alpha\n  - Beta\n  - Gamma\n- Delta\n\nTail',
    noop: false,
  },
  {
    name: 'indent-nested-middle',
    source: '- Alpha\n  - Beta\n  - Gamma\n  - Delta\n- End\n\nTail',
    from: 'Gamma',
    action: 'indent',
    canonical: '- Alpha\n  - Beta\n    - Gamma\n  - Delta\n- End\n\nTail',
    edited: '- Alpha\n  - Beta\n    - Gamma\n  - Delta\n- End\n\nTail',
    noop: false,
  },
  {
    name: 'indent-ordered',
    source: '9. Alpha\n10. Beta\n11. Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '9. Alpha\n   1. Beta\n\n10. Gamma\n\nTail',
    edited: '9. Alpha\n   1. Beta\n11. Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'indent-task',
    source: '- [x] Alpha\n- [ ] Beta\n- [x] Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '- [x] Alpha\n  - [ ] Beta\n\n- [x] Gamma\n\nTail',
    edited: '- [x] Alpha\n  - [ ] Beta\n- [x] Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'indent-multiparagraph',
    source: '- Alpha\n\n- Beta\n\n  Continued\n\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '- Alpha\n\n  - Beta\n\n\n  Continued\n\n- Gamma\n\nTail',
    edited: '- Alpha\n\n  - Beta\n\n  Continued\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'indent-fence',
    source:
      '- Alpha\n- Beta\n\n  ```ts\n  const n = 1;\n\n  console.log(n);\n  ```\n\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical:
      '- Alpha\n\n  - Beta\n\n\n  ```ts\n  const n = 1;\n  \n  console.log(n);\n  ```\n- Gamma\n\nTail',
    edited:
      '- Alpha\n  - Beta\n\n  ```ts\n  const n = 1;\n\n  console.log(n);\n  ```\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'indent-quote-child',
    source: '- Alpha\n- Beta\n\n  > Quoted\n  >\n  > More\n\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '- Alpha\n\n  - Beta\n\n\n  > Quoted\n  >\n  > More\n- Gamma\n\nTail',
    edited: '- Alpha\n  - Beta\n\n  > Quoted\n  >\n  > More\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-top-middle',
    source: '- Alpha\n- Beta\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '- Alpha\n\nBeta\n\n- Gamma\n\nTail',
    edited: '- Alpha\n\nBeta\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-multiple',
    source: '- Alpha\n- Beta\n- Gamma\n- Delta\n\nTail',
    from: 'Beta',
    to: 'Gamma',
    action: 'outdent',
    canonical: '- Alpha\n\nBeta\n\nGamma\n\n- Delta\n\nTail',
    edited: '- Alpha\n\nBeta\n\nGamma\n\n- Delta\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-nested-middle',
    source: '- Alpha\n  - Beta\n  - Gamma\n  - Delta\n- End\n\nTail',
    from: 'Gamma',
    action: 'outdent',
    canonical: '- Alpha\n  - Beta\n- Gamma\n  - Delta\n- End\n\nTail',
    edited: '- Alpha\n  - Beta\n- Gamma\n  - Delta\n- End\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-nested-descendant',
    source: '- Alpha\n  - Beta\n    - Child\n  - Gamma\n- End\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '- Alpha\n- Beta\n  - Child\n\n  - Gamma\n\n- End\n\nTail',
    edited: '- Alpha\n- Beta\n  - Child\n  - Gamma\n- End\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-ordered',
    source: '9. Alpha\n10. Beta\n11. Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '9. Alpha\n\nBeta\n\n9. Gamma\n\nTail',
    edited: '9. Alpha\n\nBeta\n\n9. Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-task',
    source: '- [x] Alpha\n- [ ] Beta\n- [x] Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '- [x] Alpha\n\nBeta\n\n- [x] Gamma\n\nTail',
    edited: '- [x] Alpha\n\nBeta\n\n- [x] Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-multiparagraph',
    source: '- Alpha\n\n- Beta\n\n  Continued\n\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '- Alpha\n\n\nBeta\n\nContinued\n\n- Gamma\n\nTail',
    edited: '- Alpha\n\n\nBeta\n\nContinued\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-fence',
    source:
      '- Alpha\n- Beta\n\n  ```ts\n  const n = 1;\n\n  console.log(n);\n  ```\n\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '- Alpha\n\nBeta\n\n```ts\nconst n = 1;\n\nconsole.log(n);\n```\n\n- Gamma\n\nTail',
    edited: '- Alpha\n\nBeta\n\n```ts\nconst n = 1;\n\nconsole.log(n);\n```\n\n- Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-quote-middle',
    source: '> Alpha\n>\n> Beta\n>\n> Gamma\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '> Alpha\n>\n\nBeta\n\n> Gamma\n\nTail',
    edited: '> Alpha\n>\n\nBeta\n\n> Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'outdent-nested-quote',
    source: '> Alpha\n>\n> > Beta\n> >\n> > Gamma\n>\n> End\n\nTail',
    from: 'Beta',
    action: 'outdent',
    canonical: '> Alpha\n>\n> Beta\n> \n> > Gamma\n>\n> End\n\nTail',
    edited: '> Alpha\n>\n> Beta\n> \n> > Gamma\n>\n> End\n\nTail',
    noop: false,
  },
  {
    name: 'indent-quote-noop',
    source: '> Alpha\n>\n> Beta\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '> Alpha\n>\n> Beta\n\nTail',
    edited: '> Alpha\n>\n> Beta\n\nTail',
    noop: true,
  },
  {
    name: 'quote-wrap',
    source: 'Alpha\n\nBeta\n\nGamma\n\nTail',
    from: 'Beta',
    to: 'Gamma',
    action: 'quote',
    canonical: 'Alpha\n\n> Beta\n>\n> Gamma\n>\n\nTail',
    edited: 'Alpha\n\n> Beta\n>\n> Gamma\n>\n\nTail',
    noop: false,
  },
  {
    name: 'quote-unwrap',
    source: '> Alpha\n>\n> Beta\n\nTail',
    from: 'Beta',
    action: 'quote',
    canonical: 'Alpha\n\nBeta\n\nTail',
    edited: 'Alpha\n\nBeta\n\nTail',
    noop: false,
  },
  {
    name: 'quote-partial-nest',
    source: '> Alpha\n>\n> Beta\n>\n> Gamma\n\nTail',
    from: 'Beta',
    to: 'Beta',
    action: 'quote',
    canonical: '> Alpha\n>\n> > Beta\n> >\n>\n> Gamma\n\nTail',
    edited: '> Alpha\n>\n> > Beta\n> >\n>\n> Gamma\n\nTail',
    noop: false,
  },
  {
    name: 'mixed-list-indent',
    source:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n- Beta\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    action: 'indent',
    from: 'Beta',
    canonical:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n  - Beta\n\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    edited:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n  - Beta\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    noop: false,
  },
  {
    name: 'mixed-list-outdent',
    source:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n- Beta\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    action: 'outdent',
    from: 'Beta',
    canonical:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n\nBeta\n\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    edited:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n- Alpha\n\nBeta\n\n- Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    noop: false,
  },
  {
    name: 'mixed-quote-outdent',
    source:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n> Alpha\n>\n> Beta\n>\n> Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    action: 'outdent',
    from: 'Beta',
    canonical:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n> Alpha\n>\n\nBeta\n\n> Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    edited:
      '---\ntitle: fixture\n---\n\n[TOC]\n\n# Heading\n\n![asset](fixture.png) **strong** [ref].\n\n> Alpha\n>\n\nBeta\n\n> Gamma\n\n| A | B |\n|---|---|\n|x|y|\n\n$$\na+b\n$$\n\n```ts\nlet n = 1;\n```\n\nNote[^n].\n\n[^n]: Footnote\n\n[ref]: https://example.invalid\n\nTail',
    noop: false,
  },
  {
    name: 'quote-wrap-single-EOL-boundary',
    source: '# Before\r\nBeta\r\n# After\r\nTail',
    from: 'Beta',
    action: 'quote',
    canonical: '# Before\r\n> Beta\r\n\r\n# After\r\nTail',
    edited: '# Before\r\n> Beta\r\n\r\n# After\r\nTail',
    noop: false,
  },
  {
    name: 'quote-outdent-softbreak',
    source: '> Alpha\r\n> Beta\r\n\r\nTail',
    from: 'Alpha\nBeta',
    action: 'outdent',
    canonical: 'Alpha\r\nBeta\r\n\r\nTail',
    edited: 'Alpha\r\nBeta\r\n\r\nTail',
    noop: false,
  },
  {
    name: 'empty-task-outside',
    source: '- [ ]\n\n- Alpha\n- Beta\n- Gamma\n\nTail',
    from: 'Beta',
    action: 'indent',
    canonical: '- [ ]\n\n- Alpha\n  - Beta\n\n- Gamma\n\nTail',
    edited: '- [ ]\n\n- Alpha\n  - Beta\n- Gamma\n\nTail',
    noop: false,
  },
];
