import type { ExportHTMLOptions } from '@marklyra/editor-runtime';
import type { PrintPreviewOptions } from '../../services/exports.js';
import type {
  ExportPreferencesSnapshot,
  PdfExportPreferences,
} from '../settings/runtime-preferences/export-preferences.js';

/** Resolve only the confirmed preference record captured for this export. */
export function documentExportOptions(
  settings: ExportPreferencesSnapshot,
  printing: boolean,
  title: string,
): { html: ExportHTMLOptions; print: PrintPreviewOptions } {
  const selected = printing ? settings.pdf : settings.html;
  const pdf: PdfExportPreferences = settings.pdf;
  const theme = selected.exportTheme as ExportHTMLOptions['theme'];
  return {
    html: {
      title,
      ...(theme ? { theme } : {}),
      ...(printing ? { print: { splitPages: pdf.splitPages ?? false } } : {}),
    },
    print: {
      ...(pdf.paper === undefined ? {} : { paperSize: pdf.paper }),
      ...(pdf.paper === 'custom' ? { customPaperSizeMm: pdf['paper.custom'] ?? [210, 297] } : {}),
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
    },
  };
}
