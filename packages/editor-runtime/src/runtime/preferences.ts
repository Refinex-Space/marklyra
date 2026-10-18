import { type MarkLyraEditorPreferences, marklyraEditorPreferences } from '../preferences.js';
import type { LegacyConfigurableCodeMirror, LegacyGlobals } from './legacy-types.js';

interface Dependencies {
  runtime: LegacyGlobals;
  composing(): boolean;
}
const keys = [
  'useCustomFontSize',
  'customFontSize',
  'noPairingMatch',
  'autoPairExtendSymbol',
  'noEmojiAutoComplete',
  'expandSimpleBlock',
  'codeIndentSize',
  'shiftTabAutoIndent',
  'showLineNumbersForFence',
  'noLineWrapping',
  'lineWiseCopyCut',
  'scrollWithCursor',
  'copyMarkdownByDefault',
  'preferCRLF',
  'zoomByMouse',
  'preLinebreakOnExport',
  'mathFormatOnCopy',
  'defaultCodeLang',
  'defaultCodeLangOption',
  'noHintForOpenLink',
] as const;
const storedKeys = [
  'useCustomFontSize',
  'customFontSize',
  'no_pairing_match',
  'match_pari_markdown',
  'noEmojiAutoComplete',
  'auto_expand_block',
  'codeIndentSize',
  'shiftTabAutoIndent',
  'showLineNumbersForFence',
  'noLineWrapping',
  'lineWiseCopyCut',
  'no_mid_caret',
  'copy_markdown_by_default',
  'line_ending_crlf',
  'zoomByMouse',
  'preLinebreakOnExport',
  'mathFormatOnCopy',
  'defaultCodeLang',
  'defaultCodeLangOption',
  'noHintForOpenLink',
] as const;

/** Non-serializing settings only. Never rebuild the document or restore focus. */
export class RuntimePreferences {
  private startup:
    | Pick<MarkLyraEditorPreferences, 'showLineNumbersForFence' | 'noLineWrapping'>
    | undefined;
  constructor(private readonly deps: Dependencies) {}
  apply(input: unknown): void {
    const value: Required<MarkLyraEditorPreferences> = marklyraEditorPreferences(input);
    if (this.deps.composing()) throw new Error('请先完成输入法候选');
    if (
      this.startup &&
      (value.showLineNumbersForFence !== this.startup.showLineNumbersForFence ||
        value.noLineWrapping !== this.startup.noLineWrapping)
    )
      throw new Error('代码行号和换行设置需要重新创建编辑器');
    const { runtime } = this.deps;
    const file = runtime.File,
      editor = runtime.editor;
    if (!file || !editor) throw new Error('编辑器尚未初始化');
    const keyMap = runtime.CodeMirror?.keyMap.default;
    if (!keyMap) throw new Error('当前运行资源缺少代码缩进快捷键能力');
    const resetPairing = file.option.autoPairExtendSymbol !== value.autoPairExtendSymbol;
    if (resetPairing && !runtime.__MARKLYRA_RESET_PAIRING__)
      throw new Error('当前运行资源缺少已验证的配对配置能力，请更新运行资源');
    const before = keys.map((key) => Object.getOwnPropertyDescriptor(file.option, key));
    const oldStored = storedKeys.map((key) =>
      Object.getOwnPropertyDescriptor(runtime._options, key),
    );
    const oldFont = document.documentElement.style.fontSize;
    const oldShiftTab = Object.getOwnPropertyDescriptor(keyMap, 'Shift-Tab');
    const noWrapClass = 'fences-no-line-wrapping';
    const oldNoWrap = this.startup ? undefined : editor.writingArea.classList.contains(noWrapClass);
    const mirrors: {
      cm: LegacyConfigurableCodeMirror;
      key: string;
      before: unknown;
      next: unknown;
    }[] = [];
    const remember = (cm: LegacyConfigurableCodeMirror | undefined, tags: boolean) => {
      if (!cm) return;
      for (const key of tags ? ['autoCloseBrackets', 'autoCloseTags'] : ['autoCloseBrackets'])
        mirrors.push({ cm, key, before: cm.getOption(key), next: !value.noPairingMatch });
    };
    const rememberWidth = (cm: LegacyConfigurableCodeMirror | undefined) => {
      // Host initial preferences arrive after the original editor is constructed.
      // Later changes follow the original lifecycle: only new CMs use the new width.
      if (!cm || this.startup) return;
      for (const key of ['indentUnit', 'tabSize'])
        mirrors.push({ cm, key, before: cm.getOption(key), next: value.codeIndentSize });
    };
    const rememberInitial = (
      cm: LegacyConfigurableCodeMirror | undefined,
      key: string,
      next: unknown,
    ) => {
      if (cm && !this.startup) mirrors.push({ cm, key, next, before: cm.getOption(key) });
    };
    const localOptions = (cid: string) => {
      const node = editor.getNode(cid);
      const language = node?.get('lang');
      if (
        !node ||
        (language != null && typeof language !== 'string') ||
        typeof editor.fences.getOptionsFromFencesAttr !== 'function'
      )
        throw new Error('无法确认代码块的局部显示配置');
      return editor.fences.getOptionsFromFencesAttr(language ?? '');
    };
    const fenceClasses: { element: HTMLElement; before: boolean; next: boolean }[] = [];
    const numberedClass = 'md-fences-with-lineno';
    if (!this.startup) {
      for (const element of editor.writingArea.querySelectorAll<HTMLElement>(
        '[mdtype="fences"][cid]',
      )) {
        const cid = element.getAttribute('cid');
        const cm = cid ? editor.fences.queue?.[cid] : undefined;
        fenceClasses.push({
          element,
          before: element.classList.contains(numberedClass),
          next:
            cm && cid
              ? (localOptions(cid).lineNumbers ?? value.showLineNumbersForFence)
              : value.showLineNumbersForFence,
        });
      }
    }
    remember(editor.sourceView.cm, false); // Original source mode always keeps tag closing enabled.
    for (const cm of Object.values(editor.fences.queue ?? {})) remember(cm, true);
    remember(editor.mathBlock?.currentCm, true); // HTML editors intentionally are not included.
    rememberWidth(editor.sourceView.cm);
    for (const cm of Object.values(editor.fences.queue ?? {})) rememberWidth(cm);
    rememberWidth(editor.mathBlock?.currentCm);
    rememberWidth(editor.htmlBlock?.currentCm);
    rememberInitial(editor.sourceView.cm, 'lineWiseCopyCut', value.lineWiseCopyCut);
    for (const [cid, cm] of Object.entries(editor.fences.queue ?? {})) {
      if (!this.startup && cm) {
        const local = localOptions(cid);
        rememberInitial(cm, 'lineNumbers', local.lineNumbers ?? value.showLineNumbersForFence);
      }
      rememberInitial(cm, 'lineWrapping', !value.noLineWrapping);
      rememberInitial(cm, 'lineWiseCopyCut', value.lineWiseCopyCut);
    }
    rememberInitial(editor.mathBlock?.currentCm, 'lineNumbers', value.showLineNumbersForFence);
    for (const cm of [editor.mathBlock?.currentCm, editor.htmlBlock?.currentCm]) {
      rememberInitial(cm, 'lineWrapping', !value.noLineWrapping);
      rememberInitial(cm, 'lineWiseCopyCut', value.lineWiseCopyCut);
    }
    try {
      keys.forEach((key, index) => {
        file.option[key] = value[key];
        runtime._options[storedKeys[index] ?? key] =
          key === 'scrollWithCursor' ? !value[key] : value[key];
      });
      if (resetPairing) runtime.__MARKLYRA_RESET_PAIRING__?.();
      document.documentElement.style.fontSize = value.useCustomFontSize
        ? `${value.customFontSize}px`
        : '';
      keyMap['Shift-Tab'] = value.shiftTabAutoIndent ? 'indentAuto' : 'indentLess';
      if (oldNoWrap !== undefined)
        editor.writingArea.classList.toggle(noWrapClass, value.noLineWrapping);
      for (const option of mirrors)
        if (option.before !== option.next) option.cm.setOption(option.key, option.next);
      for (const decoration of fenceClasses)
        if (decoration.before !== decoration.next)
          decoration.element.classList.toggle(numberedClass, decoration.next);
      this.startup ??= {
        showLineNumbersForFence: value.showLineNumbersForFence,
        noLineWrapping: value.noLineWrapping,
      };
    } catch (error) {
      const failures: unknown[] = [];
      const restore = (
        target: Record<string, unknown>,
        key: string,
        descriptor?: PropertyDescriptor,
      ) => {
        try {
          if (descriptor) Object.defineProperty(target, key, descriptor);
          else delete target[key];
        } catch (failure) {
          failures.push(failure);
        }
      };
      keys.forEach((key, index) => {
        restore(file.option, key, before[index]);
        restore(runtime._options, storedKeys[index] ?? key, oldStored[index]);
      });
      document.documentElement.style.fontSize = oldFont;
      restore(keyMap, 'Shift-Tab', oldShiftTab);
      if (oldNoWrap !== undefined) {
        try {
          editor.writingArea.classList.toggle(noWrapClass, oldNoWrap);
        } catch (failure) {
          failures.push(failure);
        }
      }
      for (const decoration of fenceClasses) {
        try {
          decoration.element.classList.toggle(numberedClass, decoration.before);
        } catch (failure) {
          failures.push(failure);
        }
      }
      for (const option of mirrors) {
        try {
          if (option.cm.getOption(option.key) !== option.before)
            option.cm.setOption(option.key, option.before);
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (failures.length)
        throw new AggregateError([error, ...failures], '编辑器设置失败，部分控件未能恢复');
      throw error;
    }
  }
}
