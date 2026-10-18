import assert from 'node:assert/strict';
import test from 'node:test';
import { brandDisplayText, brandHtmlTitle, brandLocale } from './runtime-branding.mjs';

test('display branding preserves dictionary lookup keys and source input', () => {
  const source = JSON.stringify({
    'Open in Typora': '在 Typora 中打开',
    nested: ['Typora editor'],
  });
  const result = brandLocale(source);
  assert.equal(result.changes, 2);
  assert.deepEqual(JSON.parse(result.code), {
    'Open in Typora': '在 MarkLyra 中打开',
    nested: ['MarkLyra editor'],
  });
  assert.equal(JSON.parse(source)['Open in Typora'], '在 Typora 中打开');
  assert.equal(brandLocale(result.code).code, result.code);
});

test('vendor authorization notices, URLs and document metadata are never rebranded', () => {
  const source = JSON.stringify({
    'Typora activation is required': '需要激活 Typora',
    'License information': 'Typora license',
    credits: 'Copyright © Typora',
    example: 'Typora: https://typora.io hi@typora.io typora-root-url',
  });
  assert.deepEqual(JSON.parse(brandLocale(source).code), {
    'Typora activation is required': '需要激活 Typora',
    'License information': 'Typora license',
    credits: 'Copyright © Typora',
    example: 'MarkLyra: https://typora.io hi@typora.io typora-root-url',
  });
  assert.equal(brandDisplayText('Open Typora'), 'Open MarkLyra');
});

test('HTML branding changes the title without changing scripts, DOM ABI or document text', () => {
  const source =
    '<title>Typora Preferences</title><script>const id="typora-source"</script><p>Typora document text</p>';
  assert.equal(
    brandHtmlTitle(source),
    source.replace('Typora Preferences', 'MarkLyra Preferences'),
  );
});

test('application examples and error contacts use neutral samples and the project issue tracker', () => {
  const dictionary = JSON.parse(
    brandLocale(
      JSON.stringify({
        'Auto Links (e.g: https://typora.io)': '自动链接 https://typora.io',
        'Unknown Error. Please contact hi@typora.io': '请联系 <hi@typora.io>',
        'License information': 'Typora license: hi@typora.io',
      }),
    ).code,
  );
  assert.equal(dictionary['Auto Links (e.g: https://typora.io)'], '自动链接 https://example.com');
  assert.equal(
    dictionary['Unknown Error. Please contact hi@typora.io'],
    '请联系 https://github.com/Refinex-Space/marklyra/issues',
  );
  assert.equal(dictionary['License information'], 'Typora license: hi@typora.io');
});
