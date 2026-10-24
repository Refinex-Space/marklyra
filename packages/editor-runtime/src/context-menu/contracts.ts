import {
  imageType,
  type NativeImageImporter,
  type NativeInputResult,
  nativeImageResults,
} from '../images/contracts.js';

/** New host protocol identifiers, not runtime native selectors. */
export const CONTEXT_ACTIONS = [
  'edit.copy',
  'edit.cut',
  'edit.paste',
  'edit.pastePlain',
  'edit.copyMarkdown',
  'edit.copyHTML',
  'edit.copySemanticHTML',
  'link.copyAddress',
  'link.open',
  'image.copyAddress',
  'image.reveal',
  'image.open',
  'image.preview',
  'image.copyToStorage',
  'image.downloadToStorage',
  'image.delete',
  'image.toHTML',
  'image.toMarkdown',
  'image.zoom50',
  'image.zoom100',
  'image.zoom200',
  'table.insertRowBefore',
  'table.insertRowAfter',
  'table.insertColumnBefore',
  'table.insertColumnAfter',
  'table.deleteRow',
  'table.deleteColumn',
  'table.delete',
  'table.moveRowUp',
  'table.moveRowDown',
  'table.moveColumnLeft',
  'table.moveColumnRight',
  'table.copy',
  'table.format',
  'block.insertParagraphBefore',
  'block.insertParagraphAfter',
  'block.edit',
  'block.delete',
  'code.copy',
  'code.format',
  'code.formatSelection',
  'format.strong',
  'format.em',
  'format.underline',
  'format.del',
  'format.highlight',
  'format.code',
  'format.inlineMath',
  'format.superscript',
  'format.subscript',
  'format.link',
  'paragraph.body',
  'paragraph.heading1',
  'paragraph.heading2',
  'paragraph.heading3',
  'paragraph.heading4',
  'paragraph.heading5',
  'paragraph.heading6',
  'paragraph.blockquote',
  'paragraph.ul',
  'paragraph.ol',
  'paragraph.tasklist',
  'paragraph.indent',
  'paragraph.outdent',
  'insert.table',
  'insert.codeBlock',
  'insert.mathBlock',
  'insert.hr',
  'insert.image',
] as const;
export type ContextAction = (typeof CONTEXT_ACTIONS)[number];
export type ContextMenuItem =
  | {
      type: 'item';
      actionId: ContextAction;
      label: string;
      enabled: boolean;
      /** Present only for state items; renders a check mark, never a toggle authority. */
      checked?: boolean;
    }
  | { type: 'submenu'; label: string; items: ContextMenuItem[] }
  | { type: 'separator' };
export interface ContextMenuRequest {
  requestId: string;
  /** CSS pixels relative to the host window's content area. */
  point: { x: number; y: number };
  items: ContextMenuItem[];
}
export interface ContextMenuAdapter {
  /** Resolving show is not selection or cancellation. Only onSelect executes an action.
   * Retain at most one registration; release it on signal abort. */
  show(
    request: ContextMenuRequest,
    onSelect: (actionId: ContextAction | null) => void,
    signal: AbortSignal,
  ): void | Promise<void>;
}
export interface ClipboardContent {
  text: string;
  html?: string;
  /** Optional runtime Markdown HTML flavor. Untrusted input; sanitized in the view. */
  markHtml?: string;
  /** Optional binary image supplied by an explicit clipboard read. */
  image?: ClipboardImage;
  /** Host-read-only callback. Consumed in the parent; never serialized into the runtime. */
  nativeImages?: { id: string; import: NativeImageImporter };
  /** Already authorized host image results, never derived from DOM clipboard paths. */
  imageReferences?: readonly NativeInputResult[];
}
export interface ClipboardImage {
  name: string;
  type: string;
  bytes: Uint8Array;
}
export interface ClipboardAdapter {
  /** Read through this adapter on plain DOM paste events when the browser omits binary formats. */
  readOnPaste?: boolean;
  read(signal: AbortSignal): Promise<ClipboardContent>;
  write(content: ClipboardContent, signal: AbortSignal): Promise<void>;
}
export function nativeClipboardImages(content: ClipboardContent): ClipboardContent['nativeImages'] {
  if (content.html || content.markHtml || content.nativeImages === undefined) return undefined;
  const images = content.nativeImages;
  if (
    !images ||
    typeof images.id !== 'string' ||
    !images.id ||
    images.id.length > 256 ||
    typeof images.import !== 'function'
  )
    throw new TypeError('Invalid native clipboard image capability');
  return images;
}
/** Shared with Rust context_menu/schema.rs. */
export const MAX_CONTEXT_MENU_ITEMS = 128;
export const MAX_CLIPBOARD_CHARS = 8 * 1024 * 1024;
function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index++)
    if (value.charCodeAt(index) < 32 || value.charCodeAt(index) === 127) return true;
  return false;
}
export function clipboardContent(value: unknown): ClipboardContent {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid clipboard content');
  const data = value as Partial<ClipboardContent>;
  if (
    typeof data.text !== 'string' ||
    data.text.length > MAX_CLIPBOARD_CHARS ||
    (data.html !== undefined &&
      (typeof data.html !== 'string' || data.html.length > MAX_CLIPBOARD_CHARS)) ||
    (data.markHtml !== undefined &&
      (typeof data.markHtml !== 'string' || data.markHtml.length > MAX_CLIPBOARD_CHARS))
  )
    throw new TypeError('Invalid or oversized clipboard content');
  let image: ClipboardImage | undefined;
  if (data.image !== undefined) {
    const value = data.image;
    if (
      !value ||
      typeof value.name !== 'string' ||
      !value.name ||
      value.name.length > 255 ||
      hasControl(value.name) ||
      typeof value.type !== 'string' ||
      !(value.bytes instanceof Uint8Array)
    )
      throw new TypeError('Invalid clipboard image');
    image = {
      name: value.name,
      type: imageType(value.name, value.type, value.bytes.byteLength),
      bytes: value.bytes.slice(),
    };
  }
  return {
    text: data.text,
    ...(data.html === undefined ? {} : { html: data.html }),
    ...(data.markHtml === undefined ? {} : { markHtml: data.markHtml }),
    ...(image ? { image } : {}),
    ...(data.imageReferences === undefined
      ? {}
      : { imageReferences: nativeImageResults(data.imageReferences) }),
  };
}
export function contextMenuRequest(value: unknown): ContextMenuRequest {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid context menu');
  const request = value as Partial<ContextMenuRequest>;
  if (
    typeof request.requestId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(request.requestId) ||
    !request.point ||
    !Number.isFinite(request.point.x) ||
    !Number.isFinite(request.point.y) ||
    Math.abs(request.point.x) > 100_000 ||
    Math.abs(request.point.y) > 100_000
  )
    throw new TypeError('Invalid context menu identity or position');
  let count = 0;
  const actions = new Set<string>();
  const label = (value: unknown): string => {
    if (typeof value !== 'string' || !value.length || value.length > 160 || hasControl(value))
      throw new TypeError('Invalid context menu label');
    return value;
  };
  const items = (values: unknown, depth: number): ContextMenuItem[] => {
    if (!Array.isArray(values) || !values.length || depth > 3)
      throw new TypeError('Invalid menu items');
    return values.map((raw: unknown): ContextMenuItem => {
      if (++count > MAX_CONTEXT_MENU_ITEMS || !raw || typeof raw !== 'object')
        throw new TypeError('Invalid menu item');
      const item = raw as Partial<ContextMenuItem>;
      if (item.type === 'separator') return { type: 'separator' };
      if (item.type === 'submenu')
        return { type: 'submenu', label: label(item.label), items: items(item.items, depth + 1) };
      if (
        item.type !== 'item' ||
        !CONTEXT_ACTIONS.includes(item.actionId as ContextAction) ||
        typeof item.enabled !== 'boolean' ||
        (item.checked !== undefined && typeof item.checked !== 'boolean') ||
        actions.has(item.actionId as string)
      )
        throw new TypeError('Invalid context menu action');
      actions.add(item.actionId as string);
      return {
        type: 'item',
        actionId: item.actionId as ContextAction,
        label: label(item.label),
        enabled: item.enabled,
        ...(item.checked === undefined ? {} : { checked: item.checked }),
      };
    });
  };
  return {
    requestId: request.requestId,
    point: { x: request.point.x, y: request.point.y },
    items: items(request.items, 0),
  };
}
export function offeredContextActions(items: readonly ContextMenuItem[]): Set<ContextAction> {
  const result = new Set<ContextAction>();
  for (const item of items) {
    if (item.type === 'item' && item.enabled) result.add(item.actionId);
    else if (item.type === 'submenu')
      for (const action of offeredContextActions(item.items)) result.add(action);
  }
  return result;
}
export function externalLink(value: string): string {
  if (value.length > 16_384 || hasControl(value)) throw new Error('Invalid external link');
  const url = new URL(value);
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Only HTTP, HTTPS and mailto links are supported');
  return url.href;
}
