import { sameRuntimeOrigin } from '../export/options.js';
import { resourceBytes } from '../export/resources.js';
import type { ThemeAppearance } from '../styles/appearance.js';
import { emptyThemeStyles, type ThemeStyles, themeStyles } from '../styles/contracts.js';
import { adaptEditorTheme } from '../styles/theme-namespaces.js';
import { readThemeAppearance } from './theme-appearance.js';
import { readThemeFonts } from './theme-fonts.js';

const links = ['theme_css', 'base_user_css', 'theme_user_css'] as const;
type LinkId = (typeof links)[number];

/** Host-driven geometry variables on the root. They never change the theme cascade, and they
 * change on every frame while a pane is dragged or animated. */
const layoutVariables =
  /--marklyra-(?:content-(?:inset|trailing|top)|document-scrollbar-space|source-scrollbar-space|notification-top)s*:[^;]*;?/g;
const withoutLayout = (style: string | null) => (style ?? '').replace(layoutVariables, '').trim();

/** Operates on the three style links, outside the document/history model. */
export class RuntimeThemes {
  private sources: ThemeStyles = { ...emptyThemeStyles };
  private builtin = new URL('./style/themes/marklyra-light.css', location.href).href;
  private readonly abort = new AbortController();
  private observer: MutationObserver | undefined;
  private frame = 0;
  private lastAppearance = '';
  private readonly verified = new Map<string, Promise<void>>();

  constructor(private readonly changed: (appearance: ThemeAppearance) => void) {}

  resolveLink(id: string, value: string): string {
    if (!links.includes(id as LinkId) || !value.startsWith('file:///__marklyra_themes__/'))
      return value;
    if (id === 'theme_css') {
      const name = value.split('/').at(-1) ?? 'marklyra-light.css';
      if (/^(marklyra-light|marklyra-dark)\.css$/.test(name))
        this.builtin = new URL(`./style/themes/${name}`, location.href).href;
      return this.sources.theme ?? this.builtin;
    }
    return (
      (id === 'base_user_css' ? this.sources.baseUser : this.sources.themeUser) ??
      new URL('./empty.css', location.href).href
    );
  }

  install(): void {
    this.observer = new MutationObserver((records) => {
      const probe = (node: Node) =>
        node instanceof Element && node.hasAttribute('data-marklyra-theme-probe');
      if (
        records.some((record) => {
          const target =
            record.target instanceof Element ? record.target : record.target.parentElement;
          if (target?.closest('[data-marklyra-theme-probe]')) return false;
          // Re-reading the whole cascade per dragged frame made pane resizing stutter.
          if (
            record.type === 'attributes' &&
            record.attributeName === 'style' &&
            record.target === document.documentElement &&
            withoutLayout(record.oldValue) ===
              withoutLayout(document.documentElement.getAttribute('style'))
          )
            return false;
          if (record.type !== 'childList') return true;
          return [...record.addedNodes, ...record.removedNodes].some((node) => !probe(node));
        })
      )
        this.schedule();
    });
    this.observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'media', 'disabled'],
      characterData: true,
    });
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      attributeOldValue: true,
    });
    this.observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    document.head.addEventListener('load', () => this.schedule(), {
      capture: true,
      signal: this.abort.signal,
    });
    window.addEventListener('resize', () => this.schedule(), { signal: this.abort.signal });
    this.schedule();
  }

  schedule(): void {
    if (this.frame || this.abort.signal.aborted) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // A theme link can retain its old sheet while the replacement is loading.
      // Only publish a completed cascade; an explicit apply reports its failure.
      void this.read().catch(() => {});
    });
  }

  private publish(): ThemeAppearance {
    const appearance = readThemeAppearance();
    const serialized = JSON.stringify(appearance);
    if (serialized !== this.lastAppearance) {
      this.lastAppearance = serialized;
      this.changed(appearance);
    }
    return appearance;
  }

  async read(): Promise<ThemeAppearance> {
    await this.loaded();
    return this.publish();
  }
  async fonts() {
    await this.loaded();
    return readThemeFonts(this.sources, this.abort.signal);
  }

  async apply(input: unknown, select?: () => void, restore?: () => void): Promise<ThemeAppearance> {
    const next = themeStyles(input, location.href);
    const previous = this.sources;
    const previousBuiltin = this.builtin;
    const previousHrefs = this.elements().map((link) => link.href);
    this.sources = next;
    try {
      select?.();
      const targets = [
        next.theme ?? this.builtin,
        next.baseUser ?? new URL('./empty.css', location.href).href,
        next.themeUser ?? new URL('./empty.css', location.href).href,
      ];
      this.elements().forEach((link, index) => {
        const target = targets[index];
        if (target && link.href !== target) link.href = target;
      });
      return await this.read();
    } catch (error) {
      this.sources = previous;
      this.builtin = previousBuiltin;
      restore?.();
      this.elements().forEach((link, index) => {
        const href = previousHrefs[index];
        if (href && link.href !== href) link.href = href;
      });
      // The prior host lease remains live until the replacement has been accepted.
      await this.loaded().catch(() => {});
      if (!this.abort.signal.aborted) this.publish();
      throw error;
    }
  }

  private elements(): HTMLLinkElement[] {
    return links.map((id) => {
      const element = document.getElementById(id);
      if (!(element instanceof HTMLLinkElement)) throw new Error(`Missing style link: ${id}`);
      return element;
    });
  }

  private async loaded(): Promise<void> {
    if (this.abort.signal.aborted) throw new Error('Theme operation cancelled');
    await Promise.all(this.elements().map((link) => this.loadedLink(link)));
    const visited = new Set<CSSStyleSheet>();
    let sheets = 0;
    const verify = async (sheet: CSSStyleSheet): Promise<void> => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      if (++sheets > 256) throw new Error('Theme contains too many stylesheets');
      const href = sheet.href;
      if (href) {
        const url = new URL(href, location.href);
        if (
          !sameRuntimeOrigin(url, new URL(location.href)) ||
          !url.pathname.toLowerCase().endsWith('.css')
        )
          throw new Error('Theme imports require CSS at the runtime origin');
        let validated = this.verified.get(url.href);
        if (!validated) {
          validated = (async () => {
            const response = await fetch(url.href, {
              signal: this.abort.signal,
              credentials: 'omit',
              redirect: 'error',
            });
            if (
              !response.ok ||
              !/^text\/css(?:;|$)/i.test(response.headers.get('content-type') ?? '')
            )
              throw new Error('Theme stylesheet could not be loaded');
            await resourceBytes(response, 2 * 1024 * 1024, true);
          })().catch((error: unknown) => {
            if (this.verified.get(url.href) === validated) this.verified.delete(url.href);
            throw error;
          });
          // A bounded cache of immutable host revision URLs; never retain arbitrary generations.
          if (this.verified.size >= 256)
            this.verified.delete(this.verified.keys().next().value ?? '');
          this.verified.set(url.href, validated);
        }
        await validated;
      }
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSImportRule) {
          if (!rule.styleSheet) throw new Error('Theme import did not load');
          await verify(rule.styleSheet);
        }
      }
    };
    for (const link of this.elements()) {
      if (!link.sheet) throw new Error('Theme stylesheet did not load');
      await verify(link.sheet);
    }
    for (const sheet of visited) adaptEditorTheme(sheet, visited);
  }

  private loadedLink(link: HTMLLinkElement): Promise<void> {
    const href = link.href;
    const available = () => {
      try {
        return (
          link.sheet?.href === href &&
          Array.from(link.sheet.cssRules).every(
            (rule) =>
              rule.type !== CSSRule.IMPORT_RULE || (rule as CSSImportRule).styleSheet !== null,
          )
        );
      } catch {
        return false;
      }
    };
    if (available()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
        this.abort.signal.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else resolve();
      };
      const loaded = () => {
        if (link.href !== href) finish(new Error('Theme style was superseded'));
        else if (available()) finish();
        else finish(new Error('Theme stylesheet did not become available'));
      };
      const failed = () => finish(new Error(`Theme style could not be loaded: ${link.id}`));
      const cancelled = () => finish(new Error('Theme operation cancelled'));
      const timer = setTimeout(() => finish(new Error('Theme stylesheet load timed out')), 10_000);
      link.addEventListener('load', loaded);
      link.addEventListener('error', failed);
      this.abort.signal.addEventListener('abort', cancelled, { once: true });
      if (this.abort.signal.aborted) cancelled();
      else if (available()) finish();
    });
  }

  destroy(): void {
    this.abort.abort();
    this.observer?.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
  }
}
