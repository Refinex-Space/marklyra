import {
  exportPreferenceControlSupported,
  isExportPreferenceKey,
  originalImageExportValue,
} from './export-preferences.js';
import { filePreferencesOptions, filePreferencesSnapshot } from './file-preferences.js';
import { isMarkdownPreferenceKey } from './markdown-preferences.js';
import {
  initialPreferencesOptions,
  isRecord,
  type PreferenceChange,
  preferenceChange,
  preferenceKeys,
  preferencesProtocol,
  preferenceThemeFiles,
} from './policy.js';
import { presentSettingsPage, setupSettingsPage } from './settings-page.js';
import { isStartupEditorKey } from './startup-editor-preferences.js';
import {
  type StartupPreferenceAction,
  startupControlMode,
  startupPreferencesSnapshot,
} from './startup-preferences.js';

interface RuntimeComponent {
  setState(value: Record<string, unknown>): void;
}
interface ReactFiber {
  key?: string | null;
  memoizedProps?: Record<string, unknown>;
  return?: ReactFiber;
}
interface PreferencesWindow extends Window {
  _options: Record<string, unknown>;
  Setting?: { close: () => void };
  forceReload?: () => void;
  __MARKLYRA_SETTINGS_BRIDGE__?: { postMessage(message: unknown): void };
  __MARKLYRA_SETTINGS_CHANGE__?: (
    component: RuntimeComponent,
    key: unknown,
    value: unknown,
  ) => void;
}

const runtime = window as unknown as PreferencesWindow;
const query = new URL(location.href).searchParams;
const channel = query.get('channel');
// WindowProxy and query channel survive an iframe reload; this document identity does not.
const instance = crypto.randomUUID();
const expectedParentOrigin = query.get('parentOrigin');
const targetOrigin =
  !expectedParentOrigin || expectedParentOrigin === 'null' ? '*' : expectedParentOrigin;
let updateSettingsPage: (() => void) | undefined;
let initialized = false;
let ready = false;
let disposed = false;
let requestId = 0;
let sequence: Promise<unknown> = Promise.resolve();
let pending = 0;
let generation = 0;
let failed = false;
let invalidDraft: string | null = null;
let fileActionPending = false;
let controlActionPending = false;
let startupPending = false;
let confirmedRender = 0;
let closePending = false;
const confirming = new Set<number>();
const callbacks = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    generation: number;
  }
>();

function send(kind: string, payload?: unknown) {
  if (!disposed)
    parent.postMessage(
      { protocol: preferencesProtocol, channel, instance, kind, payload },
      targetOrigin,
    );
}

function status(message: string, error = false) {
  if (disposed) return;
  let element = document.getElementById('marklyra-preferences-status');
  if (!element) {
    element = document.createElement('div');
    element.id = 'marklyra-preferences-status';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.style.cssText =
      'position:fixed;bottom:0;left:190px;right:0;padding:4px 12px;font:inherit;font-size:12px;background:var(--bg-color);z-index:1000;';
    document.body.append(element);
  }
  element.textContent = message;
  element.style.color = error ? '#c0392b' : 'inherit';
  element.hidden = !message;
}

function progress() {
  if (failed || disposed) return;
  status(
    confirming.size
      ? '正在确认保存结果…'
      : pending
        ? '正在保存…'
        : invalidDraft
          ? `未保存：${invalidDraft}`
          : '',
    !pending && !!invalidDraft,
  );
}

function report(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  status(message.includes('未确认') ? message : `未保存：${message}`, true);
  send('error', message);
}

function request(operation: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  if (!ready || disposed) return Promise.reject(new Error('偏好设置尚未初始化或已关闭。'));
  const id = ++requestId;
  const epoch = generation;
  const markdown =
    operation === 'put' && typeof payload.key === 'string' && isMarkdownPreferenceKey(payload.key);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        if (markdown) {
          // Native may have claimed the CAS before its deadline and still be doing IO.
          // Retain this exact receipt: a timeout cannot prove that nothing was saved.
          if (!disposed && epoch === generation && callbacks.has(id)) {
            confirming.add(id);
            progress();
          }
          return;
        }
        callbacks.delete(id);
        reject(new Error('保存偏好设置超时；未确认保存。'));
      },
      operation === 'startup-action' ||
        (operation === 'file-action' && payload.name === 'clear-recent-history')
        ? 120_000
        : operation === 'put' &&
            (payload.key === 'theme' ||
              payload.key === 'darkTheme' ||
              (typeof payload.key === 'string' && isMarkdownPreferenceKey(payload.key)))
          ? 35_000
          : 15_000,
    );
    callbacks.set(id, { resolve, reject, timer, generation: epoch });
    send('request', { id, operation, ...payload });
  });
}

function fieldKey(element: Element): string | undefined {
  if (element.hasAttribute('data-marklyra-background-save')) return 'enableAutoSave';
  if (element.hasAttribute('data-marklyra-file-remove')) return 'removeCustomFileType';
  if (element.hasAttribute('data-marklyra-file-default')) return 'defaultExtension';
  if (element.hasAttribute('data-marklyra-file-type')) return 'disabledFileTypes';
  if (element instanceof HTMLInputElement && element.name === 'useCustomFontSize')
    return 'useCustomFontSize';
  if (element.matches('.custom-font-input input[type="number"]')) return 'customFontSize';
  // This internal key is guarded by the exact runtime React vendor hash at build time.
  const key = Object.keys(element).find((name) => name.startsWith('__reactInternalInstance$'));
  let fiber = key ? (element as unknown as Record<string, ReactFiber>)[key] : undefined;
  if (element.closest('.export-config')) {
    // The selected tab's fixed identity stays valid when React reuses format
    // controls. A reused control's fiber can still retain the previous group.
    const active = document.querySelector('.export-item.active');
    const activeKey =
      active && Object.keys(active).find((name) => name.startsWith('__reactInternalInstance$'));
    let tabFiber =
      active && activeKey
        ? (active as unknown as Record<string, ReactFiber>)[activeKey]
        : undefined;
    let activeGroup: string | undefined;
    for (let depth = 0; tabFiber && depth < 12; depth++, tabFiber = tabFiber.return)
      if (typeof tabFiber.memoizedProps?.tab === 'string') {
        activeGroup = tabFiber.memoizedProps.tab;
        break;
      }
    let field: string | undefined;
    for (let depth = 0, current = fiber; current && depth < 24; depth++, current = current.return) {
      const props = current.memoizedProps;
      if (!field && typeof props?.keyName === 'string') field = props.keyName;
      if (field === 'pandocPath') return 'pandocPath';
      if (typeof props?.groupId === 'string' && field) {
        // The original paper widget's plain numeric inputs do not carry keyName.
        // Its fixed rows place custom margins before the width/height pair.
        if (field === 'paper' && element instanceof HTMLInputElement && element.type === 'number') {
          const inputs = [
            ...(element.closest('table')?.querySelectorAll('input[type="number"]') ?? []),
          ];
          const index = inputs.indexOf(element);
          field =
            inputs.length === 6 && index >= 0 && index < 4
              ? `paper.margin${['Top', 'Bottom', 'Left', 'Right'][index]}`
              : 'paper.custom';
        }
        return `export.${activeGroup ?? props.groupId}:${field}`;
      }
    }
    // General / after-export controls have no format schema owner and remain disabled.
    return undefined;
  }
  for (let index = 0; fiber && index < 18; index++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (typeof props?.keyName === 'string') return props.keyName;
    if (props && 'customPath' in props && 'validatePath' in props)
      return 'custom_image_save_location';
    if (
      props?.title === 'Default File Type / Extension' &&
      element instanceof HTMLInputElement &&
      element.type === 'text' &&
      typeof originalProperties(element).onBlur === 'function' &&
      typeof originalProperties(element).defaultValue === 'string'
    )
      return 'defaultExtension';
  }
  return undefined;
}

function supported(key: string | undefined): boolean {
  if (key?.startsWith('export.')) {
    if (runtime._options.marklyraExportActions !== true) return false;
    if (isExportPreferenceKey(key)) return true;
    const [group, field] = key.slice(7).split(':');
    return !!group && !!field && exportPreferenceControlSupported(group, field);
  }
  if (key && isMarkdownPreferenceKey(key)) return runtime._options.marklyraMarkdownActions === true;
  return !!key && preferenceKeys.includes(key as (typeof preferenceKeys)[number]);
}

function originalProperties(element: Element): Record<string, unknown> {
  const key = Object.keys(element).find((name) => name.startsWith('__reactEventHandlers$'));
  const props: unknown = key ? Reflect.get(element, key) : undefined;
  return isRecord(props) ? props : {};
}

function themeAction(element: Element): 'open-theme-folder' | 'theme-gallery' | undefined {
  if (runtime._options.marklyraThemeActions !== true) return undefined;
  const key = Object.keys(element).find((name) => name.startsWith('__reactInternalInstance$'));
  let fiber = key ? (element as unknown as Record<string, ReactFiber>)[key] : undefined;
  for (let index = 0; fiber && index < 18; index++, fiber = fiber.return) {
    const label = fiber.memoizedProps?.label;
    if (label === 'Open Theme Folder') return 'open-theme-folder';
    if (label === 'Get Themes') return 'theme-gallery';
  }
  return undefined;
}

function fileAction(element: Element): 'clear-recent-history' | undefined {
  if (runtime._options.marklyraFileActions !== true) return undefined;
  const key = Object.keys(element).find((name) => name.startsWith('__reactInternalInstance$'));
  let fiber = key ? (element as unknown as Record<string, ReactFiber>)[key] : undefined;
  for (let index = 0; fiber && index < 18; index++, fiber = fiber.return) {
    if (fiber.memoizedProps?.label === 'Clear Recent Folders and Files')
      return 'clear-recent-history';
  }
  return undefined;
}

function readingSpeedControl(
  element: Element,
): { value: 120 | 240 | 382 | 'toggle'; menu: HTMLElement } | undefined {
  if (
    runtime._options.marklyraReadingSpeedActions !== true ||
    !element.closest('.pane') ||
    document.querySelector<HTMLElement>('.nav-group-item.active')?.dataset.index !== '5'
  )
    return;
  const reactKey = Object.keys(element).find((name) => name.startsWith('__reactInternalInstance$'));
  let fiber = reactKey ? (element as unknown as Record<string, ReactFiber>)[reactKey] : undefined;
  let matched = false,
    choice: 120 | 240 | 382 | undefined,
    wordCount = false;
  for (let depth = 0; fiber && depth < 24; depth++, fiber = fiber.return) {
    if (fiber.key === '120' || fiber.key === '240' || fiber.key === '382')
      choice = Number(fiber.key) as 120 | 240 | 382;
    const props = fiber.memoizedProps;
    if (props?.title === 'Word Count') wordCount = true;
    const options = props?.options;
    if (
      props?.label === 'Reset to Default' &&
      typeof props.onClick === 'function' &&
      typeof props.onExtra === 'function' &&
      isRecord(options) &&
      Object.keys(options).length === 3 &&
      options['120'] === '120  words/minute (Slow)' &&
      options['240'] === '240  words/minute (Medium)' &&
      options['382'] === '382  words/minute (Fast)'
    )
      matched = true;
  }
  const menu = element.closest('.btn-split-group')?.querySelector<HTMLElement>('ul.dropdown-menu');
  if (!matched || !wordCount || !menu || menu.querySelectorAll('li').length !== 3) return;
  if (element.classList.contains('btn-split-left')) return { value: 382, menu };
  if (element.classList.contains('btn-split-right')) return { value: 'toggle', menu };
  if (element.tagName === 'LI' && choice) return { value: choice, menu };
}

function zoomResetControl(element: Element): boolean {
  if (
    !element.closest('.pane') ||
    element.closest('.btn-split-group') ||
    document.querySelector<HTMLElement>('.nav-group-item.active')?.dataset.index !== '5'
  )
    return false;
  const row = element.closest('tr');
  const selects = row?.querySelectorAll('select');
  if (
    !row?.closest('table.label-input-group') ||
    selects?.length !== 1 ||
    !selects[0] ||
    fieldKey(selects[0]) !== 'zoomFactor'
  )
    return false;
  const key = Object.keys(element).find((name) => name.startsWith('__reactInternalInstance$'));
  let fiber = key ? (element as unknown as Record<string, ReactFiber>)[key] : undefined,
    reset = false,
    zoom = false;
  for (let depth = 0; fiber && depth < 24; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (props?.title === 'Zoom') zoom = true;
    if (props?.label === 'Reset to Default' && typeof props.onClick === 'function') reset = true;
  }
  return reset && zoom;
}

function startupFolderAction(element: Element): boolean {
  return (
    runtime._options.marklyraStartupActions === true &&
    fieldKey(element) === 'pinFolder' &&
    (element.classList.contains('icon-folder') || !!element.querySelector('.icon-folder'))
  );
}

function availabilityHint(element: HTMLElement, message: string | null) {
  if (message) {
    element.title = message;
    element.dataset.marklyraAvailabilityHint = 'true';
  } else if (element.dataset.marklyraAvailabilityHint) {
    const title = originalProperties(element).title;
    if (typeof title === 'string') element.title = title;
    else element.removeAttribute('title');
    delete element.dataset.marklyraAvailabilityHint;
  }
}

function protectControls() {
  if (disposed) return;
  for (const element of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('.pane input,.pane select,.pane textarea')) {
    const key = fieldKey(element);
    if (key) element.dataset.marklyraPreference = key;
    const available =
      supported(key) ||
      (key === 'restoreWhenLaunch' && runtime._options.marklyraStartupActions === true);
    const dependencyBlocked =
      (key !== 'save_file_on_switch' && originalProperties(element).disabled === true) ||
      element.dataset.marklyraLastType === 'true';
    const enabled =
      available &&
      !failed &&
      !closePending &&
      !startupPending &&
      !controlActionPending &&
      !dependencyBlocked;
    element.disabled = !enabled;
    if (
      key === 'save_file_on_switch' &&
      element instanceof HTMLInputElement &&
      !controlActionPending
    )
      element.checked = runtime._options.save_file_on_switch === true;
    if (key === 'pandocPath' && element instanceof HTMLInputElement) {
      element.readOnly = true;
      element.title = '通过右侧选择按钮验证已安装的Pandoc程序；清空可恢复自动探测。';
    }
    availabilityHint(
      element,
      failed
        ? '保存失败，请关闭后重新打开偏好设置。'
        : !available
          ? '此设置暂不支持'
          : dependencyBlocked && key === 'match_pari_markdown'
            ? '请先开启“匹配括号和引号”。'
            : key && isStartupEditorKey(key)
              ? '保存后在新建窗口中生效；当前文档保持原解析和历史。'
              : null,
    );
    if (element instanceof HTMLSelectElement && key === 'image_save_location') {
      for (const option of element.options) {
        option.disabled = !['', 'folder', 'assert', 'per-file-assert', 'custom'].includes(
          option.value,
        );
        if (option.disabled) option.title = '此设置暂不支持';
      }
    }
    if (element instanceof HTMLSelectElement && key?.endsWith(':exportTheme')) {
      for (const option of element.options) {
        option.disabled = !['', 'marklyra-light', 'marklyra-dark'].includes(option.value);
        if (option.disabled) option.title = '指定导出主题暂不支持；可选择当前主题继承已授权样式。';
      }
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>(
    '.pane button,.pane .btn,.pane .icon-button,.pane a,.pane .select-pin-input-group .dir-path,.pane .btn-split-left,.pane .btn-split-right,.pane li',
  )) {
    // Question marks display local help. Their legacy documentation anchors
    // are informational, while the capture-phase link guard still blocks clicks.
    if (element.matches('.label-hint > a')) {
      element.removeAttribute('href');
      element.removeAttribute('target');
      element.removeAttribute('aria-disabled');
      availabilityHint(element, null);
      continue;
    }
    // Export format rows only navigate the original page. Their nested command,
    // rename and add controls are still guarded separately below.
    if (element.matches('.export-items-list > li') && element.querySelector('.export-item')) {
      element.removeAttribute('aria-disabled');
      availabilityHint(element, null);
      continue;
    }
    const key = fieldKey(element);
    const action = themeAction(element);
    const clear = fileAction(element);
    const zoom = zoomResetControl(element);
    if (zoom) element.dataset.marklyraZoomReset = 'true';
    else delete element.dataset.marklyraZoomReset;
    const reading = readingSpeedControl(element);
    if (reading) element.dataset.marklyraReadingSpeed = String(reading.value);
    else delete element.dataset.marklyraReadingSpeed;
    const startup = startupFolderAction(element);
    const pandoc =
      runtime._options.marklyraExportActions === true &&
      key === 'pandocPath' &&
      (element.classList.contains('icon-folder') || !!element.querySelector('.icon-folder'));
    if (pandoc) element.dataset.marklyraPandocAction = 'choose';
    else delete element.dataset.marklyraPandocAction;
    if (startup) element.dataset.marklyraStartupAction = 'choose-folder';
    else delete element.dataset.marklyraStartupAction;
    if (key === 'pinFolder' && element.classList.contains('dir-path')) {
      element.setAttribute('aria-readonly', 'true');
      element.setAttribute('aria-disabled', 'true');
      availabilityHint(element, null);
      continue;
    }
    if (action) element.dataset.marklyraThemeAction = action;
    else delete element.dataset.marklyraThemeAction;
    if (clear) element.dataset.marklyraFileAction = clear;
    else delete element.dataset.marklyraFileAction;
    // Resetting the two supported numeric/path controls is local, unlike folder selection.
    const enabled =
      !failed &&
      !closePending &&
      !startupPending &&
      !controlActionPending &&
      (!clear || !fileActionPending) &&
      originalProperties(element).disabled !== true &&
      (zoom ||
        !!reading ||
        !!action ||
        !!clear ||
        startup ||
        pandoc ||
        (supported(key) &&
          !element.classList.contains('icon-folder') &&
          !element.querySelector('.icon-folder') &&
          element.tagName !== 'A'));
    if (!enabled) {
      element.setAttribute('aria-disabled', 'true');
      availabilityHint(
        element,
        failed
          ? '保存失败，请关闭后重新打开偏好设置。'
          : (!supported(key) && !action && !clear && !startup && !reading && !zoom) ||
              element.tagName === 'A' ||
              (!startup &&
                !pandoc &&
                (element.classList.contains('icon-folder') ||
                  element.querySelector('.icon-folder')))
            ? '此操作暂不支持'
            : null,
      );
      if (element instanceof HTMLButtonElement) element.disabled = true;
    } else {
      element.removeAttribute('aria-disabled');
      availabilityHint(element, null);
      if (element instanceof HTMLButtonElement) element.disabled = false;
    }
  }
}

function restoreConfirmedView(component?: RuntimeComponent) {
  const selected = document.querySelector<HTMLElement>('.nav-group-item.active')?.dataset.index;
  if (typeof runtime.forceReload === 'function') {
    // The original font control retains its own hook draft even after parent props roll back.
    // A new React key remounts only this isolated preferences UI from confirmed host values.
    runtime._options = {
      ...runtime._options,
      key: `recovery-confirmed-${generation}-${++confirmedRender}`,
    };
    runtime.forceReload();
    if (selected && /^[0-6]$/.test(selected))
      document.querySelector<HTMLElement>(`.nav-group-item[data-index="${selected}"]`)?.click();
  } else component?.setState({ ...runtime._options });
  protectControls();
}

function changeStartup(action: StartupPreferenceAction) {
  if (
    disposed ||
    failed ||
    closePending ||
    startupPending ||
    runtime._options.marklyraStartupActions !== true
  )
    return;
  if (typeof runtime.forceReload !== 'function') {
    report(new Error('当前偏好资源缺少已确认状态刷新能力。'));
    return;
  }
  startupPending = true;
  const epoch = generation;
  pending++;
  protectControls();
  progress();
  sequence = sequence
    .then(async () => {
      if (disposed || failed || epoch !== generation) return;
      try {
        const value = await request('startup-action', { action });
        if (disposed || epoch !== generation) return;
        if (value !== null) {
          const snapshot = startupPreferencesSnapshot(value);
          runtime._options.restoreWhenLaunch = snapshot.restoreWhenLaunch;
          runtime._options.pinFolder = snapshot.pinFolder;
        }
        restoreConfirmedView();
      } catch (error) {
        if (disposed || epoch !== generation) return;
        failed = true;
        generation++;
        restoreConfirmedView();
        report(error);
      }
    })
    .finally(() => {
      startupPending = false;
      pending--;
      protectControls();
      progress();
    });
}

function changePreference(component: RuntimeComponent | undefined, key: unknown, value: unknown) {
  if (disposed || closePending) return;
  if (failed || typeof key !== 'string' || !supported(key)) {
    report(new Error('此设置暂不支持，不能保存。'));
    return;
  }
  if (key === 'export.image') value = originalImageExportValue(value);
  // Preserve controlled-input drafts during fast typing; committed state advances only on host ACK.
  component?.setState({ [key]: value });
  queueMicrotask(protectControls);
  let change: PreferenceChange;
  try {
    change = preferenceChange(key, value, preferenceThemeFiles(runtime._options.allThemes));
  } catch (error) {
    invalidDraft = error instanceof Error ? error.message : String(error);
    status(`未保存：${invalidDraft}`, true);
    return;
  }
  invalidDraft = null;
  const managedControl =
    (runtime._options.marklyraFileTypeActions === true &&
      (change.key === 'disabledFileTypes' ||
        change.key === 'defaultExtension' ||
        change.key === 'removeCustomFileType')) ||
    (runtime._options.marklyraFileActions === true &&
      (change.key === 'save_file_on_switch' || change.key === 'enableAutoSave'));
  const focus = managedControl ? document.activeElement : null;
  const row =
    change.key === 'removeCustomFileType' ? focus?.closest('.settings-file-type-row') : null;
  const nextFocus =
    row?.nextElementSibling?.querySelector('input') ||
    row?.previousElementSibling?.querySelector('input') ||
    document.querySelector('.settings-default-type select');
  const epoch = generation;
  pending++;
  if (!component) controlActionPending = true;
  protectControls();
  progress();
  sequence = sequence
    .then(async () => {
      if (disposed || failed || epoch !== generation) return;
      try {
        const saved = await request('put', change);
        if (disposed || epoch !== generation) return;
        if (saved !== undefined)
          Object.assign(runtime._options, filePreferencesOptions(filePreferencesSnapshot(saved)));
        else runtime._options[change.key] = change.value;
        if (change.key === 'wordsPerMinute') runtime._options.customWordsPerMinute = true;
        if (change.key === 'customWordsPerMinute' && change.value === false)
          runtime._options.wordsPerMinute = 382;
        if (!component && !managedControl) restoreConfirmedView();
        updateSettingsPage?.();
      } catch (error) {
        if (disposed || epoch !== generation) return;
        failed = true;
        generation++;
        restoreConfirmedView(component);
        report(error);
      }
    })
    .finally(() => {
      pending--;
      if (!component) controlActionPending = false;
      protectControls();
      const restoreFocus = focus?.isConnected ? focus : nextFocus;
      if (
        managedControl &&
        !failed &&
        restoreFocus instanceof HTMLElement &&
        restoreFocus.isConnected &&
        restoreFocus.getClientRects().length > 0 &&
        document.activeElement === document.body
      )
        restoreFocus.focus({ preventScroll: true });
      progress();
    });
}
runtime.__MARKLYRA_SETTINGS_CHANGE__ = (component, key, value) =>
  changePreference(component, key, value);
function closePreferences() {
  if (closePending || disposed) return;
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
  if (invalidDraft) {
    report(new Error(`请先修正设置：${invalidDraft}`));
    if (active instanceof HTMLElement) active.focus();
    return;
  }
  closePending = true;
  protectControls();
  void sequence
    .then(() => request('close'))
    .catch(report)
    .finally(() => {
      closePending = false;
      protectControls();
    });
}

// The original bridge is not a transport for arbitrary host code or filesystem access.
runtime.__MARKLYRA_SETTINGS_BRIDGE__ = {
  postMessage(message) {
    if (!isRecord(message)) return;
    report(new Error('此原生偏好设置操作暂不支持。'));
  },
};

let setting: PreferencesWindow['Setting'];
Object.defineProperty(runtime, 'Setting', {
  configurable: true,
  get: () => setting,
  set: (value: unknown) => {
    if (!isRecord(value) || typeof value.close !== 'function')
      throw new Error('原偏好设置关闭接口无效。');
    value.close = closePreferences;
    setting = value as unknown as NonNullable<PreferencesWindow['Setting']>;
  },
});

function loadScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`偏好设置资源加载失败：${source}`));
    document.body.append(script);
  });
}

async function initialize(options: Record<string, unknown>, presentation?: unknown) {
  runtime._options = initialPreferencesOptions(options);
  if (document.readyState === 'loading')
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
    );
  const updatePage = setupSettingsPage(closePreferences, {
    state: () => runtime._options,
    change: (disabled) => changePreference(undefined, 'disabledFileTypes', disabled),
    defaultExtension: (extension) => changePreference(undefined, 'defaultExtension', extension),
    remove: (extension) => changePreference(undefined, 'removeCustomFileType', extension),
    save: (key, enabled) => changePreference(undefined, key, enabled),
  });
  updateSettingsPage = updatePage;
  presentSettingsPage(presentation);
  // Own this checkbox before React's legacy click-to-change plugin can restore
  // the macOS/system-forced checked prop. Keep the native toggle's default action.
  document.addEventListener(
    'click',
    (event) => {
      const element = event.target;
      if (!(element instanceof HTMLInputElement) || fieldKey(element) !== 'save_file_on_switch')
        return;
      event.stopImmediatePropagation();
      if (!element.disabled) changePreference(undefined, 'save_file_on_switch', element.checked);
    },
    true,
  );
  document.addEventListener(
    'change',
    (event) => {
      const element = event.target;
      if (element instanceof HTMLInputElement && fieldKey(element) === 'save_file_on_switch') {
        event.stopImmediatePropagation();
        return;
      }
      if (!(element instanceof HTMLSelectElement) || fieldKey(element) !== 'restoreWhenLaunch')
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof originalProperties(element).onChange !== 'function') return;
      try {
        changeStartup({ kind: 'set-mode', mode: startupControlMode(element.value) });
      } catch (error) {
        restoreConfirmedView();
        report(error);
      }
    },
    true,
  );
  document.addEventListener(
    'mousedown',
    (event) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('li[data-marklyra-reading-speed]')
          : null;
      if (!element) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const control = readingSpeedControl(element);
      if (
        !failed &&
        control &&
        control.value !== 'toggle' &&
        element.getAttribute('aria-disabled') !== 'true'
      ) {
        control.menu.classList.remove('shown');
        changePreference(undefined, 'wordsPerMinute', control.value);
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      const pandoc =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-pandoc-action]')
          : null;
      if (pandoc) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!failed && !controlActionPending && pandoc.getAttribute('aria-disabled') !== 'true') {
          controlActionPending = true;
          pending++;
          protectControls();
          progress();
          const epoch = generation;
          sequence = sequence
            .then(async () => {
              if (disposed || failed || epoch !== generation) return;
              const result = await request('export-tool-action', { name: 'choose-pandoc' });
              if (disposed || epoch !== generation) return;
              if (result !== null) {
                if (!isRecord(result) || typeof result.pandocPath !== 'string')
                  throw new Error('Pandoc选择回执无效。');
                runtime._options.pandocPath = result.pandocPath;
                restoreConfirmedView();
              }
            })
            .catch(report)
            .finally(() => {
              controlActionPending = false;
              pending--;
              protectControls();
              progress();
            });
        }
        return;
      }
      const zoomElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-zoom-reset]')
          : null;
      if (zoomElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          !failed &&
          zoomResetControl(zoomElement) &&
          zoomElement.getAttribute('aria-disabled') !== 'true'
        )
          changePreference(undefined, 'zoomFactor', 1);
        return;
      }
      const readingElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-reading-speed]')
          : null;
      if (readingElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const control = readingSpeedControl(readingElement);
        if (!failed && control && readingElement.getAttribute('aria-disabled') !== 'true') {
          if (control.value === 'toggle') {
            readingElement.focus();
            control.menu.classList.toggle('shown');
          } else if (readingElement.tagName !== 'LI')
            changePreference(undefined, 'wordsPerMinute', control.value);
        }
        return;
      }
      const startup =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-startup-action="choose-folder"]')
          : null;
      if (startup) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (startup.getAttribute('aria-disabled') !== 'true')
          changeStartup({ kind: 'choose-folder' });
        return;
      }
      const clear =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-file-action]')
          : null;
      if (clear) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!failed && !fileActionPending && clear.getAttribute('aria-disabled') !== 'true') {
          fileActionPending = true;
          protectControls();
          sequence = sequence
            .then(() => {
              if (!failed)
                return request('file-action', { name: clear.dataset.marklyraFileAction });
            })
            .catch(report)
            .finally(() => {
              fileActionPending = false;
              protectControls();
            });
        }
        return;
      }
      const action =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-marklyra-theme-action]')
          : null;
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!failed && action.getAttribute('aria-disabled') !== 'true')
          void sequence
            .then(() => request('theme-action', { name: action.dataset.marklyraThemeAction }))
            .catch(report);
        return;
      }
      const target =
        event.target instanceof Element ? event.target.closest('[aria-disabled="true"],a') : null;
      if (target) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const readingMenu = document.querySelector<HTMLElement>(
        '[data-marklyra-reading-speed="toggle"] ~ ul.dropdown-menu.shown',
      );
      if (readingMenu) readingMenu.classList.remove('shown');
      else closePreferences();
    },
    true,
  );
  document.addEventListener('submit', (event) => event.preventDefault(), true);
  await loadScript('./static/js/0.99879679.chunk.js');
  await loadScript('./static/js/Preferences.962926a4.d7f6a912.chunk.js');
  if (!runtime.Setting) throw new Error('原偏好设置未初始化。');
  runtime.Setting.close = closePreferences;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      protectControls();
      updatePage?.();
      if (document.querySelector('.nav-group-item')) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    if (document.querySelector('.nav-group-item')) {
      observer.disconnect();
      resolve();
    }
  });
  // Original panels stay mounted: navigation/search can change only nav classes.
  // Observe the completed React commit rather than a capture-phase microtask.
  new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === 'childList' ||
          (record.target instanceof Element && record.target.matches('.nav-group-item')),
      )
    ) {
      protectControls();
      updatePage?.();
    }
  }).observe(document.getElementById('root') ?? document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  protectControls();
  updatePage?.();
  if (disposed) return;
  ready = true;
  send('initialized');
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (
    disposed ||
    event.source !== parent ||
    (expectedParentOrigin &&
      expectedParentOrigin !== 'null' &&
      event.origin !== expectedParentOrigin) ||
    !isRecord(event.data) ||
    event.data.protocol !== preferencesProtocol ||
    event.data.channel !== channel ||
    event.data.instance !== instance
  )
    return;
  const { kind, payload } = event.data;
  if (kind === 'waiting' && !initialized) {
    status('正在确认之前的保存结果…');
  } else if (
    kind === 'initialize' &&
    !initialized &&
    isRecord(payload) &&
    isRecord(payload.options)
  ) {
    initialized = true;
    status('');
    void initialize(payload.options, payload.presentation).catch(report);
  } else if (kind === 'presentation') {
    presentSettingsPage(payload);
  } else if (kind === 'close-request' && ready) {
    closePreferences();
  } else if (kind === 'reply' && isRecord(payload) && typeof payload.id === 'number') {
    const callback = callbacks.get(payload.id);
    if (!callback) return;
    callbacks.delete(payload.id);
    clearTimeout(callback.timer);
    confirming.delete(payload.id);
    if (callback.generation !== generation) {
      callback.reject(new Error('偏好设置回执已过期。'));
      return;
    }
    if (payload.ok === true) callback.resolve(payload.result);
    else
      callback.reject(
        new Error(typeof payload.error === 'string' ? payload.error : '偏好设置未保存。'),
      );
    progress();
  }
});
window.addEventListener('pagehide', () => {
  disposed = true;
  ready = false;
  generation++;
  for (const callback of callbacks.values()) {
    clearTimeout(callback.timer);
    callback.reject(new Error('偏好设置页面已关闭，保存结果尚未确认。'));
  }
  callbacks.clear();
  confirming.clear();
});
window.addEventListener('error', (event) =>
  report(new Error(event.message || '偏好设置页面发生错误。')),
);
if (channel && expectedParentOrigin) send('ready');
