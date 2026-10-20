import {
  type ExportPaperSize,
  exportPaperSizes,
  type PandocFormatKey,
  pandocFormatKeys,
} from '../preferences.js';

export type SettingsPage =
  | 'general'
  | 'pdf'
  | 'html'
  | 'html-plain'
  | 'image'
  | PandocFormatKey
  | `custom:${string}`
  | 'new';

export interface PandocFormatInfo {
  key: PandocFormatKey;
  title: string;
  extension: string;
  summary: string;
  /** Word and OpenOffice take a style reference document; the rest take a template. */
  styled: boolean;
}

export const pandocFormats: readonly PandocFormatInfo[] = [
  {
    key: 'docx',
    title: 'Word (.docx)',
    extension: 'docx',
    summary: '可编辑的 Word 文档；公式导出为 Word 原生公式。',
    styled: true,
  },
  {
    key: 'odt',
    title: 'OpenOffice (.odt)',
    extension: 'odt',
    summary: 'OpenDocument 文本，可用 LibreOffice、OpenOffice 与 Word 打开。',
    styled: true,
  },
  {
    key: 'rtf',
    title: 'RTF',
    extension: 'rtf',
    summary: '富文本格式，几乎所有文字处理软件都能打开。',
    styled: false,
  },
  {
    key: 'epub',
    title: 'EPUB',
    extension: 'epub',
    summary: '电子书，可在阅读器与手机阅读应用中打开。',
    styled: false,
  },
  {
    key: 'latex',
    title: 'LaTeX',
    extension: 'tex',
    summary: '可编译的 LaTeX 源文件（.tex）。',
    styled: false,
  },
  {
    key: 'wiki',
    title: 'Media Wiki',
    extension: 'wiki',
    summary: 'MediaWiki 标记文本，可粘贴到维基页面。',
    styled: false,
  },
  {
    key: 'rst',
    title: 'reStructuredText',
    extension: 'rst',
    summary: 'Sphinx 与 Python 文档使用的标记文本。',
    styled: false,
  },
  {
    key: 'textile',
    title: 'Textile',
    extension: 'textile',
    summary: 'Textile 标记文本。',
    styled: false,
  },
  {
    key: 'opml',
    title: 'OPML',
    extension: 'opml',
    summary: '按标题层级生成的大纲，可导入大纲类应用。',
    styled: false,
  },
];

export function pandocFormat(key: string): PandocFormatInfo | undefined {
  return pandocFormats.find((item) => item.key === key);
}
export function isPandocPage(page: string): page is PandocFormatKey {
  return (pandocFormatKeys as readonly string[]).includes(page);
}

export const paperLabels: Record<ExportPaperSize, string> = {
  '': '默认',
  A5: 'A5 · 148 × 210 毫米',
  A4: 'A4 · 210 × 297 毫米',
  A3: 'A3 · 297 × 420 毫米',
  Letter: 'Letter · 216 × 279 毫米',
  Legal: 'Legal · 216 × 356 毫米',
  Tabloid: 'Tabloid · 279 × 432 毫米',
  custom: '自定义…',
};
export const paperOrder = exportPaperSizes;

/** Paper size in millimetres, width first; the unset default is A4. */
export function paperMillimetres(
  paper: ExportPaperSize | undefined,
  custom: [number, number] | undefined,
): [number, number] {
  switch (paper) {
    case 'A5':
      return [148, 210];
    case 'A3':
      return [297, 420];
    case 'Letter':
      return [216, 279];
    case 'Legal':
      return [216, 356];
    case 'Tabloid':
      return [279, 432];
    case 'custom':
      return custom ?? [210, 297];
    default:
      return [210, 297];
  }
}

/** The margin the host uses when margins are not customised. */
export const DEFAULT_MARGIN_MM = 16;
/** Room a header or footer needs inside its margin; thinner margins are widened. */
export const BAND_MM = 12;
export const MAX_IMAGE_HEIGHT = 32_768;
export const MAX_IMAGE_PIXELS = 16_777_216;

const writerExtensions: Record<string, string> = {
  markdown: 'md',
  gfm: 'md',
  commonmark: 'md',
  commonmark_x: 'md',
  markdown_strict: 'md',
  markdown_mmd: 'md',
  markdown_phpextra: 'md',
  markdown_github: 'md',
  asciidoc: 'adoc',
  asciidoctor: 'adoc',
  html: 'html',
  html4: 'html',
  html5: 'html',
  slidy: 'html',
  slideous: 'html',
  dzslides: 'html',
  revealjs: 'html',
  s5: 'html',
  docbook: 'xml',
  docbook4: 'xml',
  docbook5: 'xml',
  jats: 'xml',
  jats_archiving: 'xml',
  jats_articleauthoring: 'xml',
  jats_publishing: 'xml',
  tei: 'xml',
  opendocument: 'xml',
  latex: 'tex',
  beamer: 'tex',
  context: 'tex',
  man: '1',
  mediawiki: 'wiki',
  dokuwiki: 'txt',
  zimwiki: 'txt',
  xwiki: 'txt',
  jira: 'txt',
  plain: 'txt',
  haddock: 'txt',
  bibtex: 'bib',
  biblatex: 'bib',
  csljson: 'json',
  texinfo: 'texi',
  typst: 'typ',
  epub2: 'epub',
  epub3: 'epub',
};

/** The usual file extension of a Pandoc output format, used as the default of a new export. */
export function inferExtension(writer: string): string {
  const base = writer.split(/[+-]/)[0] ?? '';
  const known = writerExtensions[base];
  if (known) return known;
  const plain = base.replace(/[^a-z0-9]/g, '').slice(0, 10);
  return plain || 'txt';
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${bytes} 字节`;
}
