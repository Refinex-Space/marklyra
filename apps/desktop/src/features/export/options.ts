import type { ExportHTMLOptions } from '@marklyra/editor-runtime';
import type { PrintPreviewOptions } from '../../services/exports.js';
import type { ExportPreferencesSnapshot, PdfExportPreferences } from './preferences.js';

export type HtmlFlavor = 'html' | 'pdf' | 'image';

/** The HTML snapshot options of one format, from the confirmed preference record. */
export function htmlSnapshotOptions(
  settings: ExportPreferencesSnapshot,
  flavor: HtmlFlavor,
  title: string,
): ExportHTMLOptions {
  const selected = settings[flavor];
  const theme = selected.exportTheme as ExportHTMLOptions['theme'];
  return {
    title,
    ...(theme ? { theme } : {}),
    ...(selected.extraCss ? { extraCss: selected.extraCss } : {}),
    ...(flavor === 'pdf' ? { print: { splitPages: settings.pdf.splitPages ?? false } } : {}),
  };
}

/** Page geometry for the system print panel, from the confirmed preference record. */
export function printPreviewOptions(pdf: PdfExportPreferences): PrintPreviewOptions {
  return {
    ...(pdf.paper === undefined ? {} : { paperSize: pdf.paper }),
    ...(pdf.paper === 'custom' ? { customPaperSizeMm: pdf['paper.custom'] ?? [210, 297] } : {}),
    ...(pdf.landscape ? { landscape: true } : {}),
    ...(pdf['paper.margin'] === 'custom'
      ? {
          marginsMm: {
            top: pdf['paper.marginTop'] ?? 16,
            right: pdf['paper.marginRight'] ?? 16,
            bottom: pdf['paper.marginBottom'] ?? 16,
            left: pdf['paper.marginLeft'] ?? 16,
          },
        }
      : {}),
  };
}

/** Resolve only the confirmed preference record captured for this export. */
export function documentExportOptions(
  settings: ExportPreferencesSnapshot,
  printing: boolean,
  title: string,
): { html: ExportHTMLOptions; print: PrintPreviewOptions } {
  return {
    html: htmlSnapshotOptions(settings, printing ? 'pdf' : 'html', title),
    print: printPreviewOptions(settings.pdf),
  };
}
