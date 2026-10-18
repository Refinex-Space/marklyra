import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'acorn';
import { build } from 'vite';
import { preferenceHelpLinkEdits } from './preferences-help-links.mjs';
import { brandHtmlTitle, brandLocale } from './runtime-branding.mjs';

const root = resolve(import.meta.dirname, '../..');
const digest = (value) => createHash('sha256').update(value).digest('hex');
export const preferencesResources = Object.freeze({
  'page-dist/setting.html': '0e0ffdb90d19bb9bf1405668ee24dfe9333804872a00426d531a79f75b556a8f',
  'page-dist/static/js/0.99879679.chunk.js':
    '87f0a5f324307aec8a5ba3c15db4c39f1d7d06ae581ba3daa82cc02157d64409',
  'page-dist/static/js/Preferences.962926a4.d7f6a912.chunk.js':
    '4565af0b527cf7061d02b5952cf815bc606b7ff571e2e08da0b7e3259f7d714b',
  'page-dist/static/css/Preferences.962926a4.d430ac69.chunk.css':
    '9cee878ad8d6fcd15fb984e1d2597c92206e9b06a6d63cae297606e80ac35e06',
  'page-dist/cocoa.css': 'd258750c8064222d9bf84a550ff9176a56d32e6af6e7e6185bbf8a59c736e42a',
  'page-dist/electron.css': '630f13d10814ea9f3cecf928228be81be18d97e9e15365bbc23c3de0f2be19cd',
  'page-dist/static/media/photon-entypo.bf614256.woff':
    '05bcf57599c2bd78b35162d8ab41c1b516b49d295b7f7d046d49834bf68bc60e',
  'page-dist/static/media/photon-entypo.2614e058.eot':
    '9431f363419a61693609085356105790cc56d048388c5bb91a315fd677418642',
  'page-dist/static/media/photon-entypo.1382c29c.ttf':
    '1733aa2b56f9d8a2684228f7d6383c992d8088bf95ab5d505e440c0802632d55',
  'locales/zh-Hans.lproj/Front.json':
    'a775547a4efc2b918d70cb2719a930323bc46b38bb66bf6a9f31dfed20edacd6',
  'locales/zh-Hans.lproj/Menu.json':
    'ab0efd57d56b0a3ec8ebf52f2eb08696b6bf9bacef40b910c1bbe75ad5a30c78',
  'locales/zh-Hans.lproj/Panel.json':
    '94747cfab07957f2afadea37ade9b526f7698a10371bb7aa099c9ee5dd6ec70e',
  'locales/zh-Hans.lproj/Welcome.json':
    'b21dc74e6218cf46dd8055114376a52823cd5da7a93c8a45dc616d98c3e39a57',
  'locales/Base.lproj/Front.json':
    '45c8cb8786172a80e5be81d5c6997bf78fbb682c8a9ff8741c6fb3c0e08a4184',
  'locales/Base.lproj/Menu.json':
    '990324dcb077a5040709a283242853696ea0af278533730a1c7bf5c9e6fc9ed8',
  'locales/Base.lproj/Panel.json':
    '4d518a2fe2fc93de66fb060541ed3bb4ab9d8a2d6223626698094c1fbc0f07c2',
  'locales/Base.lproj/Welcome.json':
    '2d5e962468db43144ac3831894fd2d8da4ff3ed0b6656ebf1cb8a620fe08d240',
});
const preferencesSourcePath = 'page-dist/static/js/Preferences.962926a4.d7f6a912.chunk.js';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc'].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function member(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type !== 'MemberExpression') return null;
  const property = node.computed ? node.property.value : node.property.name;
  const object = member(node.object);
  return object && typeof property === 'string' ? `${object}.${property}` : null;
}

export function transformPreferencesSource(source) {
  if (typeof source !== 'string' || digest(source) !== preferencesResources[preferencesSourcePath])
    throw new Error('Unknown original Preferences SHA-256');
  const ast = parse(source, { ecmaVersion: 'latest' });
  const edits = [],
    bridges = [],
    guards = [],
    changes = [],
    dictionaries = [],
    debugDictionaries = [],
    outlineGroups = [],
    exitModeRows = [],
    diagramRows = [];
  walk(ast, (node) => {
    if (
      node.type === 'CallExpression' &&
      member(node.callee) === 'p.a.createElement' &&
      member(node.arguments[0]) === 'b.v' &&
      node.arguments[1]?.type === 'ObjectExpression'
    ) {
      const rows = node.arguments[1].properties.find(
        (property) => property.key?.name === 'rows',
      )?.value;
      const row =
        rows?.type === 'ArrayExpression' && rows.elements.length === 1 ? rows.elements[0] : null;
      if (row?.type === 'ArrayExpression' && row.elements.length === 2) {
        const [checkbox, button] = row.elements;
        if (
          checkbox?.type === 'CallExpression' &&
          member(checkbox.arguments[0]) === 'b.c' &&
          checkbox.arguments[1]?.type === 'ObjectExpression' &&
          checkbox.arguments[1].properties.some(
            (property) =>
              property.key?.name === 'keyName' && property.value?.value === 'enable_diagram',
          ) &&
          button?.type === 'CallExpression' &&
          member(button.arguments[0]) === 'b.b' &&
          button.arguments[1]?.type === 'ObjectExpression' &&
          button.arguments[1].properties.some(
            (property) =>
              property.key?.name === 'label' && property.value?.value === 'Diagram Options',
          )
        )
          diagramRows.push({ table: node, checkbox });
      }
    }
    if (
      node.type === 'CallExpression' &&
      member(node.callee) === 'p.a.createElement' &&
      member(node.arguments[0]) === 'b.q' &&
      node.arguments[2]?.type === 'CallExpression' &&
      member(node.arguments[2].arguments[0]) === 'b.b' &&
      node.arguments[2].arguments[1]?.type === 'ObjectExpression' &&
      node.arguments[2].arguments[1].properties.some(
        (property) =>
          property.key?.name === 'onClick' &&
          member(property.value) === 'window.Setting.exitFocusAndTypewriterMode',
      )
    )
      exitModeRows.push(node);
    if (
      node.type === 'CallExpression' &&
      member(node.callee) === 'p.a.createElement' &&
      member(node.arguments[0]) === 'b.k' &&
      node.arguments
        .slice(2)
        .some(
          (child) =>
            child.type === 'CallExpression' &&
            child.arguments[1]?.type === 'ObjectExpression' &&
            child.arguments[1].properties.some(
              (property) =>
                property.key?.name === 'keyName' &&
                property.value?.value === 'can_collapse_outline_panel',
            ),
        )
    )
      outlineGroups.push(node);
    if (member(node) === 'window.webkit.messageHandlers._setting') bridges.push(node);
    if (member(node) === 'window.webkit') guards.push(node);
    if (node.type === 'Literal' && node.value === '../locales/')
      edits.push({ start: node.start, end: node.end, text: JSON.stringify('./locales/') });
    if (node.type === 'AssignmentExpression' && member(node.left) === 'window.loadDict')
      dictionaries.push(node.right);
    if (
      node.type === 'ConditionalExpression' &&
      node.test.type === 'CallExpression' &&
      member(node.test.callee) === 'window.location.href.match' &&
      node.test.arguments.length === 1 &&
      node.test.arguments[0].regex?.pattern === 'localhost' &&
      node.test.arguments[0].regex?.flags === ''
    )
      debugDictionaries.push(node.test);
    if (node.type === 'ObjectExpression') {
      const key = node.properties.find(
        (property) => property.key?.name === 'key' && property.value?.value === 'onChange',
      );
      const value = node.properties.find((property) => property.key?.name === 'value')?.value;
      if (key && value?.type === 'FunctionExpression') {
        let applies = false;
        walk(value.body, (child) => {
          if (member(child) === 'this.onChangeExtraActions') applies = true;
        });
        // member(ThisExpression) is deliberately handled separately below.
        walk(value.body, (child) => {
          if (
            child.type === 'MemberExpression' &&
            child.object?.type === 'ThisExpression' &&
            child.property?.name === 'onChangeExtraActions'
          )
            applies = true;
        });
        if (applies) changes.push(value);
      }
    }
  });
  if (
    bridges.length !== 1 ||
    guards.length < 10 ||
    changes.length !== 1 ||
    dictionaries.length !== 1 ||
    debugDictionaries.length !== 1 ||
    outlineGroups.length !== 1 ||
    exitModeRows.length !== 1 ||
    diagramRows.length !== 1 ||
    edits.length !== 4
  )
    throw new Error('Unexpected original Preferences bridge/layout structure');
  // Outline mode is configured in the Shell's context menu. Remove the whole
  // original group so it leaves neither an empty card nor a settings search hit.
  const outlineGroup = outlineGroups[0];
  edits.push({ start: outlineGroup.start, end: outlineGroup.end, text: 'null' });
  // The legacy exit action has no Shell bridge. Keep the supported caret
  // preference above it while omitting this disabled row and its search keywords.
  const exitModeRow = exitModeRows[0];
  edits.push({ start: exitModeRow.start, end: exitModeRow.end, text: 'null' });
  // Keep the original diagram checkbox and hint without the unsupported button
  // or its two-column table, matching the surrounding syntax toggles.
  const diagramRow = diagramRows[0];
  edits.push({
    start: diagramRow.table.start,
    end: diagramRow.table.end,
    text: source.slice(diagramRow.checkbox.start, diagramRow.checkbox.end),
  });
  edits.push(...preferenceHelpLinkEdits(source, ast));
  const bridge = bridges[0];
  edits.push({ start: bridge.start, end: bridge.end, text: 'window.__MARKLYRA_SETTINGS_BRIDGE__' });
  for (const node of guards) {
    if (node.start >= bridge.start && node.end <= bridge.end) continue;
    edits.push({ start: node.start, end: node.end, text: 'window.__MARKLYRA_SETTINGS_BRIDGE__' });
  }
  const change = changes[0];
  if (change.params.length !== 2 || change.params.some((param) => param.type !== 'Identifier'))
    throw new Error('Unexpected original preference change signature');
  edits.push({
    start: change.body.start,
    end: change.body.end,
    text: `{return window.__MARKLYRA_SETTINGS_CHANGE__(this,${change.params.map((p) => p.name).join(',')});}`,
  });
  const dict = dictionaries[0];
  if (
    dict.type !== 'FunctionExpression' ||
    dict.params.length !== 1 ||
    dict.params[0].type !== 'Identifier'
  )
    throw new Error('Unexpected preference dictionary loader');
  const debugDictionary = debugDictionaries[0];
  if (debugDictionary.start < dict.body.start || debugDictionary.end > dict.body.end)
    throw new Error('Unexpected preference debug dictionary scope');
  // Runtime native origins legitimately contain localhost; never select the original dev stub.
  edits.push({ start: debugDictionary.start, end: debugDictionary.end, text: 'false' });
  edits.push({
    start: dict.body.start + 1,
    end: dict.body.start + 1,
    text: `if(!${dict.params[0].name})${dict.params[0].name}=window._options.locale;`,
  });
  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++)
    if (edits[i].start < edits[i - 1].end)
      throw new Error('Overlapping Preferences transformation');
  let code = source;
  for (const edit of [...edits].reverse())
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  parse(code, { ecmaVersion: 'latest' });
  return {
    code,
    metadata: {
      originalSha256: digest(source),
      transformedSha256: digest(code),
      bridgeCount: bridges.length,
      capabilityChecks: guards.length,
      edits,
    },
  };
}

export function transformPreferencesHtml(source) {
  if (
    typeof source !== 'string' ||
    digest(source) !== preferencesResources['page-dist/setting.html']
  )
    throw new Error('Unknown original setting.html SHA-256');
  const scripts = [
    './static/js/0.99879679.chunk.js',
    './static/js/Preferences.962926a4.d7f6a912.chunk.js',
  ];
  let html = source;
  for (const src of scripts) {
    const tag = `<script src="${src}"></script>`;
    if (html.split(tag).length !== 2) throw new Error('Unexpected Preferences script entry');
    html = html.replace(tag, '');
  }
  const theme = 'typora://app/userData/themes/current-theme.css';
  if (html.split(theme).length !== 2) throw new Error('Unexpected Preferences theme entry');
  html = html.replace(theme, './empty.css');
  const csp =
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-src 'none'";
  html = html.replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><script src="./child-host.js"></script>`,
  );
  return html;
}

export async function preparePreferencesRuntime({
  inputDirectory,
  outputDirectory,
  childHostSourcePath = resolve(
    root,
    'apps/desktop/src/features/settings/runtime-preferences/child-host.ts',
  ),
}) {
  const verified = [];
  // Verify every original before creating output; a changed artifact never receives a partial build.
  for (const [path, expected] of Object.entries(preferencesResources)) {
    const bytes = await readFile(resolve(inputDirectory, path));
    if (digest(bytes) !== expected)
      throw new Error(`Runtime Preferences resource changed: ${path}`);
    verified.push({ path, bytes });
  }
  const source = verified.find((entry) => entry.path === preferencesSourcePath);
  const transformed = transformPreferencesSource(source.bytes.toString('utf8'));
  const bundled = await build({
    configFile: false,
    logLevel: 'error',
    build: {
      write: false,
      minify: true,
      lib: { entry: childHostSourcePath, formats: ['iife'], name: 'MarkLyraPreferencesHost' },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const chunks = (Array.isArray(bundled) ? bundled : [bundled]).flatMap((result) => result.output);
  if (chunks.length !== 1 || chunks[0].type !== 'chunk')
    throw new Error('Unexpected Preferences adapter output');
  const resources = [];
  await mkdir(outputDirectory, { recursive: true });
  for (const entry of verified) {
    const path = entry.path.replace(/^page-dist\//, '');
    const target = resolve(outputDirectory, path);
    await mkdir(dirname(target), { recursive: true });
    if (entry.path === preferencesSourcePath) await writeFile(target, transformed.code);
    else if (entry.path === 'page-dist/setting.html')
      await writeFile(
        target,
        brandHtmlTitle(transformPreferencesHtml(entry.bytes.toString('utf8'))),
      );
    else if (entry.path.startsWith('locales/') && entry.path.endsWith('.json'))
      await writeFile(target, brandLocale(entry.bytes.toString('utf8')).code);
    else await copyFile(resolve(inputDirectory, entry.path), target);
    resources.push({
      path,
      originalSha256: digest(entry.bytes),
      runtimeSha256: digest(await readFile(target)),
    });
  }
  await writeFile(resolve(outputDirectory, 'child-host.js'), chunks[0].code);
  await writeFile(
    resolve(outputDirectory, 'empty.css'),
    '/* Preferences use the runtime native shell styles. */\n',
  );
  const manifest = {
    kind: 'private-runtime-preferences',
    sourceVersion: 'Typora 1.11.7 (7472)',
    adapterSha256: digest(chunks[0].code),
    transformations: transformed.metadata,
    resources,
  };
  await writeFile(
    resolve(outputDirectory, 'preferences-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
