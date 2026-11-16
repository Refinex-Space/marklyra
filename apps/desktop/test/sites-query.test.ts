import { describe, expect, it } from 'vitest';
import { builtinEngines, type SearchEngine } from '../src/features/sites/model/engines.js';
import { addressOf, classifyQuery } from '../src/features/sites/model/query.js';

const engines: SearchEngine[] = [
  ...builtinEngines(),
  {
    id: 'ddg',
    name: 'DuckDuckGo',
    template: 'https://duckduckgo.com/?q=%s',
    keyword: 'd',
    builtin: false,
  },
];
const bing = engines[0] as SearchEngine;
const google = engines[1] as SearchEngine;

describe('address detection', () => {
  it('opens full http and https addresses as typed', () => {
    expect(addressOf('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(addressOf('HTTP://Example.com')).toBe('http://example.com/');
  });

  it('gives bare domains https and local or private hosts http', () => {
    expect(addressOf('example.com')).toBe('https://example.com/');
    expect(addressOf('docs.rs/serde')).toBe('https://docs.rs/serde');
    expect(addressOf('例子.中国')).toBe('https://xn--fsqu00a.xn--fiqs8s/');
    expect(addressOf('localhost')).toBe('http://localhost/');
    expect(addressOf('localhost:3000/app')).toBe('http://localhost:3000/app');
    expect(addressOf('192.168.1.20:8080')).toBe('http://192.168.1.20:8080/');
    expect(addressOf('10.0.0.5')).toBe('http://10.0.0.5/');
    expect(addressOf('[::1]:8080')).toBe('http://[::1]:8080/');
    expect(addressOf('8.8.8.8')).toBe('http://8.8.8.8/');
  });

  it('never turns searches, other schemes or credentials into addresses', () => {
    for (const text of [
      '',
      '  ',
      'rust tauri',
      'rust',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'mailto:a@b.co',
      'data:text/html,hi',
      'ftp://example.com',
      'https://user:pw@example.com',
      'user@example.com',
      '999.1.1.1',
      'a.b',
      'https://',
      'exa\nmple.com',
    ])
      expect(addressOf(text), JSON.stringify(text)).toBeNull();
  });
});

describe('what Enter does', () => {
  it('searches with the current engine, encoding the query', () => {
    expect(classifyQuery('rust 插件 & more', engines, bing)).toEqual({
      kind: 'search',
      engine: bing,
      query: 'rust 插件 & more',
      url: 'https://www.bing.com/search?q=rust%20%E6%8F%92%E4%BB%B6%20%26%20more',
    });
  });

  it('opens an address instead of searching it', () => {
    expect(classifyQuery('github.com', engines, bing)).toEqual({
      kind: 'url',
      url: 'https://github.com/',
    });
  });

  it('uses another engine for one search when its keyword comes first', () => {
    expect(classifyQuery('g rust tauri', engines, bing)).toEqual({
      kind: 'search',
      engine: google,
      query: 'rust tauri',
      url: 'https://www.google.com/search?q=rust%20tauri',
    });
    // A keyword alone, or an unknown one, is just text.
    expect(classifyQuery('g', engines, bing)).toMatchObject({ engine: bing, query: 'g' });
    expect(classifyQuery('zz rust', engines, bing)).toMatchObject({
      engine: bing,
      query: 'zz rust',
    });
  });

  it('forces a search when asked, even for something that looks like an address', () => {
    expect(classifyQuery('node.js', engines, google, true)).toMatchObject({
      kind: 'search',
      engine: google,
      query: 'node.js',
    });
  });

  it('does nothing for empty text', () => {
    expect(classifyQuery('   ', engines, bing)).toBeNull();
  });

  it('keeps a search that merely contains a scheme-like word a search', () => {
    expect(classifyQuery('javascript: how to', engines, bing)).toMatchObject({ kind: 'search' });
  });
});
