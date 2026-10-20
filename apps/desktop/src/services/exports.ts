import { invoke } from '@tauri-apps/api/core';
import type {
  ExportPathTarget,
  ExportPreferencesSnapshot,
  ImageExportPreferences,
} from '../features/export/preferences.js';
import type { DocumentFile } from './documents.js';

export interface PrintPreviewOptions {
  paperSize?: '' | 'A5' | 'A4' | 'A3' | 'Letter' | 'Legal' | 'Tabloid' | 'custom';
  customPaperSizeMm?: [number, number];
  landscape?: boolean;
  marginsMm?: { top: number; right: number; bottom: number; left: number };
  header?: string;
  footer?: string;
}

export type ConversionFormat =
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'epub'
  | 'latex'
  | 'wiki'
  | 'rst'
  | 'textile'
  | 'opml';
export interface FormatCapabilities {
  pandoc: {
    status: 'available' | 'missing' | 'invalid';
    path: string | null;
    version: string | null;
    message: string;
  };
  /** Built-in Pandoc formats this Pandoc can write. */
  formats: ConversionFormat[];
  /** Every output format this Pandoc offers to a custom export. */
  writers: string[];
  importExtensions: string[];
  image: boolean;
  /** `direct` writes a PDF file; `dialog` hands the page to the system print panel. */
  pdf: 'direct' | 'dialog' | 'none';
  /** Whether PDF header/footer, bookmarks and background are applied by this host. */
  headerFooter: boolean;
}
export interface SavedExport {
  path: string;
  bytes: number;
  /** Things worth knowing about a file that was written anyway. */
  warnings: string[];
}
/** Per-document variables of header and footer text. */
export interface PdfContext {
  title: string;
  author: string;
}
export const documentExports = {
  capabilities: () => invoke<FormatCapabilities>('get_format_capabilities'),
  choosePandoc: (expectedRevision: number) =>
    invoke<ExportPreferencesSnapshot | null>('choose_pandoc_path', { expectedRevision }),
  /** A native dialog whose answer (folder, reference document, template) the host stores. */
  choosePath: (expectedRevision: number, target: ExportPathTarget) =>
    invoke<ExportPreferencesSnapshot | null>('choose_export_path', { expectedRevision, target }),
  /** The host's own check of the free-form Pandoc arguments; resolves to the normalised list. */
  checkArguments: (text: string) => invoke<string[]>('check_export_arguments', { text }),
  saveImage: (
    html: string,
    suggestedName: string,
    options: ImageExportPreferences = {},
    sourceId?: string,
  ) =>
    invoke<SavedExport>('save_export_image', {
      html,
      suggestedName,
      options,
      sourceId: sourceId ?? null,
    }),
  savePdf: (html: string, suggestedName: string, context: PdfContext, sourceId?: string) =>
    invoke<SavedExport>('save_export_pdf', {
      html,
      suggestedName,
      context,
      sourceId: sourceId ?? null,
    }),
  /** `target` is a built-in key such as `docx`, or `custom:<id>`; `markdown` embeds its images. */
  saveFormat: (target: string, markdown: string, suggestedName: string, sourceId?: string) =>
    invoke<SavedExport>('save_export_format', {
      target,
      markdown,
      suggestedName,
      sourceId: sourceId ?? null,
    }),
  importDocument: () => invoke<DocumentFile>('import_document'),
  saveHTML: (html: string, suggestedName: string, sourceId?: string) =>
    invoke<SavedExport>('save_export_html', {
      html,
      suggestedName,
      sourceId: sourceId ?? null,
    }),
  openPrintPreview: (html: string, title: string, options: PrintPreviewOptions = {}) =>
    invoke<{ id: string }>('open_print_preview', { html, title, options }),
  /** Only files this run exported can be shown or opened. */
  reveal: (path: string) => invoke<void>('reveal_export_file', { path }),
  open: (path: string) => invoke<void>('open_export_file', { path }),
};
