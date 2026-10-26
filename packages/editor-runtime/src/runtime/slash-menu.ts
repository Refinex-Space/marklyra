import type { MarkLyraMenuState } from '../menu-state.js';
import type { MarkLyraCommand } from '../protocol.js';
import {
  type EditingCommand,
  type EditingCommandId,
  editingCommandAllowed,
  shortcutLabel,
} from './editing-commands.js';
import type { LegacyGlobals } from './legacy-types.js';
import {
  MAX_SLASH_QUERY,
  SLASH_TRIGGERS,
  type SlashSection,
  slashSections,
} from './slash-commands.js';
import { slashMenuStyle } from './slash-menu-style.js';

interface SlashMenuHost {
  runtime: LegacyGlobals;
  available(): boolean;
  composing(): boolean;
  mac(): boolean;
  menuState(): MarkLyraMenuState | undefined;
  normalizeSelection(): void;
  armReplacement(text: string, inputType: 'deleteContentBackward'): void;
  /** Runs one runtime command inside the host's focus and change bookkeeping. */
  execute(work: () => void): void;
  command(value: MarkLyraCommand): void;
  onError(error: unknown): void;
}
interface Session {
  paragraph: HTMLElement;
  cid: string;
  query: string;
  entries: EditingCommand[];
  active: number;
  /** The trigger's left edge in paragraph coordinates; the menu does not drift while typing. */
  anchor?: number;
}

const svg = (body: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const dot = (y: number) => `<circle cx="3" cy="${y}" r=".9" fill="currentColor" stroke="none"/>`;
const ICONS: Partial<Record<EditingCommandId, string>> = {
  ul: svg(`${dot(4)}${dot(8)}${dot(12)}<path d="M6 4h8M6 8h8M6 12h8"/>`),
  tasklist: svg(
    '<rect x="2" y="2.5" width="4.5" height="4.5" rx="1"/><path d="M3 4.8l.9.9 1.6-1.8"/><rect x="2" y="9" width="4.5" height="4.5" rx="1"/><path d="M9 4.75h5M9 11.25h5"/>',
  ),
  blockquote: svg('<path d="M3 3v10"/><path d="M6.5 5h7M6.5 8h7M6.5 11h4.5"/>'),
  table: svg(
    '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12M2 10h12M6.5 3v10"/>',
  ),
  codeBlock: svg('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>'),
  hr: svg('<path d="M2 8h12"/><path d="M4 4.5h8M4 11.5h8" opacity=".35"/>'),
  link: svg(
    '<path d="M6.8 9.2a2.4 2.4 0 0 0 3.4 0l2.4-2.4a2.4 2.4 0 0 0-3.4-3.4l-.8.8"/><path d="M9.2 6.8a2.4 2.4 0 0 0-3.4 0L3.4 9.2a2.4 2.4 0 0 0 3.4 3.4l.8-.8"/>',
  ),
  image: svg(
    '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.8" cy="6.5" r="1.1"/><path d="M2.5 12.2l3.7-3.5 2.6 2.4 1.8-1.6 2.9 2.6"/>',
  ),
};
const BADGES: Partial<Record<EditingCommandId, string>> = {
  paragraph: 'T',
  heading1: 'H1',
  heading2: 'H2',
  heading3: 'H3',
  heading4: 'H4',
  heading5: 'H5',
  heading6: 'H6',
  ol: '1.',
  mathBlock: '∑',
};

/** Typing `/` (or `、`) in an empty paragraph offers the block commands at the caret. The
 * typed text stays ordinary, source-tracked input; only a chosen command removes it, through
 * the same authorized deletion path as the context menu. Focus never leaves the editor. */
export class RuntimeSlashMenu {
  private root: HTMLDivElement | undefined;
  private style: HTMLStyleElement | undefined;
  private session: Session | undefined;
  /** Escape keeps the typed text; do not reopen on it until the paragraph moves on. */
  private dismissed: string | undefined;
  private ticket = 0;
  private pending = false;
  /** The paragraph whose input event just typed a lone trigger, before later keys arrive. */
  private armed: string | undefined;
  /** Only typing opens the menu; caret moves merely update or close it. */
  private typed = false;
  private pointer: { x: number; y: number } | undefined;
  private readonly abort = new AbortController();
  constructor(private readonly host: SlashMenuHost) {}

  install(): void {
    if (this.root || this.abort.signal.aborted) return;
    if (!this.host.runtime.editor?.writingArea) return;
    this.style = document.createElement('style');
    this.style.textContent = slashMenuStyle;
    document.head.append(this.style);
    const root = document.createElement('div');
    root.className = 'ml-slash-menu';
    root.id = 'ml-slash-menu';
    root.hidden = true;
    root.setAttribute('role', 'listbox');
    root.setAttribute('aria-label', '插入块');
    root.setAttribute('contenteditable', 'false');
    // The caret and IME owner stay in the paragraph being typed.
    root.addEventListener('mousedown', (event) => event.preventDefault());
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    root.addEventListener('pointermove', (event) => {
      if (this.pointer && this.pointer.x === event.clientX && this.pointer.y === event.clientY)
        return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const option = (event.target as Element | null)?.closest<HTMLElement>('[data-index]');
      if (option) this.highlight(Number(option.dataset.index), false);
    });
    root.addEventListener('click', (event) => {
      const option = (event.target as Element | null)?.closest<HTMLElement>('[data-index]');
      if (option) this.choose(Number(option.dataset.index));
    });
    document.body.append(root);
    this.root = root;
    const options = { capture: true, signal: this.abort.signal };
    // Input fires after the DOM change, so the trigger can be proven in the same event.
    const typed = (data: string | null | undefined) => {
      if (data && SLASH_TRIGGERS.includes(data)) {
        const found = this.usable() ? this.locate() : undefined;
        if (found?.text === data) this.armed = found.cid;
      }
      this.queue(true);
    };
    document.addEventListener('input', (event) => typed((event as InputEvent).data), options);
    document.addEventListener(
      'compositionend',
      (event) => typed((event as CompositionEvent).data),
      options,
    );
    document.addEventListener('selectionchange', () => this.queue(false), options);
    // Window capture runs before the document-level editor, focus and tracking listeners,
    // so a consumed key never reaches them and arms no input proof.
    window.addEventListener('keydown', (event) => this.key(event), options);
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!root.contains(event.target as Node)) this.close();
      },
      options,
    );
    document.addEventListener('contextmenu', () => this.close(), options);
    document.addEventListener(
      'scroll',
      (event) => {
        if (!root.contains(event.target as Node)) this.place();
      },
      { ...options, passive: true },
    );
    window.addEventListener('resize', () => this.place(), options);
    window.addEventListener(
      'blur',
      (event) => {
        if (event.target === window) this.close();
      },
      options,
    );
  }

  get open(): boolean {
    return Boolean(this.session);
  }

  reset(): void {
    this.ticket++;
    this.pending = false;
    this.typed = false;
    this.armed = undefined;
    this.close();
  }

  destroy(): void {
    this.reset();
    this.abort.abort();
    this.root?.remove();
    this.style?.remove();
    this.root = undefined;
  }

  private usable(): boolean {
    const editor = this.host.runtime.editor;
    return (
      this.host.available() &&
      Boolean(editor) &&
      !editor?.sourceView.inSourceMode &&
      !this.host.runtime.File?.isLocked &&
      !document.body.classList.contains('modal-open') &&
      !document.body.classList.contains('marklyra-export')
    );
  }

  private queue(typed: boolean, delay = 0): void {
    this.typed ||= typed;
    const ticket = ++this.ticket;
    this.pending = true;
    // After the editor's own input handlers have settled the paragraph DOM.
    setTimeout(() => {
      if (ticket === this.ticket) this.flush();
    }, delay);
  }

  private flush(): void {
    this.ticket++;
    this.pending = false;
    const opening = this.typed;
    this.typed = false;
    this.evaluate(opening);
  }

  /** The collapsed caret's ordinary paragraph and its full text, with the caret at its end. */
  private locate(): { paragraph: HTMLElement; cid: string; text: string } | undefined {
    const area = this.host.runtime.editor?.writingArea;
    const selection = document.getSelection();
    if (!area || !selection?.isCollapsed || selection.rangeCount !== 1) return;
    const node = selection.anchorNode;
    const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
    const paragraph = element?.closest<HTMLElement>('p[mdtype="paragraph"][cid]');
    const cid = paragraph?.getAttribute('cid');
    if (
      !paragraph ||
      !cid ||
      !area.contains(paragraph) ||
      paragraph.closest('table,[mdtype="def_footnote"],[mdtype="html_block"]')
    )
      return;
    const text = paragraph.textContent ?? '';
    const before = document.createRange();
    before.setStart(paragraph, 0);
    const caret = selection.getRangeAt(0);
    before.setEnd(caret.startContainer, caret.startOffset);
    if (before.toString() !== text) return;
    return { paragraph, cid, text };
  }

  private evaluate(opening: boolean): void {
    const found = this.usable() ? this.locate() : undefined;
    const triggered = Boolean(found && SLASH_TRIGGERS.includes(found.text.charAt(0)));
    if (!found || !triggered || this.dismissed !== found.cid) this.dismissed = undefined;
    const armed = Boolean(found && this.armed === found.cid);
    if (!found || !triggered) this.armed = undefined;
    if (!found || !triggered) {
      this.close();
      return;
    }
    const session = this.session;
    if (session && (session.paragraph !== found.paragraph || session.cid !== found.cid)) {
      this.close();
      return;
    }
    if (!session) {
      // Only a trigger typed into an otherwise empty paragraph opens the menu.
      if (!opening || (found.text.length !== 1 && !armed) || this.dismissed === found.cid) return;
      // An IME commits `、` just before it reports the composition as finished.
      if (this.host.composing()) {
        this.queue(true, 30);
        return;
      }
      this.armed = undefined;
      this.session = {
        paragraph: found.paragraph,
        cid: found.cid,
        query: '',
        entries: [],
        active: 0,
      };
    }
    const current = this.session as Session;
    const query = found.text.slice(1);
    const sections = this.sections(query);
    const entries = sections.flatMap((section) => section.entries);
    if (
      query.length > MAX_SLASH_QUERY ||
      /\s{2}/.test(query) ||
      (!entries.length && /\s$/.test(query))
    ) {
      this.close();
      return;
    }
    if (query !== current.query || !current.entries.length) current.active = 0;
    current.query = query;
    current.entries = entries;
    current.active = Math.min(current.active, Math.max(0, entries.length - 1));
    this.render(sections);
  }

  private sections(query: string): SlashSection[] {
    const state = this.host.menuState();
    return slashSections(query, (entry) =>
      state ? editingCommandAllowed(state, entry.command) : true,
    );
  }

  private render(sections: SlashSection[]): void {
    const root = this.root,
      session = this.session;
    if (!root || !session) return;
    root.replaceChildren();
    const mac = this.host.mac();
    let index = 0;
    for (const section of sections) {
      if (section.label) {
        const heading = document.createElement('div');
        heading.className = 'ml-slash-group';
        heading.setAttribute('role', 'presentation');
        heading.textContent = section.label;
        root.append(heading);
      }
      for (const entry of section.entries) {
        const option = document.createElement('div');
        option.className = 'ml-slash-option';
        option.id = `ml-slash-option-${index}`;
        option.dataset.index = String(index);
        option.dataset.command = entry.id;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === session.active));
        const icon = document.createElement('span');
        icon.className = 'ml-slash-icon';
        const art = ICONS[entry.id];
        if (art) icon.innerHTML = art;
        else icon.textContent = BADGES[entry.id] ?? entry.label.charAt(0);
        const label = document.createElement('span');
        label.className = 'ml-slash-label';
        label.textContent = entry.label;
        option.append(icon, label);
        if (entry.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.className = 'ml-slash-shortcut';
          shortcut.textContent = shortcutLabel(entry.shortcut, mac);
          option.append(shortcut);
        }
        root.append(option);
        index++;
      }
    }
    if (!index) {
      const empty = document.createElement('div');
      empty.className = 'ml-slash-empty';
      empty.textContent = '无匹配项';
      root.append(empty);
    }
    root.setAttribute('aria-activedescendant', `ml-slash-option-${session.active}`);
    root.hidden = false;
    this.place();
    root.querySelector(`#ml-slash-option-${session.active}`)?.scrollIntoView({ block: 'nearest' });
  }

  private place(): void {
    const root = this.root,
      session = this.session;
    if (!root || !session || root.hidden) return;
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    let rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) rect = session.paragraph.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) {
      this.close();
      return;
    }
    const below = innerHeight - rect.bottom - 12,
      above = rect.top - 12;
    const downward = below >= Math.min(220, root.scrollHeight) || below >= above;
    root.style.maxHeight = `${Math.max(120, Math.min(340, downward ? below : above))}px`;
    const height = root.offsetHeight,
      width = root.offsetWidth;
    const paragraph = session.paragraph.getBoundingClientRect();
    session.anchor ??= rect.left - paragraph.left;
    const left = paragraph.left + session.anchor - 10;
    root.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
    root.style.top = `${downward ? rect.bottom + 6 : Math.max(8, rect.top - 6 - height)}px`;
  }

  private highlight(index: number, scroll = true): void {
    const session = this.session,
      root = this.root;
    if (!session || !root || index < 0 || index >= session.entries.length) return;
    session.active = index;
    for (const option of root.querySelectorAll<HTMLElement>('[data-index]'))
      option.setAttribute('aria-selected', String(Number(option.dataset.index) === index));
    root.setAttribute('aria-activedescendant', `ml-slash-option-${index}`);
    if (scroll)
      root.querySelector(`#ml-slash-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  }

  private key(event: KeyboardEvent): void {
    if (!this.session || event.isComposing || event.keyCode === 229 || this.host.composing())
      return;
    // A fast typist's Enter can arrive before the last keystroke's filter has run.
    if (this.pending) this.flush();
    const session = this.session;
    if (!session) return;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
    const count = session.entries.length;
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (event.key === 'Escape') {
      consume();
      this.dismissed = session.cid;
      this.close();
    } else if (plain && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && count) {
      consume();
      this.highlight((session.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (plain && !event.shiftKey && (event.key === 'Enter' || event.key === 'Tab')) {
      // With nothing to choose, Enter is ordinary typing again.
      if (!count) {
        this.close();
        return;
      }
      consume();
      this.choose(session.active);
    }
  }

  private choose(index: number): void {
    const session = this.session;
    const entry = session?.entries[index];
    this.close();
    if (!session || !entry) return;
    try {
      this.host.execute(() => {
        const found = this.usable() ? this.locate() : undefined;
        if (
          !found ||
          found.paragraph !== session.paragraph ||
          found.text.slice(1) !== session.query ||
          !SLASH_TRIGGERS.includes(found.text.charAt(0))
        )
          throw new Error('输入已变化，请重新输入 /');
        this.clear(found.paragraph);
        this.host.command(entry.command);
      });
    } catch (error) {
      this.host.onError(error);
    }
  }

  /** Removes the typed trigger and query as one authorized selection deletion. */
  private clear(paragraph: HTMLElement): void {
    const editor = this.host.runtime.editor;
    if (!editor) throw new Error('编辑器尚未初始化');
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let first: Text | undefined, last: Text | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      first ??= node as Text;
      last = node as Text;
    }
    if (!first || !last) throw new Error('输入已变化，请重新输入 /');
    document.getSelection()?.setBaseAndExtent(first, 0, last, last.length);
    this.host.normalizeSelection();
    this.host.armReplacement('', 'deleteContentBackward');
    editor.UserOp.backspaceHandler(editor, null, 'delSelection');
  }

  private close(): void {
    this.session = undefined;
    this.pointer = undefined;
    if (!this.root) return;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.root.removeAttribute('aria-activedescendant');
  }
}
