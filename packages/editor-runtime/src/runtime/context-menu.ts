import {
  type ClipboardContent,
  type ClipboardImage,
  type ContextAction,
  type ContextMenuRequest,
  clipboardContent,
  externalLink,
  offeredContextActions,
} from '../context-menu/contracts.js';
import type {
  ContextCutCommit,
  ContextExecutionRequest,
  ContextExecutionResult,
} from '../context-menu/execution.js';
import type { ImageHostAction } from '../images/contracts.js';
import type { MarkLyraMenuState } from '../menu-state.js';
import type { MarkLyraCommand, RuntimeConfiguration } from '../protocol.js';
import {
  ClipboardMarkupAddressError,
  clipboardMarkupEvent,
  clipboardMarkupHTML,
  clipboardSelectionHTML,
  clipboardSelectionMarkupHTML,
} from './clipboard-html.js';
import type { CodeLineRange } from './code-line-source.js';
import {
  type ContextMenuFacts,
  contextMenuItems,
  editingContextCommand,
} from './context-menu-items.js';
import {
  type ContextSelection,
  captureContextSelection,
  currentContextCodeMirror,
  restoreContextSelection,
} from './context-menu-selection.js';
import type { LegacyEditor, LegacyGlobals, LegacyNode } from './legacy-types.js';
import { readRuntimeMenuState } from './menu-state.js';
import {
  type TableAxis,
  type TableControlAction,
  type TableControlContext,
  tableControlItems,
} from './table-controls-actions.js';
import { alignTableColumn, applyTableHeading, tableHeadingPlan } from './table-formatting.js';
import { captureTableRedoCursor } from './table-history-cursor.js';
import { readTableRowContext, type TableEditAction } from './table-row-edit.js';

interface Stamp {
  generation: number;
  sequence: number;
}
interface Binding {
  requestId: string;
  editor: LegacyEditor;
  session: string;
  target: Element;
  cid: string | null;
  sourceMode: boolean;
  stamp: Stamp;
  selection: ContextSelection;
  actions: Set<ContextAction>;
  tokens: string[];
  link: string | undefined;
  lineWise: boolean;
  image?: { wrapper: HTMLElement; source: string; syntax: string };
  /** A rendered formula's descendants may change without changing this model block. */
  preview?: { node: LegacyNode; mark: string };
  /** Style facts at the right-click selection. Stamps prove they are still current. */
  editing?: MarkLyraMenuState;
  codeLines?: {
    value: string;
    text: string;
    origin: 'cut' | 'cut-line';
    ranges: CodeLineRange[];
  };
}
export interface ContextMenuDependencies {
  runtime: LegacyGlobals;
  stamp(): Stamp;
  composing(): boolean;
  loading(): boolean;
  disposed(): boolean;
  capabilities(): RuntimeConfiguration['contextMenu'];
  send(request: ContextMenuRequest): void;
  cancel?(requestId: string): void;
  clipboardHTML(html: string, forPaste?: boolean): string;
  normalizeSelection(): boolean;
  armReplacement(text: string, inputType: 'insertText' | 'deleteContentBackward'): boolean;
  armTableRow(rowId: string, action: TableEditAction): boolean;
  armCodeLineCut?(
    cid: string,
    cm: NonNullable<LegacyEditor['sourceView']['cm']>,
    ranges: readonly CodeLineRange[],
  ): boolean;
  importImage?(image: ClipboardImage): void;
  imageActions?(): readonly ImageHostAction[];
  imageReference?(source: string): string;
  imageStorageContext?(): { referenceRoot: string; storageFolder?: string };
  /** The runtime's own command dispatcher, the same one the application menu uses. */
  command?(value: MarkLyraCommand): void;
}
const copyActions = new Set<ContextAction>([
  'edit.copy',
  'edit.cut',
  'edit.copyMarkdown',
  'edit.copyHTML',
  'edit.copySemanticHTML',
  'link.copyAddress',
  'image.copyAddress',
  'table.copy',
  'code.copy',
]);
const copyOnly = new Set<ContextAction>([
  ...copyActions,
  'link.open',
  'image.reveal',
  'image.open',
]);

/** An authored capability boundary over runtime commands. Original menu tokens
 * choose finite groups; callbacks, selectors and document bookmarks never leave the frame. */
export class RuntimeContextMenu {
  private binding: Binding | undefined;
  private pendingImage: Binding | undefined;
  private pendingImageAction: ContextAction | undefined;
  private readonly sourceContextEvents = new WeakMap<
    object,
    { cm: NonNullable<LegacyEditor['sourceView']['cm']>; requestId: string; stamp: Stamp }
  >();
  private cut: { token: string; binding: Binding } | undefined;
  private collecting: Record<string, string> | undefined;
  private abort: AbortController | undefined;
  private offeredEvent: MouseEvent | undefined;
  private offerTicket = 0;
  private dead = false;
  constructor(private readonly deps: ContextMenuDependencies) {}
  /** An in-frame handle binds an explicit cell without changing the user's caret
   * on hover. Execution shares the right-click command and source-proof pipeline. */
  captureTableControl(
    target: HTMLTableCellElement,
    axis: TableAxis,
  ): TableControlContext | undefined {
    const editor = this.deps.runtime.editor;
    if (
      this.unavailable() ||
      !editor ||
      editor.isIME ||
      editor.sourceView.inSourceMode ||
      this.deps.runtime.File?.isLocked ||
      !editor.writingArea.contains(target)
    )
      return;
    const context = readTableRowContext(this.deps.runtime, target);
    const table = target.closest('[mdtype="table"][cid]');
    const node = table && editor.getNode(table.getAttribute('cid') ?? '');
    const field = target.querySelector<HTMLElement>('[mdtype="table_cell"][cid]');
    const cid = field?.getAttribute('cid');
    const cellNode = cid ? editor.getNode(cid) : undefined;
    if (!context || !table || !node || !field || !cid || !cellNode) return;
    const mark = node.toMark();
    const binding: Binding = {
      requestId: crypto.randomUUID(),
      editor,
      session: editor.sessionStr,
      target: field,
      cid,
      sourceMode: false,
      stamp: { ...this.deps.stamp() },
      selection: {
        bookmark: null,
        focusCid: cid,
        selected: false,
        anchor: { node: field, offset: 0 },
        head: { node: field, offset: 0 },
      },
      actions: new Set(),
      tokens: ['table'],
      link: undefined,
      lineWise: false,
    };
    const heading = tableHeadingPlan(this.deps.runtime, target, axis);
    const menuItems = contextMenuItems(this.facts(binding));
    const items = tableControlItems(
      axis,
      menuItems,
      {
        enabled: Boolean(heading?.cells.length),
        checked: Boolean(heading?.allBold),
      },
      context.rows.alignment?.[target.cellIndex],
    );
    binding.actions = offeredContextActions(menuItems);
    const formatting = new Set<TableControlAction>([
      'table.headingRow',
      'table.headingColumn',
      'table.alignLeft',
      'table.alignCenter',
      'table.alignRight',
    ]);
    let consumed = false;
    const current = () => {
      const stamp = this.deps.stamp();
      return (
        !consumed &&
        !this.unavailable() &&
        !this.deps.runtime.File?.isLocked &&
        !editor.isIME &&
        this.deps.runtime.editor === editor &&
        editor.sessionStr === binding.session &&
        !editor.sourceView.inSourceMode &&
        stamp.generation === binding.stamp.generation &&
        stamp.sequence === binding.stamp.sequence &&
        target.isConnected &&
        editor.writingArea.contains(target) &&
        editor.getNode(node.cid) === node &&
        editor.getNode(cid) === cellNode &&
        target.contains(field) &&
        field.getAttribute('cid') === cid &&
        node.toMark() === mark
      );
    };
    return {
      items,
      current,
      run: (action) => {
        if (!current()) throw Error('表格已变化，请重新打开行列操作');
        if (!items.some((item) => item.actionId === action && item.enabled))
          throw Error('此表格操作当前不可用');
        if (formatting.has(action)) {
          consumed = true;
          this.invalidate();
          this.restore(binding);
          if (action === 'table.headingRow' || action === 'table.headingColumn') {
            if (!heading) throw Error('无法验证表格标题格式');
            applyTableHeading(this.deps.runtime, target, heading, this.deps.armTableRow);
          } else {
            alignTableColumn(
              this.deps.runtime,
              target,
              action === 'table.alignLeft'
                ? 'left'
                : action === 'table.alignCenter'
                  ? 'center'
                  : 'right',
            );
          }
          return;
        }
        const existing = action as ContextAction;
        this.assertCurrent(binding, existing);
        consumed = true;
        this.invalidate();
        this.binding = binding;
        this.execute({ requestId: binding.requestId, actionId: existing });
      },
    };
  }
  install(): void {
    const document = this.deps.runtime.editor?.writingArea.ownerDocument;
    if (!document || this.abort || this.dead) return;
    this.abort = new AbortController();
    const options = { capture: true, signal: this.abort.signal };
    const invalidate = () => this.invalidate();
    for (const name of [
      'beforeinput',
      'input',
      'compositionstart',
      'paste',
      'drop',
      'keydown',
      'mousedown',
    ])
      document.addEventListener(name, invalidate, options);
    // Current shipped resources always select the WK/Mac bridge, even when the
    // new host declares Windows. Retain a finite fallback if that route is absent.
    document.addEventListener(
      'contextmenu',
      (event) => {
        if (!(event instanceof MouseEvent) || !event.isTrusted) return;
        const ticket = this.offerTicket,
          stamp = { ...this.deps.stamp() },
          eventEditor = this.deps.runtime.editor,
          sourceMode = eventEditor?.sourceView.inSourceMode;
        // Microtasks can run between native event listeners, before the original
        // jQuery handler. Only classify a missing bridge offer after that task.
        setTimeout(() => {
          const current = this.deps.stamp();
          if (
            this.offeredEvent === event ||
            ticket !== this.offerTicket ||
            this.deps.runtime.editor !== eventEditor ||
            this.deps.runtime.editor?.sourceView.inSourceMode !== sourceMode ||
            current.generation !== stamp.generation ||
            current.sequence !== stamp.sequence ||
            this.unavailable()
          )
            return;
          const target = this.element(event.target);
          if (!target || !this.inEditor(target)) return;
          const tokens = this.deps.runtime.editor?.contextMenu.getMenuItemsForMac(target);
          if (tokens) this.offer(tokens, event);
        }, 0);
      },
      options,
    );
  }
  offer(tokens: unknown, event: MouseEvent): void {
    this.install();
    this.offeredEvent = event;
    this.invalidate();
    if (!event.isTrusted || !Array.isArray(tokens) || !tokens.every((t) => typeof t === 'string'))
      return;
    const ticket = ++this.offerTicket,
      stamp = { ...this.deps.stamp() },
      eventEditor = this.deps.runtime.editor,
      sourceMode = eventEditor?.sourceView.inSourceMode,
      eventTarget = this.element(event.target),
      previewTarget = eventTarget
        ?.closest('.md-math-container')
        ?.closest('[mdtype="math_block"][cid]'),
      previewNode = previewTarget && eventEditor?.getNode(previewTarget.getAttribute('cid') ?? ''),
      preview =
        previewTarget && previewNode?.get('type') === 'math_block'
          ? { target: previewTarget, node: previewNode, mark: previewNode.toMark() }
          : undefined;
    // Capture after the original event task has completed its selection changes.
    setTimeout(() => {
      const current = this.deps.stamp();
      if (
        ticket !== this.offerTicket ||
        this.deps.runtime.editor !== eventEditor ||
        this.deps.runtime.editor?.sourceView.inSourceMode !== sourceMode ||
        current.generation !== stamp.generation ||
        current.sequence !== stamp.sequence ||
        this.unavailable()
      )
        return;
      const editor = this.deps.runtime.editor,
        target = preview?.target ?? this.element(event.target);
      if (!editor || !target || !this.inEditor(target) || !target.isConnected) return;
      if (
        preview &&
        (editor.getNode(target.getAttribute('cid') ?? '') !== preview.node ||
          preview.node.toMark() !== preview.mark)
      )
        return;
      const selection = captureContextSelection(editor, target);
      const bindingTarget = selection.cmWrapper ?? target;
      const binding: Binding = {
        requestId: crypto.randomUUID(),
        editor,
        session: editor.sessionStr,
        target: bindingTarget,
        cid: bindingTarget.closest('[cid]')?.getAttribute('cid') ?? null,
        sourceMode: editor.sourceView.inSourceMode,
        stamp: { ...this.deps.stamp() },
        selection,
        actions: new Set(),
        tokens: [...tokens],
        link: this.linkFor(target),
        lineWise: !selection.selected && this.lineWiseOption(selection),
        ...this.imageFor(target),
        ...this.editingFor(selection),
        ...(preview ? { preview: { node: preview.node, mark: preview.mark } } : {}),
      };
      const items = contextMenuItems(this.facts(binding));
      if (!items.length) return;
      binding.actions = offeredContextActions(items);
      this.binding = binding;
      this.deps.send({
        requestId: binding.requestId,
        point: { x: event.clientX, y: event.clientY },
        items,
      });
      if (binding.sourceMode && selection.cm === editor.sourceView.cm && selection.cm)
        this.sourceContextEvents.set(event, {
          cm: selection.cm,
          requestId: binding.requestId,
          stamp: { ...binding.stamp },
        });
    }, 0);
  }
  /** The host restores captured CM ranges itself. Do not let the original
   * delayed single-range replay overwrite a consumed menu or a newer edit. */
  replaySourceContext(cm: unknown, event: unknown, execute: () => unknown): unknown {
    const original =
      event && typeof event === 'object' ? Reflect.get(event, 'originalEvent') : undefined;
    const key = original && typeof original === 'object' ? original : event;
    if (!key || typeof key !== 'object') return execute();
    const ticket = this.sourceContextEvents.get(key);
    if (!ticket || ticket.cm !== cm) return execute();
    this.sourceContextEvents.delete(key);
    return undefined;
  }
  invalidate(requestId?: string): void {
    if (
      requestId &&
      this.binding?.requestId !== requestId &&
      this.cut?.binding.requestId !== requestId &&
      this.pendingImage?.requestId !== requestId
    )
      return;
    const id =
      this.binding?.requestId ?? this.cut?.binding.requestId ?? this.pendingImage?.requestId;
    this.binding = undefined;
    this.cut = undefined;
    this.pendingImage = undefined;
    this.pendingImageAction = undefined;
    this.offerTicket++;
    if (id) this.deps.cancel?.(id);
  }
  finishImage(): void {
    this.pendingImage = undefined;
    this.pendingImageAction = undefined;
  }
  prepareNativePaste(requestId: string, action: ContextAction): void {
    const binding = this.binding;
    if (
      !binding ||
      binding.requestId !== requestId ||
      !['edit.paste', 'edit.pastePlain'].includes(action)
    )
      throw Error('菜单请求已失效');
    this.assertCurrent(binding, action);
    this.restore(binding);
  }
  verifyImage(requestId: string): void {
    if (!this.pendingImage || this.pendingImage.requestId !== requestId || !this.pendingImageAction)
      throw Error('图片菜单请求已失效');
    this.assertCurrent(this.pendingImage, this.pendingImageAction);
  }
  destroy(): void {
    this.invalidate();
    this.dead = true;
    this.offeredEvent = undefined;
    this.abort?.abort();
    this.abort = undefined;
  }
  /** Only bridge writes made within our synchronous original copy invocation. */
  captureClipboardWrite(data: unknown): boolean {
    if (!this.collecting) return false;
    if (!data || typeof data !== 'object') throw Error('无效的原剪贴板数据');
    const formats = Reflect.get(data, 'data');
    if (!formats || typeof formats !== 'object') throw Error('无效的原剪贴板格式');
    for (const key of ['text/plain', 'text/html', 'text/markhtml']) {
      const value: unknown = Reflect.get(formats, key);
      if (typeof value === 'string')
        this.collecting[key] =
          key === 'text/markhtml'
            ? clipboardMarkupHTML(this.deps.clipboardHTML(value))
            : key === 'text/html'
              ? this.deps.clipboardHTML(value)
              : value;
    }
    return true;
  }
  prepare(request: ContextExecutionRequest): ContextExecutionResult {
    if (!copyActions.has(request.actionId)) throw Error('此菜单操作不生成剪贴板内容');
    const binding = this.take(request);
    this.restore(binding);
    const initial = binding.selection;
    let content: ClipboardContent;
    try {
      if (binding.lineWise && ['edit.copy', 'edit.cut'].includes(request.actionId)) {
        if (initial.cm) {
          binding.codeLines = this.codeLines(initial, request.actionId === 'edit.copy');
          content = clipboardContent({ text: binding.codeLines.text });
        } else {
          binding.editor.selection.selectLineWrap();
          binding.selection = captureContextSelection(binding.editor, binding.target);
          if (!binding.selection.selected) throw Error('当前行没有可复制内容');
          content = this.copy(binding, request.actionId);
        }
      } else content = this.copy(binding, request.actionId);
    } finally {
      restoreContextSelection(binding.editor, initial);
    }
    this.assertCurrent(binding, request.actionId);
    if (request.actionId === 'edit.cut') {
      const token = crypto.randomUUID();
      this.cut = { token, binding };
      return { effect: { type: 'clipboard', content, cutToken: token } };
    }
    return { effect: { type: 'clipboard', content } };
  }
  execute(request: ContextExecutionRequest): ContextExecutionResult {
    if (copyActions.has(request.actionId)) return this.prepare(request);
    const binding = this.take(request);
    if (request.actionId === 'link.open')
      return { effect: { type: 'openLink', url: externalLink(binding.link ?? '') } };
    if (request.actionId === 'image.open') {
      const source = binding.image?.source ?? '';
      return {
        effect: {
          type: 'openLink',
          url: externalLink(source.startsWith('//') ? `http:${source}` : source),
        },
      };
    }
    if (
      ['image.reveal', 'image.copyToStorage', 'image.downloadToStorage'].includes(request.actionId)
    ) {
      const image = binding.image;
      if (!image || !this.deps.imageReference) throw Error('图片上下文已失效');
      this.pendingImage = binding;
      this.pendingImageAction = request.actionId;
      return {
        effect: {
          type: 'imageAction',
          requestId: binding.requestId,
          action:
            request.actionId === 'image.reveal'
              ? 'reveal'
              : request.actionId === 'image.copyToStorage'
                ? 'copyToStorage'
                : 'downloadToStorage',
          source: image.source,
          reference: this.deps.imageReference(image.source),
          ...(this.deps.imageStorageContext?.() ?? { referenceRoot: '' }),
        },
      };
    }
    if (binding.preview && request.actionId.startsWith('block.')) {
      // Rebind the original command's private target to the proven stable block;
      // MathJax may have retired the SVG node captured by its context handler.
      binding.editor.contextMenu.getMenuItemsForMac(binding.target);
    } else this.restore(binding);
    const editing = editingContextCommand(request.actionId);
    if (editing) {
      if (!this.deps.command) throw Error('宿主尚未提供编辑命令');
      this.deps.command(editing);
      return {};
    }
    const editor = binding.editor;
    const finishTableCursor = [
      'table.insertColumnBefore',
      'table.insertColumnAfter',
      'table.deleteColumn',
      'table.moveColumnLeft',
      'table.moveColumnRight',
    ].includes(request.actionId)
      ? captureTableRedoCursor(this.deps.runtime, binding.target)
      : undefined;
    if (
      [
        'table.insertRowBefore',
        'table.insertRowAfter',
        'table.deleteRow',
        'table.moveRowUp',
        'table.moveRowDown',
      ].includes(request.actionId)
    ) {
      const point = binding.selection.anchor?.node;
      const element = point?.nodeType === 1 ? (point as Element) : point?.parentElement;
      const rowId = element?.closest('tr[mdtype="table_row"][cid]')?.getAttribute('cid');
      const operation =
        request.actionId === 'table.deleteRow'
          ? 'delete'
          : request.actionId === 'table.moveRowUp'
            ? 'up'
            : request.actionId === 'table.moveRowDown'
              ? 'down'
              : request.actionId === 'table.insertRowBefore'
                ? 'before'
                : 'after';
      if (!rowId || !this.deps.armTableRow(rowId, operation))
        throw Error('此表格暂不支持可验证的源码行编辑');
    }
    switch (request.actionId) {
      case 'image.delete': {
        if (!binding.image) throw Error('图片上下文已失效');
        editor.selection.selectAllElem(this.deps.runtime.$(binding.image.wrapper));
        this.deps.armReplacement('', 'deleteContentBackward');
        editor.UserOp.backspaceHandler(editor, null, 'delSelection');
        break;
      }
      case 'image.toHTML':
      case 'image.toMarkdown': {
        if (!binding.image) throw Error('图片上下文已失效');
        if (!binding.cid) throw Error('图片所属块已失效');
        const image = binding.image.wrapper.querySelector('img');
        const title = image?.getAttribute('title') ?? '';
        if (request.actionId === 'image.toMarkdown' && title) {
          // The shipped HTML-to-Markdown helper reads an unrelated free `title`
          // variable. Preserve actual metadata through the original selected
          // inline replacement transaction instead of dropping the title.
          const alt = image?.getAttribute('alt') ?? '';
          if (/[\r\n]/.test(title + alt)) throw Error('此多行图片标题暂不支持安全转换');
          const label = alt.replace(/\\/g, '\\\\').replace(/[[\]]/g, '\\$&');
          const source = binding.image.source.replace(/</g, '%3C').replace(/>/g, '%3E');
          editor.selection.selectAllElem(this.deps.runtime.$(binding.image.wrapper));
          editor.insertText(`![${label}](<${source}> ${JSON.stringify(title)})`);
          break;
        }
        editor.undo.endSnap(true);
        editor.undo.addSnap(binding.cid, 0);
        editor.imgEdit.switchPattern(
          this.deps.runtime.$(binding.image.wrapper),
          request.actionId === 'image.toHTML',
          false,
          false,
        );
        editor.undo.addSnap(binding.cid, 2);
        break;
      }
      case 'image.zoom50':
      case 'image.zoom100':
      case 'image.zoom200':
        if (!binding.image) throw Error('图片上下文已失效');
        editor.imgEdit.zoomAction(
          this.deps.runtime.$(binding.image.wrapper),
          request.actionId === 'image.zoom50'
            ? '50%'
            : request.actionId === 'image.zoom100'
              ? '100%'
              : '200%',
        );
        break;
      case 'edit.paste':
      case 'edit.pastePlain': {
        const content = clipboardContent(request.clipboard);
        const html = request.actionId === 'edit.paste' ? content.html : undefined;
        const markHtml = request.actionId === 'edit.paste' ? content.markHtml : undefined;
        if (
          request.actionId === 'edit.paste' &&
          content.image &&
          !html &&
          !markHtml &&
          !binding.selection.cm
        ) {
          if (!this.deps.importImage) throw Error('宿主尚未提供图片导入能力');
          this.deps.importImage(content.image);
          break;
        }
        if (!content.text && !html && !markHtml) break;
        if (binding.selection.cm) {
          if (!content.text) throw Error('代码编辑器暂不支持没有纯文本的 HTML 剪贴板内容');
          const cm = binding.selection.cm;
          cm.operation(() =>
            cm.replaceSelections(
              (binding.selection.ranges ?? []).map(() => content.text),
              'end',
              'paste',
            ),
          );
        } else {
          this.deps.normalizeSelection();
          if (markHtml)
            editor.UserOp.pasteHandler(
              editor,
              clipboardMarkupEvent(
                { text: content.text, ...(html === undefined ? {} : { html }), markHtml },
                (value) => this.deps.clipboardHTML(value, true),
              ),
            );
          else if (html)
            editor.UserOp.pasteHandler(editor, this.deps.clipboardHTML(html, true), false);
          else {
            this.deps.armReplacement(content.text, 'insertText');
            editor.UserOp.pasteHandler(editor, content.text, true);
          }
        }
        break;
      }
      case 'table.insertRowBefore':
        editor.tableEdit.addRow(true);
        break;
      case 'table.insertRowAfter':
        editor.tableEdit.addRow(false);
        break;
      case 'table.insertColumnBefore':
        editor.tableEdit.addCol(true);
        break;
      case 'table.insertColumnAfter':
        editor.tableEdit.addCol(false);
        break;
      case 'table.deleteRow':
        editor.tableEdit.deleteRow(false);
        break;
      case 'table.deleteColumn':
        editor.tableEdit.deleteCol();
        break;
      case 'table.delete':
        editor.tableEdit.deleteTable();
        break;
      case 'table.moveRowUp':
        editor.tableEdit.moveRowUpOrDown(true);
        break;
      case 'table.moveRowDown':
        editor.tableEdit.moveRowUpOrDown(false);
        break;
      case 'table.moveColumnLeft':
        editor.tableEdit.moveColLeftOrRight(true);
        break;
      case 'table.moveColumnRight':
        editor.tableEdit.moveColLeftOrRight(false);
        break;
      case 'table.format':
        editor.tableEdit.reformatTable();
        break;
      case 'block.insertParagraphBefore':
        editor.contextMenu.insertParagraphBefore();
        break;
      case 'block.insertParagraphAfter':
        editor.contextMenu.insertParagraphAfter();
        break;
      case 'block.edit':
        editor.contextMenu.editActive();
        break;
      case 'block.delete':
        editor.contextMenu.deleteActive();
        break;
      case 'code.format':
        editor.fences.formatContent();
        break;
      case 'code.formatSelection':
        editor.fences.formatContent(true);
        break;
      default:
        throw Error('不支持的菜单操作');
    }
    finishTableCursor?.();
    return {};
  }
  commitCut(request: ContextCutCommit): void {
    const cut = this.cut;
    if (!cut || request.token !== cut.token) throw Error('剪切确认已失效');
    this.cut = undefined;
    this.assertCurrent(cut.binding, 'edit.cut');
    this.restore(cut.binding);
    const { editor, selection } = cut.binding;
    if (selection.cm && cut.binding.codeLines) {
      // Preserve the original empty carets as the history's selection-before.
      // Selecting whole lines first would make Undo restore those temporary ranges.
      const cm = selection.cm;
      const codeLines = cut.binding.codeLines;
      const cid: unknown = Reflect.get(cm, 'cid');
      if (
        !cut.binding.sourceMode &&
        codeLines.ranges.length &&
        (typeof cid !== 'string' ||
          cid !== cut.binding.cid ||
          !this.deps.armCodeLineCut?.(cid, cm, codeLines.ranges))
      ) {
        throw Error('此代码块暂不支持可验证的整行剪切');
      }
      if (
        codeLines.origin === 'cut-line' &&
        codeLines.ranges.length &&
        typeof cid === 'string' &&
        cid === cut.binding.cid
      ) {
        editor.undo.register({
          undo: [{ type: 'fences-pos', id: cid, pos: { ...cm.getCursor() } }],
          redo: [],
        });
      }
      cm.operation(() => {
        for (const range of codeLines.ranges)
          cm.replaceRange('', range.from, range.to, codeLines.origin);
      });
    } else if (selection.cm)
      selection.cm.operation(() =>
        selection.cm?.replaceSelections(
          (selection.ranges ?? []).map(() => ''),
          'start',
          'cut',
        ),
      );
    else {
      this.deps.normalizeSelection();
      this.deps.armReplacement('', 'deleteContentBackward');
      editor.UserOp.backspaceHandler(editor, null, 'delSelection');
    }
  }
  private take(request: ContextExecutionRequest): Binding {
    const binding = this.binding;
    if (!binding || request.requestId !== binding.requestId) throw Error('菜单请求已失效');
    this.binding = undefined; // Consumption deliberately does not cancel a host write.
    this.assertCurrent(binding, request.actionId);
    return binding;
  }
  private assertCurrent(binding: Binding, action: ContextAction): void {
    const stamp = this.deps.stamp(),
      editor = this.deps.runtime.editor;
    if (
      this.unavailable() ||
      editor !== binding.editor ||
      editor.sessionStr !== binding.session ||
      editor.sourceView.inSourceMode !== binding.sourceMode ||
      stamp.generation !== binding.stamp.generation ||
      stamp.sequence !== binding.stamp.sequence ||
      !binding.target.isConnected ||
      (binding.selection.cm && !currentContextCodeMirror(editor, binding.selection)) ||
      (binding.lineWise && !this.lineWiseOption(binding.selection)) ||
      (binding.codeLines && binding.selection.cm?.getValue() !== binding.codeLines.value) ||
      !this.inEditor(binding.target) ||
      binding.target.closest('[cid]')?.getAttribute('cid') !== (binding.cid ?? undefined) ||
      (binding.preview &&
        (editor.getNode(binding.cid ?? '') !== binding.preview.node ||
          binding.preview.node.toMark() !== binding.preview.mark)) ||
      !binding.actions.has(action) ||
      (binding.image &&
        (!binding.image.wrapper.isConnected ||
          this.imageFor(binding.image.wrapper).image?.source !== binding.image.source))
    )
      throw Error('菜单上下文已改变，请重新打开菜单');
    if (!copyOnly.has(action) && this.deps.runtime.File?.isLocked) throw Error('文档已锁定');
    const enabled = offeredContextActions(contextMenuItems(this.facts(binding)));
    if (!enabled.has(action)) throw Error('此菜单操作当前不可用');
  }
  private unavailable(): boolean {
    return (
      this.dead ||
      this.deps.disposed() ||
      this.deps.loading() ||
      this.deps.composing() ||
      !this.deps.runtime.editor ||
      Boolean(this.deps.runtime.File?._onInitParse)
    );
  }
  private lineWiseOption(selection: ContextSelection): boolean {
    return Boolean(
      selection.cm
        ? selection.cm.getOption('lineWiseCopyCut')
        : this.deps.runtime.File?.option.lineWiseCopyCut,
    );
  }
  private codeReadOnly(selection: ContextSelection): boolean {
    const cm = selection.cm;
    if (!cm) return false;
    return (
      typeof cm.getOption !== 'function' || Boolean(cm.getOption('readOnly') || cm.doc.cantEdit)
    );
  }
  private codeLines(
    selection: ContextSelection,
    copying: boolean,
  ): NonNullable<Binding['codeLines']> {
    const cm = selection.cm,
      ranges = selection.ranges;
    if (!cm || !ranges?.length) throw Error('代码编辑器光标已失效');
    const value = cm.getValue();
    const inputStyle = cm.getOption('inputStyle');
    if (inputStyle !== 'textarea' && inputStyle !== 'contenteditable')
      throw Error('无法确认代码编辑器剪贴板类型');
    // The shipped CM fork's Doc API reads File.useCRLF; its public option can
    // remain null while getRange/getValue produce CRLF. Do not infer this from
    // the upstream CodeMirror option or from text content.
    const ending = cm.doc.lineSeparator();
    if (typeof ending !== 'string' || !ending) throw Error('无法确认代码编辑器换行符');
    const text: string[] = [];
    const lines = new Map<number, NonNullable<Binding['codeLines']>['ranges'][number]>();
    for (const range of ranges) {
      const line = range.head.line,
        content = cm.getLine(line);
      if (content === undefined || range.anchor.line !== line || range.anchor.ch !== range.head.ch)
        throw Error('代码编辑器光标已失效');
      const next = cm.getLine(line + 1) !== undefined;
      text.push(content + (next ? ending : ''));
      if (content || next)
        lines.set(line, {
          from: { line, ch: 0 },
          to: next ? { line: line + 1, ch: 0 } : { line, ch: content.length },
        });
    }
    const combined = text.join('\n');
    const first = ranges[0]?.head.line;
    const firstRange = first === undefined ? undefined : lines.get(first);
    return {
      value,
      // The original textarea copy path selects its DOM value, whose newline
      // normalization differs from cut's direct clipboardData Text write.
      text: copying && inputStyle === 'textarea' ? combined.replace(/\r\n?/g, '\n') : combined,
      origin: inputStyle === 'textarea' ? 'cut-line' : 'cut',
      // Match the shipped writable-clipboardData textarea branch, which copies
      // all caret lines but deletes only the first sorted range, not the primary.
      // The contenteditable branch deletes the normalized union of its ranges.
      ranges:
        inputStyle === 'textarea'
          ? firstRange
            ? [firstRange]
            : []
          : [...lines.values()].sort((a, b) => b.from.line - a.from.line),
    };
  }
  private element(target: EventTarget | null): Element | undefined {
    const node = target as Node | null;
    return node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? undefined);
  }
  private inEditor(target: Element): boolean {
    const editor = this.deps.runtime.editor;
    return Boolean(
      editor &&
        (editor.writingArea.contains(target) ||
          (editor.sourceView.inSourceMode && target.closest('#typora-source'))),
    );
  }
  private restore(binding: Binding): void {
    restoreContextSelection(binding.editor, binding.selection);
  }
  private linkFor(target: Element): string | undefined {
    const wrapper = target.closest('.md-link,.md-def-link');
    if (!wrapper) return;
    if (wrapper.classList.contains('md-def-link'))
      return wrapper.querySelector('.md-def-url')?.textContent ?? undefined;
    const anchor = wrapper.querySelector('a');
    if (wrapper.getAttribute('md-inline') === 'reflink') {
      const ref = anchor?.getAttribute('data-ref');
      return ref ? this.deps.runtime.editor?.nodeMap.link_list.getHrefByRef(ref) : undefined;
    }
    return anchor?.getAttribute('href') ?? undefined;
  }
  private imageFor(target: Element): Pick<Binding, 'image'> {
    const wrapper = target.closest<HTMLElement>('.md-image');
    if (!wrapper || this.deps.runtime.editor?.sourceView.inSourceMode) return {};
    const source = wrapper.dataset.ref
      ? this.deps.runtime.editor?.nodeMap.link_list.getHrefByRef(wrapper.dataset.ref)
      : wrapper.dataset.src;
    if (!source) return {};
    return { image: { wrapper, source, syntax: wrapper.getAttribute('md-inline') ?? '' } };
  }
  private editingFor(selection: ContextSelection): Pick<Binding, 'editing'> {
    if (selection.cm || this.deps.runtime.editor?.sourceView.inSourceMode) return {};
    try {
      return { editing: readRuntimeMenuState(this.deps.runtime) };
    } catch {
      return {};
    }
  }
  private facts(binding: Binding): ContextMenuFacts {
    const caps = this.deps.capabilities();
    const point = binding.selection.anchor?.node;
    const element = point
      ? point.nodeType === 1
        ? (point as Element)
        : point.parentElement
      : binding.target;
    const cell = element?.closest('td,th') as HTMLTableCellElement | null;
    const row = cell?.closest('tr') as HTMLTableRowElement | null;
    const table = row?.closest('table');
    let safeLink = false;
    if (binding.link)
      try {
        externalLink(binding.link);
        safeLink = true;
      } catch {
        /* Copy remains allowed; arbitrary opening does not. */
      }
    return {
      tokens: binding.tokens,
      selected: binding.selection.selected,
      lineWise: binding.lineWise,
      writable: !this.deps.runtime.File?.isLocked && !this.codeReadOnly(binding.selection),
      sourceMode: binding.sourceMode,
      codeMirror: Boolean(binding.selection.cm),
      table:
        cell && row && table
          ? {
              row: row.rowIndex,
              rows: table.rows.length,
              column: cell.cellIndex,
              columns: row.cells.length,
              body: row.parentElement?.tagName === 'TBODY',
              sourceRows: Boolean(readTableRowContext(this.deps.runtime, row)),
            }
          : undefined,
      link: binding.link,
      externalLink: safeLink,
      clipboardRead: Boolean(caps?.clipboardRead),
      clipboardWrite: Boolean(caps?.clipboardWrite),
      openExternal: Boolean(caps?.openExternal),
      ...(binding.editing ? { editing: binding.editing } : {}),
      ...(binding.image
        ? {
            image: {
              source: binding.image.source,
              syntax: binding.image.syntax,
              actions: this.deps.imageActions?.() ?? [],
            },
          }
        : {}),
    };
  }
  private copy(binding: Binding, action: ContextAction): ClipboardContent {
    if (action === 'link.copyAddress') return clipboardContent({ text: binding.link ?? '' });
    if (action === 'image.copyAddress')
      return clipboardContent({ text: binding.image?.source ?? '' });
    const editor = binding.editor,
      cm = binding.selection.cm;
    if (cm && action !== 'code.copy') return clipboardContent({ text: cm.getSelection() });
    if (this.collecting) throw Error('剪贴板准备不可重入');
    this.collecting = {};
    try {
      if (action === 'table.copy') editor.tableEdit.copyTable();
      else if (action === 'code.copy') editor.fences.copyContent();
      else if (action === 'edit.copyMarkdown') editor.UserOp.copyAsMarkdown(editor);
      else if (action === 'edit.copyHTML') editor.UserOp.copyAsHTMLSource(editor);
      else if (action === 'edit.copySemanticHTML') editor.UserOp.copyAsSemanticHTML(editor);
      else editor.UserOp.copyHandler(editor);
      const text = this.collecting['text/plain'];
      let markHtml = this.collecting['text/markhtml'];
      let html = this.collecting['text/html'];
      if (
        (action === 'edit.copy' || action === 'edit.cut') &&
        (html === undefined || markHtml !== undefined)
      ) {
        // WK's native copy supplies ancestor formatting; the standalone host
        // must derive it from the bound DOM range, not reparse isolated text.
        restoreContextSelection(editor, binding.selection);
        const selected = editor.writingArea.ownerDocument.getSelection();
        if (selected?.rangeCount === 1) {
          const project = (html: string) => editor.UserOp.prepMarkHtml(html, editor).html();
          if (html === undefined)
            html = clipboardSelectionHTML(
              editor.writingArea,
              selected.getRangeAt(0),
              (value) => this.deps.clipboardHTML(value),
              project,
            );
          if (markHtml !== undefined)
            markHtml = clipboardSelectionMarkupHTML(
              editor.writingArea,
              selected.getRangeAt(0),
              (value) => this.deps.clipboardHTML(value),
              project,
            );
        }
      }
      if (text === undefined && html === undefined) throw Error('原编辑器没有生成剪贴板内容');
      return clipboardContent({
        text: text ?? '',
        ...(html === undefined ? {} : { html }),
        ...(markHtml === undefined ? {} : { markHtml }),
      });
    } catch (error) {
      if (!(error instanceof ClipboardMarkupAddressError)) throw error;
      this.collecting = {};
      try {
        editor.UserOp.copyAsMarkdown(editor);
      } catch (fallbackError) {
        // The native Markdown writer also offers a private rich flavor. Its
        // address remains forbidden; captureClipboardWrite retains text first.
        if (!(fallbackError instanceof ClipboardMarkupAddressError)) throw fallbackError;
      }
      const text = this.collecting['text/plain'];
      if (!text) throw new Error('未生成完整的 Markdown 剪贴板文本，已保留正文');
      return clipboardContent({ text });
    } finally {
      this.collecting = undefined;
    }
  }
}
