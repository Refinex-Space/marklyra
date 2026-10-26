import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { build } from 'vite';

// Bundle only this project's adapter in memory. Never rebuild or modify the private runtime.
const output = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('packages/editor-runtime/src/runtime/preferences.ts'),
      name: 'MarkLyraIndentAdapter',
      formats: ['iife'],
    },
  },
});
const code = (Array.isArray(output) ? output : [output])
  .flatMap((value) => value.output)
  .find((value) => value.type === 'chunk')?.code;
if (!code) throw new Error('Missing in-memory preferences adapter');
const runtimeUrl = process.env.INDENT_RUNTIME_URL ?? 'http://127.0.0.1:4199/index.html';
const results = [];
for (const [engine, launcher] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await launcher.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const start = async () => {
      await page.goto(`${runtimeUrl}?channel=indent-preferences-probe`);
      await page.waitForFunction(
        () => window.editor && window.File && !File._onInitParse && editor.fences.modeLoaded,
      );
      await page.addScriptTag({ content: code });
      await page.evaluate(() => {
        window.indentAdapter = new MarkLyraIndentAdapter.RuntimePreferences({
          runtime: window,
          composing: () => Boolean(window.indentComposition),
        });
      });
    };
    const load = async () => {
      await page.evaluate(() =>
        File.loadFile('', false, ['```javascript\nfunction f() {\n  let x = 1;\n}\n```', null, {}]),
      );
      await page.waitForFunction(() => document.querySelector('#write .md-fences'));
      await page.evaluate(() => {
        const cm = editor.fences.getCm(
          document.querySelector('#write .md-fences').getAttribute('cid'),
        );
        cm.setCursor({ line: 1, ch: 2 });
        cm.focus();
      });
    };
    await start();
    await load();
    // Simulate persisted initial options arriving after the constructors.
    const initial = await page.evaluate(() => {
      const cm = Object.values(editor.fences.queue)[0];
      const field = cm.getInputField();
      const source = editor.getMarkdown();
      indentAdapter.apply({ codeIndentSize: 2, shiftTabAutoIndent: true });
      return {
        before: 4,
        unit: cm.getOption('indentUnit'),
        tab: cm.getOption('tabSize'),
        key: CodeMirror.keyMap.default['Shift-Tab'],
        unchanged: source === editor.getMarkdown(),
        sameField: field === cm.getInputField(),
      };
    });
    assert.deepEqual(initial, {
      before: 4,
      unit: 2,
      tab: 2,
      key: 'indentAuto',
      unchanged: true,
      sameField: true,
    });
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => editor.getMarkdown()),
      '```javascript\nfunction f() {\n  let x = 1;\n}\n```',
    );
    const later = await page.evaluate(() => {
      const cm = Object.values(editor.fences.queue)[0];
      const before = {
        source: editor.getMarkdown(),
        undo: editor.undo.storeToJson(),
        selection: cm.listSelections(),
      };
      indentAdapter.apply({ codeIndentSize: 5, shiftTabAutoIndent: false });
      return {
        before,
        after: {
          source: editor.getMarkdown(),
          undo: editor.undo.storeToJson(),
          selection: cm.listSelections(),
        },
        unit: cm.getOption('indentUnit'),
        option: File.option.codeIndentSize,
        stored: _options.codeIndentSize,
        key: CodeMirror.keyMap.default['Shift-Tab'],
      };
    });
    assert.deepEqual(later.before, later.after);
    assert.equal(later.unit, 2);
    assert.equal(later.option, 5);
    assert.equal(later.stored, 5);
    assert.equal(later.key, 'indentLess');
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => editor.getMarkdown()),
      '```javascript\nfunction f() {\nlet x = 1;\n}\n```',
    );
    await load();
    const nextInstance = await page.evaluate(() => {
      const cm = Object.values(editor.fences.queue)[0];
      indentAdapter.apply({ codeIndentSize: 5, shiftTabAutoIndent: true });
      return { unit: cm.getOption('indentUnit'), tab: cm.getOption('tabSize') };
    });
    assert.deepEqual(nextInstance, { unit: 5, tab: 5 });
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => editor.getMarkdown()),
      '```javascript\nfunction f() {\n     let x = 1;\n}\n```',
    );
    const composition = await page.evaluate(() => {
      const before = JSON.stringify({
        option: File.option.codeIndentSize,
        key: CodeMirror.keyMap.default['Shift-Tab'],
      });
      window.indentComposition = true;
      let error;
      try {
        indentAdapter.apply({ codeIndentSize: 2, shiftTabAutoIndent: false });
      } catch (value) {
        error = value.message;
      }
      window.indentComposition = false;
      return {
        error,
        unchanged:
          before ===
          JSON.stringify({
            option: File.option.codeIndentSize,
            key: CodeMirror.keyMap.default['Shift-Tab'],
          }),
      };
    });
    assert.deepEqual(composition, { error: '请先完成输入法候选', unchanged: true });
    await start();
    await load();
    const rollback = await page.evaluate(() => {
      const cm = Object.values(editor.fences.queue)[0];
      const original = cm.setOption;
      const before = {
        source: editor.getMarkdown(),
        unit: cm.getOption('indentUnit'),
        tab: cm.getOption('tabSize'),
        key: CodeMirror.keyMap.default['Shift-Tab'],
        option: File.option.codeIndentSize,
        undo: editor.undo.storeToJson(),
        selection: cm.listSelections(),
      };
      let failed = false;
      cm.setOption = function (key, value) {
        if (!failed && key === 'tabSize' && value === 2) {
          failed = true;
          throw new Error('injected tabSize failure');
        }
        return original.call(this, key, value);
      };
      let error;
      try {
        indentAdapter.apply({ codeIndentSize: 2, shiftTabAutoIndent: true });
      } catch (value) {
        error = value.message;
      }
      cm.setOption = original;
      const after = {
        source: editor.getMarkdown(),
        unit: cm.getOption('indentUnit'),
        tab: cm.getOption('tabSize'),
        key: CodeMirror.keyMap.default['Shift-Tab'],
        option: File.option.codeIndentSize,
        undo: editor.undo.storeToJson(),
        selection: cm.listSelections(),
      };
      indentAdapter.apply({ codeIndentSize: 3, shiftTabAutoIndent: true });
      return { before, after, error, retryUnit: cm.getOption('indentUnit') };
    });
    assert.deepEqual(rollback.before, rollback.after);
    assert.equal(rollback.error, 'injected tabSize failure');
    assert.equal(rollback.retryUnit, 3);
    assert.deepEqual(errors, []);
    results.push({ engine, initial, later, nextInstance, composition, rollback, errors });
  } finally {
    await browser.close();
  }
}
const directory = resolve(process.env.INDENT_ARTIFACTS ?? 'artifacts/indent-v20/preferences');
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, 'browser-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(
  `${results.length} engines passed: original code-width lifecycle, Shift+Tab, composition guard, rollback`,
);
