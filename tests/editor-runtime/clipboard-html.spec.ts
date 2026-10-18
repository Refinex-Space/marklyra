import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type {
  clipboardMarkupHTML,
  clipboardSelectionHTML,
  clipboardSelectionMarkupHTML,
} from '../../packages/editor-runtime/src/runtime/clipboard-html.js';

type Host = Window &
  typeof globalThis & {
    ClipboardTools: {
      clipboardSelectionHTML: typeof clipboardSelectionHTML;
      clipboardMarkupHTML: typeof clipboardMarkupHTML;
      clipboardSelectionMarkupHTML: typeof clipboardSelectionMarkupHTML;
    };
  };
const helperUrl = `/@fs${fileURLToPath(new URL('../../packages/editor-runtime/src/runtime/clipboard-html.ts', import.meta.url))}`;
test.beforeEach(async ({ page }) => {
  // Load the actual dependency graph. A transform-only IIFE cannot satisfy the
  // image capability imports used by this clipboard helper.
  await page.route('**/__clipboard_tools__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    }),
  );
  await page.goto('/__clipboard_tools__');
  await page.addScriptTag({
    type: 'module',
    content: `import * as tools from ${JSON.stringify(helperUrl)}; window.ClipboardTools = tools;`,
  });
  await page.waitForFunction(() => Boolean((window as Partial<Host>).ClipboardTools));
});
for (const tag of ['strong', 'em', 'del', 'code', 'a', 'u', 'mark', 'sub', 'sup'])
  test(`partial body inherits only the shared ${tag} semantic wrapper`, async ({ page }) => {
    const result = await page.evaluate((tag) => {
      const area = document.createElement('div');
      area.innerHTML = `<p>Outside <${tag} href="https://example.test/path" title="Link title" data-private="hidden" onclick="void 0"><span>BeforeBravoAfter</span></${tag}> Unselected</p>`;
      document.body.append(area);
      const text = area.querySelector(`${tag} span`)?.firstChild;
      if (!text) throw Error('No body');
      const range = document.createRange();
      range.setStart(text, 6);
      range.setEnd(text, 11);
      const selected = getSelection();
      selected?.setBaseAndExtent(text, 11, text, 6);
      const before = area.innerHTML;
      const html = (window as Host).ClipboardTools.clipboardSelectionHTML(
        area,
        range,
        (value) => value,
      );
      const template = document.createElement('template');
      template.innerHTML = html ?? '';
      return {
        html,
        text: template.content.textContent,
        unchanged: before === area.innerHTML,
        selection: { anchor: selected?.anchorOffset, head: selected?.focusOffset },
        firstTag: template.content.firstElementChild?.tagName,
        href: template.content.querySelector('a')?.getAttribute('href'),
      };
    }, tag);
    expect(result.text).toBe('Bravo');
    expect(result.firstTag).toBe(tag.toUpperCase());
    expect(result.html).not.toMatch(/Before|After|Outside|Unselected|data-private|onclick/);
    expect(result.unchanged).toBe(true);
    expect(result.selection).toEqual({ anchor: 11, head: 6 });
    if (tag === 'a') expect(result.href).toBe('https://example.test/path');
  });
test('partial nested link body keeps all shared ancestors without including unselected text', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML =
      '<p><strong><em><a href="https://example.test/nested"><span>BeforeBravoAfter</span></a></em></strong></p>';
    document.body.append(area);
    const text = area.querySelector('a span')?.firstChild;
    if (!text) throw Error('No body');
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);
    return (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (value) => value);
  });
  expect(result).toBe('<strong><em><a href="https://example.test/nested">Bravo</a></em></strong>');
});
test('cross-inline selection does not apply one endpoint ancestor to the whole fragment', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML = '<p><strong>BeforeBravo</strong><em>TailAfter</em></p>';
    document.body.append(area);
    const a = area.querySelector('strong')?.firstChild,
      b = area.querySelector('em')?.firstChild;
    if (!a || !b) throw Error('No endpoints');
    const range = document.createRange();
    range.setStart(a, 6);
    range.setEnd(b, 4);
    return (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (value) => value);
  });
  expect(result).toBe('<strong>Bravo</strong><em>Tail</em>');
});
test('a clipped Markdown wrapper loses markers while retaining actual strong content', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML =
      '<p><span>Alpha </span><span md-inline="strong" class="md-pair-s"><span class="md-meta">**</span><strong><span md-inline="plain" class="md-plain">Bravo</span></strong><span class="md-meta">**</span></span> After</p>';
    document.body.append(area);
    const p = area.querySelector('p'),
      text = area.querySelector('strong span')?.firstChild;
    if (!p || !text) throw Error('No endpoints');
    const range = document.createRange();
    range.setStart(p, 1);
    range.setEnd(text, 5);
    const html = (window as Host).ClipboardTools.clipboardSelectionHTML(
      area,
      range,
      (value) => value,
    );
    const t = document.createElement('template');
    t.innerHTML = html ?? '';
    return {
      html,
      text: t.content.textContent,
      strong: t.content.querySelector('strong')?.textContent,
    };
  });
  expect(result.text).toBe('Bravo');
  expect(result.strong).toBe('Bravo');
  expect(result.html).not.toMatch(/\*|md-inline|md-pair|md-plain|After/);
});
test('image URLs are restored before source metadata is removed and live DOM remains untouched', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML =
      '<p cid="p" mdtype="paragraph" contenteditable="true" onclick="void 0"><span class="md-meta">private marker</span>Bravo<span class="md-image" data-src="../asset.png" data-private="hidden"><img src="blob:capability" data-marklyra-image-source="../asset.png" onload="void 0"></span><script type="text/inert">private script</script></p>';
    document.body.append(area);
    const p = area.querySelector('p');
    if (!p) throw Error('No paragraph');
    const range = document.createRange();
    range.selectNodeContents(p);
    const before = area.innerHTML;
    let sawSource = false;
    const html = (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (html) => {
      sawSource = html.includes('data-src="../asset.png"');
      const t = document.createElement('template');
      t.innerHTML = html;
      t.content.querySelector('img')?.setAttribute('src', '../asset.png');
      return t.innerHTML;
    });
    return { html, sawSource, unchanged: before === area.innerHTML };
  });
  expect(result.sawSource).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.html).toContain('src="../asset.png"');
  expect(result.html).toContain('data-marklyra-image-source="../asset.png"');
  expect(result.html).not.toMatch(
    /blob:|script|onload|onclick|cid=|mdtype|contenteditable|data-private|data-src=|private marker/,
  );
});
test('collapsed or foreign ranges have no HTML and metadata-only selection copies no hidden content', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML = '<p>Bravo<span class="md-meta">**</span></p>';
    document.body.append(area);
    const foreign = document.createElement('p');
    foreign.textContent = 'Outside';
    document.body.append(foreign);
    const range = document.createRange();
    range.selectNodeContents(foreign);
    const f = (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (x) => x);
    range.selectNodeContents(area);
    range.collapse();
    const c = (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (x) => x);
    const meta = area.querySelector('.md-meta')?.firstChild;
    if (!meta) throw Error('No metadata');
    range.setStart(meta, 0);
    range.setEnd(meta, 2);
    return {
      f,
      c,
      m: (window as Host).ClipboardTools.clipboardSelectionHTML(area, range, (x) => x),
    };
  });
  expect(result).toEqual({ f: undefined, c: undefined, m: '' });
});

// A full Markdown link contains an editable URL/title sibling as well as the
// semantic A. Original processClipboardHTML removes that .md-content subtree.
test('whole link excludes source URL and title editors while preserving href and label', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML =
      '<p><span class="md-link"><span class="md-meta">[</span><a href="https://example.test" title="Unshown title"><span>link</span></a><span class="md-meta">](</span><span class="md-content md-url">https://example.test</span><span class="md-meta"> &quot;</span><span class="md-content md-link-title">Unshown title</span><span class="md-meta">&quot;)</span></span></p>';
    document.body.append(area);
    const before = area.innerHTML;
    const range = document.createRange();
    range.selectNodeContents(area.firstElementChild as Element);
    const html = (window as Host).ClipboardTools.clipboardSelectionHTML(
      area,
      range,
      (value) => value,
    );
    const template = document.createElement('template');
    template.innerHTML = html ?? '';
    const url = area.querySelector('.md-url')?.firstChild;
    if (!url) throw Error('Missing URL source editor');
    range.setStart(url, 0);
    range.setEnd(url, url.textContent?.length ?? 0);
    return {
      html,
      text: template.content.textContent,
      href: template.content.querySelector('a')?.getAttribute('href'),
      title: template.content.querySelector('a')?.getAttribute('title'),
      urlOnly: (window as Host).ClipboardTools.clipboardSelectionHTML(
        area,
        range,
        (value) => value,
      ),
      unchanged: area.innerHTML === before,
    };
  });
  expect(result.text).toBe('link');
  expect(result.href).toBe('https://example.test');
  expect(result.title).toBe('Unshown title');
  expect(result.html).not.toMatch(/md-content|md-url|md-link-title/);
  expect(result.urlOnly).toBe('');
  expect(result.unchanged).toBe(true);
});

test('Markdown HTML retains type boundaries and literal markers while dropping capabilities and executable DOM', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const input =
      '<p cid="old" mdtype="paragraph" class="md-focus" data-root="/private" contenteditable="true" onclick="globalThis.bad=1"><span md-inline="highlight"><span>==</span><mark>Bravo</mark><span>==</span></span></p><p mdtype="paragraph">Tail</p><script>globalThis.bad=1</script><iframe src="file:///private"></iframe><svg onload="globalThis.bad=1"></svg><img src="assets/owned.png" data-copy-from-path="/private" onerror="globalThis.bad=1">';
    const clean = (window as Host).ClipboardTools.clipboardMarkupHTML(input);
    const fragment = document.createElement('template');
    fragment.innerHTML = clean;
    return {
      clean,
      paragraphs: [...fragment.content.querySelectorAll('p')].map((p) => p.getAttribute('mdtype')),
      inline: fragment.content.querySelector('[md-inline]')?.getAttribute('md-inline'),
      text: fragment.content.textContent,
      bad: Reflect.get(window, 'bad'),
    };
  });
  expect(result.paragraphs).toEqual(['paragraph', 'paragraph']);
  expect(result.inline).toBe('highlight');
  expect(result.text).toBe('==Bravo==Tail');
  expect(result.clean).not.toMatch(
    /cid=|class=|data-|contenteditable|onclick|script|iframe|svg|onerror|private/,
  );
  expect(result.clean).toContain('src="assets/owned.png"');
  expect(result.bad).toBeUndefined();
});

test('Markdown HTML does not grant active URI or private resource capabilities', async ({
  page,
}) => {
  const blocked = await page.evaluate(() =>
    [
      'javascript:alert(1)',
      'java\nscript:alert(1)',
      'typora://run',
      'marklyra://localhost/private',
    ].map((href) => {
      try {
        (window as Host).ClipboardTools.clipboardMarkupHTML(
          `<p mdtype="paragraph"><a href="${href}">label</a></p>`,
        );
        return false;
      } catch {
        return true;
      }
    }),
  );
  expect(blocked).toEqual([true, true, true, true]);
});

for (const clipped of [false, true])
  test(`Markdown HTML balances ${clipped ? 'clipped endpoint' : 'shared'} inline owners without copying unselected body`, async ({
    page,
  }) => {
    const result = await page.evaluate((clipped) => {
      const area = document.createElement('div');
      area.innerHTML =
        '<p><span md-inline="plain">Alpha </span><span md-inline="strong" cid="private"><span class="md-meta md-before">**</span><strong><span md-inline="plain">BeforeBravoAfter</span></strong><span class="md-meta md-after">**</span></span><span md-inline="plain"> Tail</span></p>';
      document.body.append(area);
      const body = area.querySelector('strong span')?.firstChild;
      const prefix = area.querySelector('p > span')?.firstChild;
      if (!body || !prefix) throw Error('Missing fixture');
      const range = document.createRange();
      range.setStart(clipped ? prefix : body, 6);
      range.setEnd(body, 11);
      const before = area.innerHTML;
      const html = (window as Host).ClipboardTools.clipboardSelectionMarkupHTML(
        area,
        range,
        (value) => value,
      );
      const t = document.createElement('template');
      t.innerHTML = html ?? '';
      return { html, text: t.content.textContent, unchanged: before === area.innerHTML };
    }, clipped);
    expect(result.text).toBe(clipped ? '**BeforeBravo**' : '**Bravo**');
    expect(result.html).not.toMatch(/Alpha|After|Tail|cid=|class=/);
    expect(result.unchanged).toBe(true);
  });

test('Markdown HTML projection preserves cross-block type boundaries', async ({ page }) => {
  const result = await page.evaluate(() => {
    const area = document.createElement('div');
    area.innerHTML =
      '<p mdtype="paragraph"><span md-inline="plain">BeforeFirst</span></p><p mdtype="paragraph"><span md-inline="plain">SecondAfter</span></p>';
    document.body.append(area);
    const text = [...area.querySelectorAll('p span')].map((node) => node.firstChild);
    if (!text[0] || !text[1]) throw Error('Missing fixture');
    const range = document.createRange();
    range.setStart(text[0], 6);
    range.setEnd(text[1], 6);
    return (window as Host).ClipboardTools.clipboardSelectionMarkupHTML(
      area,
      range,
      (value) => value,
    );
  });
  expect(result).toBe(
    '<p mdtype="paragraph"><span md-inline="plain">First</span></p><p mdtype="paragraph"><span md-inline="plain">Second</span></p>',
  );
});

test('Markdown HTML keeps typed table figures and only finite column alignment CSS', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const html = (window as Host).ClipboardTools.clipboardMarkupHTML(
      '<figure mdtype="table" cid="old"><table><thead><tr><th style="text-align:right;background-image:url(file:///private)">H</th></tr></thead><tbody><tr><td style="text-align:center;color:red" onclick="void 0">V</td></tr></tbody></table></figure>',
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    return {
      html,
      type: template.content.querySelector('figure')?.getAttribute('mdtype'),
      styles: [...template.content.querySelectorAll('th,td')].map((cell) =>
        cell.getAttribute('style'),
      ),
    };
  });
  expect(result.type).toBe('table');
  expect(result.styles).toEqual(['text-align: right;', 'text-align: center;']);
  expect(result.html).not.toMatch(/cid=|url\(|file:|private|color:|onclick/);
});

test('Markdown HTML keeps finite task state without transporting live input controls', async ({
  page,
}) => {
  const clean = await page.evaluate(() =>
    (window as Host).ClipboardTools.clipboardMarkupHTML(
      '<ul mdtype="list"><li mdtype="list_item" class="md-task-list-item task-list-done custom" cid="old" onclick="void 0"><input type="checkbox" checked onclick="void 0">Done</li><li mdtype="list_item" class="md-task-list-item task-list-not-done private"><input type="file">Todo</li></ul>',
    ),
  );
  expect(clean).toContain('class="md-task-list-item task-list-done"');
  expect(clean).toContain('class="md-task-list-item task-list-not-done"');
  expect(clean).not.toMatch(/input|onclick|cid=|custom|private/);
});
