import { type ThemeFont, themeFonts } from '@marklyra/editor-runtime';

/** Installs only owned faces. It never fetches a URL or changes existing CSS/system fonts. */
export class HostThemeFonts {
  private generation = 0;
  private destroyed = false;
  private pending: AbortController | undefined;
  private owned: FontFace[] = [];

  async apply(input: ThemeFont[]): Promise<void> {
    const generation = ++this.generation;
    this.pending?.abort();
    if (this.destroyed) throw new Error('Theme font host is destroyed');
    const abort = new AbortController();
    this.pending = abort;
    const fonts = themeFonts(input);
    const current = () => !this.destroyed && generation === this.generation;
    const staged = await Promise.all(
      fonts.map(async (font) => {
        let failure: unknown = new Error('No usable theme font source');
        for (const source of font.sources) {
          if (!current()) throw new Error('Theme font operation was superseded');
          const face = new FontFace(
            JSON.stringify(font.family),
            source.kind === 'local' ? `local(${JSON.stringify(source.name)})` : source.bytes,
            font.descriptors,
          );
          try {
            await new Promise<void>((resolve, reject) => {
              const finish = (error?: unknown) => {
                clearTimeout(timer);
                abort.signal.removeEventListener('abort', cancelled);
                if (error) reject(error);
                else resolve();
              };
              const cancelled = () => finish(new Error('Theme font operation was superseded'));
              const timer = window.setTimeout(
                () => finish(new Error('Theme font load timed out')),
                10_000,
              );
              abort.signal.addEventListener('abort', cancelled, { once: true });
              if (abort.signal.aborted) cancelled();
              else void face.load().then(() => finish(), finish);
            });
            if (!current()) throw new Error('Theme font operation was superseded');
            return face;
          } catch (error) {
            failure = error;
          }
        }
        throw failure;
      }),
    );
    if (!current()) throw new Error('Theme font operation was superseded');
    const installed: FontFace[] = [];
    try {
      for (const face of staged) {
        document.fonts.add(face);
        installed.push(face);
      }
    } catch (error) {
      for (const face of installed) document.fonts.delete(face);
      throw error;
    }
    for (const face of this.owned) document.fonts.delete(face);
    this.owned = staged;
    if (this.pending === abort) this.pending = undefined;
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    this.pending?.abort();
    this.pending = undefined;
    for (const face of this.owned) document.fonts.delete(face);
    this.owned = [];
  }
}
