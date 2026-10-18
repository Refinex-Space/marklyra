import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { SidebarResize } from '../../components/SidebarResize.js';
import { applicationPreferences } from '../../services/application-preferences.js';
import { exportPreferences } from '../../services/export-preferences.js';
import { documentExports } from '../../services/exports.js';
import { type FilePreferences, filePreferences } from '../../services/file-preferences.js';
import {
  isMarkdownPreferenceKey,
  type MarkdownPreferencesSnapshot,
  markdownPreferencePatch,
  markdownPreferences,
  markdownPreferencesOptions,
} from '../../services/markdownPreferences.js';
import { editorRuntime } from '../../services/runtime.js';
import { type StartupPreferences, startupPreferences } from '../../services/startup.js';
import { themeFiles } from '../../services/themes.js';
import { editorChrome } from '../../services/ui-chrome.js';
import { resolveThemeId, storedTheme, type ThemeCatalog } from '../themes/model.js';
import { readAutoSavePreference } from './auto-save-preference.js';
import { filenameImageStorageFolder } from './image-storage.js';
import { readPreferences, savePreferences } from './preferences.js';
import {
  type ApplicationPreferencesSnapshot,
  applicationEditorPreferences,
  applicationPreferenceChange,
  applicationStatisticsPreferences,
  isApplicationPreferenceKey,
} from './runtime-preferences/application-preferences.js';
import { editorPreferencesOptions } from './runtime-preferences/editor-preferences.js';
import {
  type ExportPreferencesSnapshot,
  exportPreferenceChange,
  exportPreferencesOptions,
  isExportPreferenceKey,
} from './runtime-preferences/export-preferences.js';
import {
  filePreferenceChange,
  filePreferencesOptions,
  isFilePreferenceKey,
} from './runtime-preferences/file-preferences.js';
import {
  type PreferenceKey,
  type PreferenceValue,
  preferenceChange,
  preferenceThemeFiles,
} from './runtime-preferences/policy.js';
import { RuntimePreferences } from './runtime-preferences/RuntimePreferences.js';
import {
  isStartupEditorKey,
  startupEditorOptions,
} from './runtime-preferences/startup-editor-preferences.js';
import {
  startupPreferenceAction,
  startupPreferencesOptions,
} from './runtime-preferences/startup-preferences.js';

function options(
  catalog: ThemeCatalog,
  files: FilePreferences,
  startup: StartupPreferences,
  markdown: MarkdownPreferencesSnapshot,
  application: ApplicationPreferencesSnapshot,
  exports: ExportPreferencesSnapshot,
) {
  const value = readPreferences();
  const folder = value.imageStorageFolder;
  const statistics = applicationStatisticsPreferences(application, value);
  let theme = 'marklyra-light.css';
  try {
    const candidate = `${resolveThemeId(storedTheme(), catalog)}.css`;
    if (catalog.themes.some((entry) => `${entry.id}.css` === candidate)) theme = candidate;
  } catch {
    /* Defaults remain available when storage is blocked. */
  }
  return {
    locale: 'zh-Hans',
    allThemes: catalog.themes.map((entry) => `${entry.id}.css`),
    marklyraThemeActions: true,
    marklyraReadingSpeedActions: true,
    theme,
    image_save_location:
      folder === ''
        ? ''
        : folder === '.'
          ? 'folder'
          : folder === 'assets'
            ? 'assert'
            : folder === filenameImageStorageFolder
              ? 'per-file-assert'
              : 'custom',
    custom_image_save_location:
      value.customImageStorageFolder.startsWith('/') ||
      value.customImageStorageFolder.startsWith('.')
        ? value.customImageStorageFolder
        : `./${value.customImageStorageFolder}`,
    no_image_move_for_local: !value.imageMoveForLocal,
    apply_image_move_for_web: value.imageMoveForWeb,
    use_relative_path_for_img: value.useRelativeImagePath,
    relativePathWithDot: value.relativeImagePathWithDot,
    wordsPerMinute: statistics.wordsPerMinute,
    customWordsPerMinute: statistics.customWordsPerMinute,
    always_show_wordcount: statistics.alwaysShowWordCount,
    ...editorPreferencesOptions(applicationEditorPreferences(application, value.editorPreferences)),
    enableAutoSave: application.values.enableAutoSave ?? readAutoSavePreference(),
    zoomFactor: application.values.zoomFactor ?? 1,
    quitAfterWindowClose: application.values.quitAfterWindowClose ?? false,
    debugMode: application.values.debugMode ?? false,
    darkTheme: `${resolveThemeId(String(application.values.darkTheme ?? 'marklyra-dark.css').replace(/\.css$/, ''), catalog)}.css`,
    useSeparateDarkTheme: application.values.useSeparateDarkTheme ?? false,
    can_collapse_outline_panel: application.values.can_collapse_outline_panel ?? true,
    ...startupEditorOptions(application.values),
    ...filePreferencesOptions(files),
    ...startupPreferencesOptions(startup),
    ...markdownPreferencesOptions(markdown),
    ...exportPreferencesOptions(exports),
  };
}

/** Trusted Shell host. The settings UI stays in a separate, unprivileged origin. */
export function PreferencesWindow({
  embedded = false,
  sidebarWidth = 270,
  dark = false,
  sidebarBackground,
  closeRequest: externalCloseRequest = 0,
  onClose,
  onFailure,
  onDeferredChange,
  onSidebarWidthChange,
  onSidebarDragWidthChange,
}: {
  embedded?: boolean;
  sidebarWidth?: number;
  dark?: boolean;
  sidebarBackground?: string | undefined;
  closeRequest?: number;
  onClose?: () => Promise<void>;
  onFailure?: (error: Error) => void;
  onDeferredChange?: () => void;
  onSidebarWidthChange?: (width: number) => void;
  onSidebarDragWidthChange?: (width: number | null) => void;
} = {}) {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const maximumSidebarWidth = Math.max(200, Math.min(440, viewportWidth - 400));
  const pageSidebarWidth = Math.max(200, Math.min(maximumSidebarWidth, sidebarWidth));
  const [runtimeUrl, setRuntimeUrl] = useState('');
  const [platform, setPlatform] = useState<'macos' | 'windows' | 'browser'>('macos');
  const [initialOptions, setInitialOptions] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [closeRequest, setCloseRequest] = useState(0);
  const confirmedFiles = useRef<FilePreferences | null>(null);
  const confirmedStartup = useRef<StartupPreferences | null>(null);
  const confirmedApplication = useRef<ApplicationPreferencesSnapshot | null>(null);
  const confirmedMarkdown = useRef<MarkdownPreferencesSnapshot | null>(null);
  const confirmedExports = useRef<ExportPreferencesSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      editorRuntime(),
      themeFiles.catalog(),
      filePreferences.get(),
      startupPreferences.get(),
      markdownPreferences.get(),
      applicationPreferences.get(),
      exportPreferences.get(),
    ]).then(
      ([runtime, catalog, files, startup, markdown, application, exports]) => {
        if (alive) {
          confirmedFiles.current = files;
          confirmedStartup.current = startup;
          confirmedMarkdown.current = markdown;
          confirmedApplication.current = application;
          confirmedExports.current = exports;
          setInitialOptions(options(catalog, files, startup, markdown, application, exports));
          setPlatform(runtime.platform);
          setRuntimeUrl(new URL('./preferences/setting.html', runtime.url).href);
        }
      },
      (reason: unknown) => {
        if (alive) setError(String(reason));
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!runtimeUrl || !initialOptions)
        void (onClose ? onClose() : editorChrome.closePreferences()).catch((e) =>
          setError(String(e)),
        );
      else setCloseRequest((n) => n + 1);
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [runtimeUrl, initialOptions, onClose]);
  useEffect(() => {
    if (externalCloseRequest && (!runtimeUrl || !initialOptions))
      void (onClose ? onClose() : editorChrome.closePreferences()).catch((e) =>
        setError(String(e)),
      );
  }, [externalCloseRequest, runtimeUrl, initialOptions, onClose]);
  const put = async (key: PreferenceKey, value: PreferenceValue) => {
    const change = preferenceChange(key, value, preferenceThemeFiles(initialOptions?.allThemes));
    const current = readPreferences();
    if (isExportPreferenceKey(change.key)) {
      const before = confirmedExports.current;
      if (!before) throw new Error('导出设置尚未初始化。');
      confirmedExports.current = await exportPreferences.put(
        before.revision,
        exportPreferenceChange(change.key, change.value),
      );
      return;
    }
    if (change.key === 'darkTheme') {
      await themeFiles.requestPreference(String(change.value).replace(/\.css$/, ''), 'dark');
      confirmedApplication.current = await applicationPreferences.get();
      return;
    }
    if (isApplicationPreferenceKey(change.key)) {
      const before = confirmedApplication.current;
      if (!before) throw Error('应用偏好尚未初始化。');
      const applicationChange = applicationPreferenceChange(change.key, change.value);
      const deferred =
        isStartupEditorKey(change.key) ||
        change.key === 'show_line_numbers_for_fence' ||
        change.key === 'no_line_wrapping';
      const beforeOptions: Record<string, unknown> = {
        ...editorPreferencesOptions(
          applicationEditorPreferences(before, current.editorPreferences),
        ),
        ...startupEditorOptions(before.values),
      };
      const beforeValue = beforeOptions[change.key];
      confirmedApplication.current = await applicationPreferences.put(
        before.revision,
        applicationChange.key,
        applicationChange.value,
      );
      if (deferred && beforeValue !== applicationChange.value) onDeferredChange?.();
      return;
    }
    if (isMarkdownPreferenceKey(change.key)) {
      const before = confirmedMarkdown.current;
      if (!before) throw new Error('Markdown偏好尚未初始化。');
      confirmedMarkdown.current = await markdownPreferences.request(
        before.revision,
        markdownPreferencePatch(change.key, change.value),
      );
      return; // Native broadcasts only after the opener and persistence have confirmed.
    }
    if (isFilePreferenceKey(change.key)) {
      const confirmed = confirmedFiles.current;
      if (!confirmed) throw new Error('文件设置尚未初始化。');
      confirmedFiles.current = await filePreferences.put(
        confirmed.revision,
        filePreferenceChange(change.key, change.value),
      );
      try {
        await editorChrome.preferencesChanged();
      } catch (reason) {
        setError(`设置已保存，窗口同步失败：${String(reason)}`);
      }
      return confirmedFiles.current;
    } else
      switch (change.key) {
        case 'theme':
          await themeFiles.requestPreference(String(change.value).replace(/\.css$/, ''));
          return;
        case 'image_save_location': {
          const folders: Record<string, string> = {
            '': '',
            folder: '.',
            assert: 'assets',
            'per-file-assert': filenameImageStorageFolder,
          };
          const folder =
            change.value === 'custom'
              ? current.customImageStorageFolder
              : folders[String(change.value)];
          if (!savePreferences({ ...current, imageStorageFolder: folder ?? 'assets' }))
            throw new Error('无法持久保存图片目录。');
          break;
        }
        case 'custom_image_save_location':
          if (
            !savePreferences({
              ...current,
              imageStorageFolder: String(change.value),
              customImageStorageFolder: String(change.value),
            })
          )
            throw new Error('无法持久保存图片目录。');
          break;
        case 'no_image_move_for_local':
        case 'apply_image_move_for_web':
        case 'use_relative_path_for_img':
        case 'relativePathWithDot': {
          const imageChange =
            change.key === 'no_image_move_for_local'
              ? { imageMoveForLocal: !change.value }
              : change.key === 'apply_image_move_for_web'
                ? { imageMoveForWeb: change.value === true }
                : change.key === 'use_relative_path_for_img'
                  ? { useRelativeImagePath: change.value === true }
                  : { relativeImagePathWithDot: change.value === true };
          if (!savePreferences({ ...current, ...imageChange }))
            throw new Error('无法持久保存图片策略。');
          break;
        }
        default:
          throw Error('此偏好设置业务尚未接通。');
      }
    try {
      await editorChrome.preferencesChanged();
    } catch (reason) {
      setError(`设置已保存，窗口同步失败：${String(reason)}`);
    }
  };
  return (
    <section
      className={`preferences-window${embedded ? ' preferences-page' : ''}`}
      style={
        embedded
          ? ({
              '--settings-sidebar-width': `${pageSidebarWidth}px`,
              '--settings-sidebar-bg': sidebarBackground || (dark ? '#161b22' : '#fafafa'),
              '--settings-page-bg': dark ? '#0d1117' : '#fff',
              '--settings-page-line': dark ? '#30363d' : '#e8e9eb',
            } as CSSProperties)
          : undefined
      }
      aria-label="设置"
      role={embedded ? 'main' : undefined}
    >
      {!embedded && <div className="preferences-drag-region" data-tauri-drag-region="" />}
      {embedded && onSidebarWidthChange && onSidebarDragWidthChange && (
        <div className="settings-resize-track">
          <div style={{ width: pageSidebarWidth, flexShrink: 0 }} />
          <SidebarResize
            width={pageSidebarWidth}
            minimumWidth={200}
            maximumWidth={maximumSidebarWidth}
            change={onSidebarWidthChange}
            onDragWidthChange={onSidebarDragWidthChange}
          />
        </div>
      )}
      {(!runtimeUrl || !initialOptions) && (
        <div className="preferences-loading">
          <button
            type="button"
            onClick={() =>
              void (onClose ? onClose() : editorChrome.closePreferences()).catch((e) =>
                setError(String(e)),
              )
            }
          >
            返回应用
          </button>
          <p>{error || '正在加载设置…'}</p>
        </div>
      )}
      {runtimeUrl && initialOptions && (
        <RuntimePreferences
          runtimeUrl={runtimeUrl}
          platform={platform}
          initialOptions={initialOptions}
          presentation={
            embedded ? { sidebarWidth: pageSidebarWidth, dark, sidebarBackground } : undefined
          }
          closeRequest={closeRequest + externalCloseRequest}
          onPut={put}
          onAction={async (name, data) => {
            if (name === 'choose-pandoc') {
              const before = confirmedExports.current;
              if (!before) throw new Error('导出设置尚未初始化。');
              const next = await documentExports.choosePandoc(before.revision);
              if (next) confirmedExports.current = next;
              return next;
            }
            if (name === 'open-theme-folder') await themeFiles.openFolder();
            else if (name === 'theme-gallery') await themeFiles.openGallery();
            else if (name === 'clear-recent-history') return filePreferences.clearRecentHistory();
            else if (name === 'startup') {
              const action = startupPreferenceAction(data);
              const confirmed = confirmedStartup.current;
              if (!confirmed) throw new Error('启动设置尚未初始化。');
              const next =
                action.kind === 'set-mode'
                  ? await startupPreferences.setMode(confirmed.revision, action.mode)
                  : await startupPreferences.chooseFolder(confirmed.revision);
              if (next) {
                confirmedStartup.current = next;
                try {
                  await editorChrome.preferencesChanged();
                } catch (reason) {
                  setError(`设置已保存，窗口同步失败：${String(reason)}`);
                }
              }
              return next;
            }
          }}
          onClose={() =>
            (onClose ? onClose() : editorChrome.closePreferences()).catch((reason: unknown) => {
              setError(String(reason));
              throw reason;
            })
          }
          onError={(reason) => {
            setError(reason.message);
            onFailure?.(reason);
          }}
        />
      )}
      {error && (
        <div role="alert" className="preferences-window-error">
          {error}
          {embedded && runtimeUrl && initialOptions && (
            <button type="button" onClick={() => setCloseRequest((value) => value + 1)}>
              返回应用
            </button>
          )}
        </div>
      )}
    </section>
  );
}
