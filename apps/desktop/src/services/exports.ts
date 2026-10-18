import { invoke } from '@tauri-apps/api/core';
import type {
  ExportPreferencesSnapshot,
  ImageExportPreferences,
} from '../features/settings/runtime-preferences/export-preferences.js';
import type { DocumentFile } from './documents.js';

export interface PrintPreviewOptions {
  paperSize?: '' | 'A5' | 'A4' | 'A3' | 'Letter' | 'Legal' | 'Tabloid' | 'custom';
  customPaperSizeMm?: [number, number];
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
  formats: ConversionFormat[];
  importExtensions: string[];
  image: boolean;
}
export const documentExports = {
  capabilities: () => invoke<FormatCapabilities>('get_format_capabilities'),
  choosePandoc: (expectedRevision: number) =>
    invoke<ExportPreferencesSnapshot | null>('choose_pandoc_path', { expectedRevision }),
  saveImage: (
    html: string,
    suggestedName: string,
    options: ImageExportPreferences = {},
    sourceId?: string,
  ) =>
    invoke<{ path: string; bytes: number }>('save_export_image', {
      html,
      suggestedName,
      options,
      sourceId: sourceId ?? null,
    }),
  saveFormat: (format: ConversionFormat, html: string, suggestedName: string, sourceId?: string) =>
    invoke<{ path: string; bytes: number }>('save_export_format', {
      format,
      html,
      suggestedName,
      sourceId: sourceId ?? null,
    }),
  importDocument: () => invoke<DocumentFile>('import_document'),
  saveHTML: (html: string, suggestedName: string, sourceId?: string) =>
    invoke<{ path: string; bytes: number }>('save_export_html', {
      html,
      suggestedName,
      sourceId: sourceId ?? null,
    }),
  openPrintPreview: (html: string, title: string, options: PrintPreviewOptions = {}) =>
    invoke<{ id: string }>('open_print_preview', { html, title, options }),
};
