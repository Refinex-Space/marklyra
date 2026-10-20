import type { PdfExportPreferences } from '../preferences.js';
import { BAND_MM, DEFAULT_MARGIN_MM, paperMillimetres } from './catalog.js';

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Zones {
  left: string;
  center: string;
  right: string;
}
export interface PdfPreviewModel {
  /** Paper size in millimetres after orientation, width first. */
  paper: [number, number];
  /** Margins as the host will apply them, including room widened for a header or footer. */
  margins: Margins;
  header: Zones;
  footer: Zones;
}

export interface SampleDocument {
  title: string;
  author: string;
  pageNo: number;
  totalPages: number;
  today: string;
}

/** Replaces the variables a header or footer may use; unknown `${…}` text stays literal. */
export function resolveVariables(text: string, sample: SampleDocument): string {
  return text.replace(/\$\{([A-Za-z]+)\}/g, (match, name: string) => {
    switch (name) {
      case 'title':
        return sample.title;
      case 'author':
        return sample.author;
      case 'pageNo':
        return String(sample.pageNo);
      case 'totalPages':
        return String(sample.totalPages);
      case 'today':
        return sample.today;
      default:
        return match;
    }
  });
}

export function hasText(zones: Zones): boolean {
  return [zones.left, zones.center, zones.right].some((text) => text.trim() !== '');
}

export function headerZones(pdf: PdfExportPreferences): Zones {
  return { left: pdf.headerLeft ?? '', center: pdf.header ?? '', right: pdf.headerRight ?? '' };
}
export function footerZones(pdf: PdfExportPreferences): Zones {
  return { left: pdf.footerLeft ?? '', center: pdf.footer ?? '', right: pdf.footerRight ?? '' };
}

/** The page the host will print, mirroring its rules for defaults and header/footer room. */
export function pdfPreview(pdf: PdfExportPreferences, withBands: boolean): PdfPreviewModel {
  const [width, height] = paperMillimetres(pdf.paper, pdf['paper.custom']);
  const paper: [number, number] = pdf.landscape ? [height, width] : [width, height];
  const custom = pdf['paper.margin'] === 'custom';
  const pick = (value: number | undefined) =>
    custom ? (value ?? DEFAULT_MARGIN_MM) : DEFAULT_MARGIN_MM;
  const header = withBands ? headerZones(pdf) : { left: '', center: '', right: '' };
  const footer = withBands ? footerZones(pdf) : { left: '', center: '', right: '' };
  const margins: Margins = {
    top: Math.max(pick(pdf['paper.marginTop']), hasText(header) ? BAND_MM : 0),
    right: pick(pdf['paper.marginRight']),
    bottom: Math.max(pick(pdf['paper.marginBottom']), hasText(footer) ? BAND_MM : 0),
    left: pick(pdf['paper.marginLeft']),
  };
  return { paper, margins, header, footer };
}

/** True when the margins leave no printable area, which the host refuses. */
export function marginsFillPage(model: PdfPreviewModel): boolean {
  return (
    model.margins.left + model.margins.right >= model.paper[0] ||
    model.margins.top + model.margins.bottom >= model.paper[1]
  );
}
