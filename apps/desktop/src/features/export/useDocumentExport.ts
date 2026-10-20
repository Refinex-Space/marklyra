import type { ExportHTMLOptions, MarkLyraEditor } from '@marklyra/editor-runtime';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { desktopAvailable } from '../../services/documents.js';
import { exportPreferences } from '../../services/export-preferences.js';
import {
  type ConversionFormat,
  documentExports,
  type FormatCapabilities,
  type SavedExport,
} from '../../services/exports.js';
import { type NoticeAction, notify } from '../notices/notices.js';
import { frontMatterFields, titleFromName } from './front-matter.js';
import { htmlSnapshotOptions, printPreviewOptions } from './options.js';

export type ExportAction =
  | 'export-html'
  | 'export-html-plain'
  | 'export-image'
  | 'export-pdf'
  | `export-${ConversionFormat}`
  | `export-custom:${string}`
  | 'print-preview';
const builtinConversions = new Set<string>([
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
export const conversionExportActions = builtinConversions as ReadonlySet<ExportAction>;
const staticActions = new Set<string>([
  'export-html',
  'export-html-plain',
  'export-image',
  'export-pdf',
  'print-preview',
]);
const customAction = /^export-custom:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Whether a menu or command id names an export this hook runs. */
export function isExportAction(value: string): value is ExportAction {
  return staticActions.has(value) || builtinConversions.has(value) || customAction.test(value);
}
/** A Pandoc-backed export: a built-in format such as `docx`, or `custom:<id>`. */
export function isConversionAction(
  action: ExportAction,
): action is `export-${ConversionFormat}` | `export-custom:${string}` {
  return builtinConversions.has(action) || customAction.test(action);
}
/** The `target` the host expects for a conversion action. */
export function conversionTarget(action: ExportAction): string {
  return action.slice('export-'.length);
}

const CANCELLED = '已取消导出';
/** Short names for the success message. */
const labels: Record<string, string> = {
  'export-html': 'HTML',
  'export-html-plain': 'HTML（无样式）',
  'export-image': '图片',
  'export-pdf': 'PDF',
  'export-docx': 'Word',
  'export-odt': 'OpenOffice',
  'export-rtf': 'RTF',
  'export-epub': 'EPUB',
  'export-latex': 'LaTeX',
  'export-wiki': 'Media Wiki',
  'export-rst': 'reStructuredText',
  'export-textile': 'Textile',
  'export-opml': 'OPML',
};

function followUps(saved: SavedExport): NoticeAction[] {
  const failed = (error: unknown) => notify(String(error), 'error');
  return [
    { label: '在文件夹中显示', run: () => documentExports.reveal(saved.path).catch(failed) },
    { label: '打开', run: () => documentExports.open(saved.path).catch(failed) },
  ];
}

export function useDocumentExport(
  editor: MutableRefObject<MarkLyraEditor | null>,
  context: {
    title: string;
    owner(): object;
    sourceId?(): string | undefined;
    unavailable: boolean;
  },
) {
  const busy = useRef(false);
  const alive = useRef(true);
  const [working, setWorking] = useState(false);
  const [capabilities, setCapabilities] = useState<FormatCapabilities>();
  const [customFormats, setCustomFormats] = useState<string[]>([]);
  const refreshCapabilities = useCallback(async () => {
    if (!desktopAvailable) return;
    try {
      const [value, settings] = await Promise.all([
        documentExports.capabilities(),
        exportPreferences.get(),
      ]);
      if (alive.current) {
        setCapabilities(value);
        // A custom export is offered only while Pandoc can write its format.
        setCustomFormats(
          value.pandoc.status === 'available'
            ? settings.custom
                .filter((item) => value.writers.includes(baseOf(item.writer)))
                .map((item) => `custom:${item.id}`)
            : [],
        );
      }
      return value;
    } catch {
      return undefined;
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Another window (or the settings page) changed what can be exported: refresh the menus.
  useEffect(() => {
    if (!desktopAvailable) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen('export-preferences-changed', () => {
          void refreshCapabilities();
        }),
      )
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [refreshCapabilities]);

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
      const stable = () =>
        alive.current &&
        editor.current === active &&
        context.owner() === owner &&
        active.revision === revision &&
        !active.hasPendingChanges;
      const settings = await exportPreferences.get();
      if (!alive.current || editor.current !== active) return;
      if (!stable()) throw new Error('读取导出设置期间文稿已有更改，已取消导出，请重试');
      const conversion = isConversionAction(action);
      const needsCapabilities = conversion || action === 'export-pdf';
      const available = needsCapabilities ? await refreshCapabilities() : undefined;
      if (conversion) {
        if (available?.pandoc.status !== 'available')
          throw new Error(available?.pandoc.message ?? '无法检查Pandoc能力；未导出');
        const target = conversionTarget(action);
        const custom = target.startsWith('custom:')
          ? settings.custom.find((item) => item.id === target.slice(7))
          : undefined;
        const known = custom
          ? available.writers.includes(baseOf(custom.writer))
          : available.formats.includes(target as ConversionFormat);
        if (!known) throw new Error('当前Pandoc未提供所选格式；未导出');
      }
      if (!stable()) throw new Error('检查转换工具期间文稿已有更改，已取消导出，请重试');
      const source = active.getMarkdown();
      const fields = frontMatterFields(source);
      const documentTitle = fields.title ?? titleFromName(title);
      const report = (saved: SavedExport, label: string) => {
        if (!alive.current) return;
        notify(`已导出 ${label} · ${saved.path}`, 'info', { actions: followUps(saved) });
        if (saved.warnings.length)
          notify(`导出时的提示：\n${saved.warnings.map((line) => `• ${line}`).join('\n')}`, 'info');
      };

      if (conversion) {
        const bundle = await active.exportMarkdown();
        if (!stable()) throw new Error('生成导出快照期间文稿已有更改，已取消导出，请重试');
        const target = conversionTarget(action);
        const saved = await documentExports.saveFormat(target, bundle.markdown, title, sourceId);
        const extra = bundle.missing.length
          ? [`${bundle.missing.length} 张图片未能内嵌，已保留原引用：${bundle.missing.slice(0, 3).join('、')}`]
          : [];
        report(
          { ...saved, warnings: [...extra, ...saved.warnings] },
          target.startsWith('custom:')
            ? (settings.custom.find((item) => item.id === target.slice(7))?.name ?? '自定义')
            : (labels[action] ?? target),
        );
        return;
      }

      if (action === 'print-preview' || (action === 'export-pdf' && available?.pdf !== 'direct')) {
        if (action === 'export-pdf' && available?.pdf !== 'dialog')
          throw new Error('此平台暂不支持导出 PDF');
        const html = await active.exportHTML(htmlSnapshotOptions(settings, 'pdf', title));
        if (!stable()) throw new Error('生成导出快照期间文稿已有更改，已取消导出，请重试');
        await documentExports.openPrintPreview(html, title, printPreviewOptions(settings.pdf));
        if (alive.current)
          notify(
            action === 'export-pdf'
              ? '已打开打印预览：在系统打印面板中选择“存储为 PDF”'
              : '已打开打印预览',
          );
        return;
      }

      const flavor = action === 'export-pdf' ? 'pdf' : action === 'export-image' ? 'image' : 'html';
      // A plain export carries no styles at all, so neither the theme nor custom CSS applies.
      const options: ExportHTMLOptions =
        action === 'export-html-plain'
          ? { title, styled: false }
          : htmlSnapshotOptions(settings, flavor, title);
      const html = await active.exportHTML(options);
      if (!stable()) throw new Error('生成导出快照期间文稿已有更改，已取消导出，请重试');
      if (action === 'export-image') {
        report(await documentExports.saveImage(html, title, settings.image, sourceId), '图片');
      } else if (action === 'export-pdf') {
        report(
          await documentExports.savePdf(
            html,
            title,
            { title: documentTitle, author: settings.pdf.author || fields.author || '' },
            sourceId,
          ),
          'PDF',
        );
      } else {
        report(await documentExports.saveHTML(html, title, sourceId), 'HTML');
      }
    } catch (error) {
      if (alive.current && String(error) !== CANCELLED) notify(String(error), 'error');
    } finally {
      busy.current = false;
      if (alive.current) setWorking(false);
    }
  };
  return { working, run, capabilities, customFormats, refreshCapabilities };
}

/** The Pandoc writer without its extension switches (`markdown+pipe_tables` → `markdown`). */
function baseOf(writer: string): string {
  return writer.split(/[+-]/)[0] ?? writer;
}
