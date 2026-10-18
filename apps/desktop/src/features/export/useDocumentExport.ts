import type { MarkLyraEditor } from '@marklyra/editor-runtime';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import { exportPreferences } from '../../services/export-preferences.js';
import {
  type ConversionFormat,
  documentExports,
  type FormatCapabilities,
} from '../../services/exports.js';
import { documentExportOptions } from './options.js';

export type ExportAction =
  | 'export-html'
  | 'export-html-plain'
  | 'export-image'
  | `export-${ConversionFormat}`
  | 'print-preview';
export const conversionExportActions = new Set<ExportAction>([
  'export-docx',
  'export-odt',
  'export-rtf',
  'export-epub',
  'export-latex',
  'export-wiki',
  'export-rst',
  'export-textile',
  'export-opml',
]);

export function useDocumentExport(
  editor: MutableRefObject<MarkLyraEditor | null>,
  context: {
    title: string;
    owner(): object;
    sourceId?(): string | undefined;
    unavailable: boolean;
    report: (message: string) => void;
  },
) {
  const busy = useRef(false);
  const alive = useRef(true);
  const [working, setWorking] = useState(false);
  const [capabilities, setCapabilities] = useState<FormatCapabilities>();
  const refreshCapabilities = async () => {
    if (!desktopAvailable) return;
    try {
      const value = await documentExports.capabilities();
      if (alive.current) setCapabilities(value);
      return value;
    } catch {
      return undefined;
    }
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async (action: ExportAction) => {
    if (busy.current || context.unavailable) return;
    const active = editor.current;
    if (!active) return;
    busy.current = true;
    setWorking(true);
    try {
      if (!desktopAvailable) throw new Error('文件导出和打印预览需要桌面程序');
      if (active.isComposing) throw new Error('请先完成输入法候选');
      // Export is an immutable snapshot. It never saves or marks the Markdown document clean.
      const { title } = context;
      const owner = context.owner();
      const sourceId = context.sourceId?.();
      await active.flush();
      if (!alive.current || editor.current !== active || context.owner() !== owner)
        throw new Error('准备导出期间文稿已切换，已取消导出，请重试');
      const revision = active.revision;
      const settings = await exportPreferences.get();
      if (!alive.current || editor.current !== active) return;
      if (context.owner() !== owner || active.revision !== revision || active.hasPendingChanges)
        throw new Error('读取导出设置期间文稿已有更改，已取消导出，请重试');
      if (conversionExportActions.has(action)) {
        const available = await refreshCapabilities();
        if (!available || available.pandoc.status !== 'available')
          throw new Error(available?.pandoc.message ?? '无法检查Pandoc能力；未导出');
        if (!available.formats.includes(action.slice(7) as ConversionFormat))
          throw new Error('当前Pandoc未提供所选格式；未导出');
      }
      if (
        !alive.current ||
        editor.current !== active ||
        context.owner() !== owner ||
        active.revision !== revision ||
        active.hasPendingChanges
      )
        throw new Error('检查转换工具期间文稿已有更改，已取消导出，请重试');
      const options = documentExportOptions(settings, action === 'print-preview', title);
      const image = settings.image ?? {};
      const htmlOptions =
        action === 'export-image'
          ? {
              title,
              ...(image.exportTheme
                ? { theme: image.exportTheme as typeof options.html.theme }
                : {}),
            }
          : action === 'export-html-plain'
            ? { title, styled: false }
            : options.html;
      const html = await active.exportHTML(htmlOptions);
      if (!alive.current || editor.current !== active) return;
      if (context.owner() !== owner || active.revision !== revision || active.hasPendingChanges)
        throw new Error('生成导出快照期间文稿已有更改，已取消导出，请重试');
      if (action === 'export-image') {
        const saved = await documentExports.saveImage(html, title, image, sourceId);
        if (alive.current) context.report(`已导出图片 · ${saved.path}`);
      } else if (conversionExportActions.has(action)) {
        const saved = await documentExports.saveFormat(
          action.slice(7) as ConversionFormat,
          html,
          title,
          sourceId,
        );
        if (alive.current)
          context.report(`已导出 ${action.slice(7).toUpperCase()} · ${saved.path}`);
      } else if (action === 'export-html' || action === 'export-html-plain') {
        const saved = await documentExports.saveHTML(html, title, sourceId);
        if (alive.current) context.report(`已导出 HTML · ${saved.path}`);
      } else {
        await documentExports.openPrintPreview(html, title, options.print);
        if (alive.current) context.report('已打开打印预览');
      }
    } catch (error) {
      if (alive.current && String(error) !== '已取消导出') context.report(String(error));
    } finally {
      busy.current = false;
      if (alive.current) setWorking(false);
    }
  };
  return { working, run, capabilities, refreshCapabilities };
}
