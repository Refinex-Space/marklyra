import type {
  MarkLyraEditor,
  ThemeAppearance,
  ThemeFont,
  ThemeStyles,
} from '@marklyra/editor-runtime';
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { themeFiles } from '../../services/themes.js';
import { HostThemeFonts } from './font-faces.js';
import {
  builtinTheme,
  darkBackground,
  defaultThemeCatalog,
  mirrorLegacyTheme,
  normalizeThemeId,
  persistThemeChoice,
  prepareThemeChoice,
  resolveThemeId,
  rollbackThemeChoice,
  storedTheme,
  type ThemeCatalog,
  type ThemeChoiceWrite,
  themeChoiceKey,
} from './model.js';

let requestId = Date.now() * 1000;
export interface ThemeMode {
  separate: boolean;
  systemDark: boolean;
  darkTheme: string;
  persistDark(theme: string): Promise<() => Promise<void>>;
}
interface ThemeSelectionOptions {
  target?: 'normal' | 'dark';
  choiceTheme?: string;
  passive?: boolean;
  signal?: AbortSignal;
  commit?: (stylesToken: string) => Promise<void>;
}
interface SelectionWaiter extends ThemeSelectionOptions {
  version: number;
  resolve(): void;
  reject(error: Error): void;
}

export function useThemes(
  editor: MutableRefObject<MarkLyraEditor | null>,
  ready: boolean,
  report: (message: string) => void,
  mode?: ThemeMode,
) {
  const catalogRef = useRef<ThemeCatalog | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const effectiveStored = useCallback(() => {
    const stored =
      modeRef.current?.separate && modeRef.current.systemDark
        ? modeRef.current.darkTheme
        : storedTheme();
    return catalogRef.current ? resolveThemeId(stored, catalogRef.current) : stored;
  }, []);
  const [requested, setRequested] = useState<{
    theme: string;
    version: number;
    fallback?: boolean;
  }>(() => ({ theme: storedTheme(), version: 0 }));
  const theme = requested.theme;
  const version = useRef(0);
  const waiter = useRef<SelectionWaiter | null>(null);
  const [catalog, setCatalog] = useState(defaultThemeCatalog);
  const [appearance, setAppearance] = useState<ThemeAppearance>({});
  const [working, setWorking] = useState(false);
  const active = useRef<string>(builtinTheme(theme));
  const applied = useRef({
    theme: builtinTheme(theme),
    styles: { theme: null, baseUser: null, themeUser: null } as ThemeStyles,
    fonts: [] as ThemeFont[],
  });
  const fonts = useRef<HostThemeFonts | null>(null);
  const applying = useRef(false);
  const reportRef = useRef(report);
  reportRef.current = report;

  const selectAndWait = useCallback(
    (value: string, options: ThemeSelectionOptions = {}): Promise<void> => {
      if (options.signal?.aborted) return Promise.reject(new Error('主题请求已取消。'));
      waiter.current?.reject(new Error('主题选择已被更新的请求替换。'));
      const next = ++version.current;
      const dark = !!(modeRef.current?.separate && modeRef.current.systemDark);
      const target = options.target ?? (dark ? 'dark' : 'normal');
      const selected = catalogRef.current
        ? resolveThemeId(normalizeThemeId(value), catalogRef.current)
        : normalizeThemeId(value);
      const rendered = options.passive
        ? selected
        : target === 'dark'
          ? dark
            ? selected
            : storedTheme()
          : dark
            ? (modeRef.current?.darkTheme ?? selected)
            : selected;
      const pending = new Promise<void>((resolve, reject) => {
        waiter.current = {
          ...options,
          target,
          choiceTheme: selected,
          version: next,
          resolve,
          reject,
        };
      });
      const cancelled = () => {
        if (waiter.current?.version !== next) return;
        waiter.current.reject(new Error('主题请求已取消。'));
        waiter.current = null;
        setRequested({ theme: active.current, version: ++version.current });
      };
      options.signal?.addEventListener('abort', cancelled, { once: true });
      const cleanup = () => options.signal?.removeEventListener('abort', cancelled);
      void pending.then(cleanup, cleanup);
      setRequested({ theme: rendered, version: next });
      return pending;
    },
    [],
  );
  const select = useCallback(
    (value: string) => {
      void selectAndWait(value).catch(() => {});
    },
    [selectAndWait],
  );
  const reload = useCallback(() => {
    if (!waiter.current || waiter.current.passive)
      void selectAndWait(effectiveStored(), { passive: true }).catch(() => {});
  }, [selectAndWait, effectiveStored]);
  useEffect(() => {
    if (waiter.current && !waiter.current.passive) return;
    const desired = mode?.separate && mode.systemDark ? mode.darkTheme : storedTheme();
    const resolved = catalogRef.current ? resolveThemeId(desired, catalogRef.current) : desired;
    void selectAndWait(resolved, { passive: true }).catch(() => {});
  }, [mode?.separate, mode?.systemDark, mode?.darkTheme, selectAndWait]);
  const receiveAppearance = useCallback((value: ThemeAppearance) => {
    if (!applying.current) setAppearance(value);
  }, []);

  useEffect(() => {
    fonts.current = new HostThemeFonts();
    return () => {
      fonts.current?.destroy();
      fonts.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !editor.current || requested.fallback) return;
    let alive = true;
    const operation = new AbortController();
    const instance = editor.current;
    const selection = waiter.current?.version === requested.version ? waiter.current : null;
    const cancelled = () => operation.abort();
    selection?.signal?.addEventListener('abort', cancelled, { once: true });
    if (selection?.signal?.aborted) operation.abort();
    const current = () =>
      alive &&
      version.current === requested.version &&
      editor.current === instance &&
      !selection?.signal?.aborted;
    let storageWrite: ThemeChoiceWrite | undefined;
    let rollbackDark: (() => Promise<void>) | undefined;
    let committed = false;
    requestId = Math.max(requestId + 1, Date.now() * 1000 + requested.version);
    const id = requestId;
    const finish = (error?: Error) => {
      const current = waiter.current;
      if (current?.version !== requested.version) return;
      waiter.current = null;
      if (error) current.reject(error);
      else current.resolve();
    };
    applying.current = true;
    setWorking(true);
    void (async () => {
      const nextCatalog = await themeFiles.catalog();
      if (!current()) return;
      catalogRef.current = nextCatalog;
      setCatalog(nextCatalog);
      const resolved = resolveThemeId(theme, nextCatalog);
      if (resolved !== theme) {
        setRequested({ theme: resolved, version: requested.version });
        return;
      }
      const prepared = await themeFiles.prepare(theme, id);
      if (!current()) return;
      const skin = await instance.setThemeStyles(prepared.styles, prepared.theme, operation.signal);
      if (!current()) return;
      const loadedFonts = await instance.getThemeFonts();
      if (!current()) return;
      await fonts.current?.apply(loadedFonts);
      if (!fonts.current) throw new Error('主题字体宿主已关闭。');
      if (!current()) return;
      if (selection && !selection.passive) {
        if (selection.target === 'dark' && modeRef.current)
          rollbackDark = await modeRef.current.persistDark(selection.choiceTheme ?? theme);
        else {
          storageWrite = prepareThemeChoice(selection.choiceTheme ?? theme);
          persistThemeChoice(storageWrite);
        }
      }
      if (selection?.commit) await selection.commit(prepared.token);
      else await themeFiles.accept(prepared.token);
      applied.current = { theme: prepared.theme, styles: prepared.styles, fonts: loadedFonts };
      active.current = theme;
      committed = true;
      if (storageWrite) {
        try {
          mirrorLegacyTheme(storageWrite);
        } catch {
          /* The revisioned choice is authoritative. */
        }
      }
      if (!alive || editor.current !== instance) return;
      setAppearance(skin);
      finish();
    })()
      .catch(async (error: unknown) => {
        if (rollbackDark) {
          try {
            await rollbackDark();
            rollbackDark = undefined;
          } catch (rollbackError) {
            reportRef.current(`深色主题回滚未确认：${String(rollbackError)}`);
          }
        }
        if (!alive || selection?.signal?.aborted) {
          if (storageWrite) {
            try {
              rollbackThemeChoice(storageWrite);
            } catch {
              /* A closed host cannot claim persistence success. */
            }
          }
          return;
        }
        try {
          const previous = applied.current;
          const skin = await instance.setThemeStyles(previous.styles, previous.theme);
          if (!alive) return;
          await fonts.current?.apply(previous.fonts);
          if (alive) setAppearance(skin);
        } catch (restoreError) {
          if (alive) reportRef.current(`主题恢复失败：${String(restoreError)}`);
        }
        if (!alive) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        await themeFiles.syncMenu().catch(() => {});
        reportRef.current(`主题加载失败或保存未确认：${failure.message}`);
        try {
          if (storageWrite) rollbackThemeChoice(storageWrite);
        } catch {
          /* Failure stays visible; no successful persistence is claimed. */
        }
        finish(failure);
        if (theme !== active.current) {
          setWorking(false);
          // CSS was already restored above. Do not start a second implicit successful
          // selection whose reconciliation would retry a missing persistent theme.
          setRequested({ theme: active.current, version: ++version.current, fallback: true });
        }
      })
      .finally(() => {
        if (!committed && storageWrite) {
          try {
            rollbackThemeChoice(storageWrite);
          } catch {
            /* Retain the visible error; never clobber a newer choice. */
          }
        }
        selection?.signal?.removeEventListener('abort', cancelled);
        if (alive) {
          applying.current = false;
          setWorking(false);
          if (
            (committed || (selection && !selection.passive)) &&
            effectiveStored() !== active.current
          )
            reload();
        }
      });
    return () => {
      alive = false;
      operation.abort();
      selection?.signal?.removeEventListener('abort', cancelled);
      finish(new Error('主题请求已取消。'));
    };
  }, [editor, ready, theme, requested.version, requested.fallback, reload, effectiveStored]);

  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === 'marklyra-theme' || event.key === themeChoiceKey || event.key === null)
        reload();
    };
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('storage', storage);
      waiter.current?.reject(new Error('主题窗口已关闭。'));
      waiter.current = null;
    };
  }, [reload]);

  return {
    theme,
    builtin: builtinTheme(theme),
    catalog,
    appearance,
    working,
    dark: darkBackground(appearance['--marklyra-body-bg'], theme === 'marklyra-dark'),
    select,
    selectAndWait,
    reload,
    receiveAppearance,
  };
}
