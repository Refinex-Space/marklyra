import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { isPandocPage, pandocFormat, pandocFormats, type SettingsPage } from './catalog.js';
import { Button, Notice } from './controls.js';
import { GeneralPage } from './GeneralPage.js';
import { HtmlPage, ImagePage, PlainHtmlPage } from './HtmlImagePages.js';
import { CustomPage, NewCustomPage, PandocFormatPage } from './PandocPages.js';
import { PdfPage } from './PdfPage.js';
import { useExportSettings } from './useExportSettings.js';
import './export-settings.css';

const STORAGE_KEY = 'marklyra.settings.export.page';
const fixed: readonly SettingsPage[] = ['general', 'pdf', 'html', 'html-plain', 'image'];

function remembered(): SettingsPage {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (value && ([...fixed, ...pandocFormats.map((item) => item.key)] as string[]).includes(value))
      return value as SettingsPage;
  } catch {
    /* Selection simply starts at 通用 when storage is blocked. */
  }
  return 'general';
}

const titles: Record<string, string> = {
  general: '通用',
  pdf: 'PDF',
  html: 'HTML',
  'html-plain': 'HTML（无样式）',
  image: '图像',
  new: '新建自定义导出',
};

/** The 导出 settings page: every control here changes what an export actually does. */
export function ExportSettings({ dark }: { dark: boolean }) {
  const model = useExportSettings();
  const [page, setPageState] = useState<SettingsPage>(remembered);
  const tabs = useRef(new Map<string, HTMLButtonElement>());
  const setPage = (next: SettingsPage) => {
    setPageState(next);
    try {
      if (!next.startsWith('custom:') && next !== 'new') sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Remembering the page is a convenience only. */
    }
  };
  const view = model.view;
  const custom = view?.custom ?? [];
  const items: { page: SettingsPage; label: string; group: number }[] = [
    { page: 'general', label: titles.general ?? '', group: 0 },
    ...(['pdf', 'html', 'html-plain', 'image'] as const).map((value) => ({
      page: value,
      label: titles[value] ?? '',
      group: 1,
    })),
    ...pandocFormats.map((info) => ({ page: info.key, label: info.title, group: 2 })),
    ...custom.map((entry) => ({
      page: `custom:${entry.id}` as SettingsPage,
      label: entry.name,
      group: 3,
    })),
    { page: 'new' as SettingsPage, label: '+ 自定义导出', group: 4 },
  ];
  const customItem = page.startsWith('custom:')
    ? custom.findIndex((entry) => entry.id === page.slice(7))
    : -1;
  // A custom export removed elsewhere leaves nothing to show; fall back to the overview.
  useEffect(() => {
    if (view && page.startsWith('custom:') && customItem < 0) setPageState('general');
  }, [view, page, customItem]);

  const choose = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = items[(target + items.length) % items.length];
    if (!next) return;
    setPage(next.page);
    tabs.current.get(next.page)?.focus();
  };

  const body = () => {
    if (!view) return null;
    const general = () => setPage('general');
    if (page === 'general') return <GeneralPage model={model} />;
    if (page === 'pdf') return <PdfPage model={model} />;
    if (page === 'html') return <HtmlPage model={model} />;
    if (page === 'html-plain') return <PlainHtmlPage />;
    if (page === 'image') return <ImagePage model={model} />;
    if (page === 'new')
      return (
        <NewCustomPage
          model={model}
          onGeneral={general}
          onCreated={(id) => setPage(`custom:${id}`)}
        />
      );
    if (page.startsWith('custom:')) {
      const entry = custom[customItem];
      return entry ? (
        <CustomPage
          model={model}
          item={entry}
          index={customItem}
          count={custom.length}
          onGeneral={general}
          onSelect={(id) => setPage(id ? `custom:${id}` : 'general')}
        />
      ) : null;
    }
    return isPandocPage(page) ? (
      <PandocFormatPage model={model} format={page} onGeneral={general} />
    ) : null;
  };
  const heading =
    page.startsWith('custom:') && custom[customItem]
      ? custom[customItem].name
      : (titles[page] ?? pandocFormat(page)?.title ?? '');

  return (
    <section className="es" aria-label="导出设置" data-dark={dark}>
      <div className="es-scroll">
        <div className="es-content">
          <header className="es-heading">
            <div>
              <h1>导出</h1>
              <p>输出格式与文档样式</p>
            </div>
            <span
              className={`es-status es-status-${model.status}`}
              role="status"
              aria-live="polite"
            >
              {model.status === 'saving' ? '正在保存…' : model.status === 'saved' ? '已保存' : ''}
            </span>
          </header>
          {model.loadError && (
            <Notice
              kind="error"
              actions={<Button onClick={() => void model.reload()}>重试</Button>}
            >
              无法读取导出设置：{model.loadError}
            </Notice>
          )}
          {model.error && (
            <Notice
              kind="error"
              actions={
                <>
                  <Button onClick={() => void model.retry()}>重试</Button>
                  <Button onClick={() => void model.discard()}>放弃修改</Button>
                </>
              }
            >
              {model.error}
            </Notice>
          )}
          {!view && !model.loadError && (
            <p className="es-muted" role="status">
              正在读取导出设置…
            </p>
          )}
          {view && (
            <div className="es-layout">
              <div
                className="es-nav"
                role="tablist"
                aria-label="导出格式"
                aria-orientation="vertical"
              >
                {items.map((item, index) => (
                  <div key={item.page} className="es-nav-slot" role="presentation">
                    {index > 0 && items[index - 1]?.group !== item.group && (
                      <div className="es-nav-rule" />
                    )}
                    <button
                      type="button"
                      role="tab"
                      id={`es-tab-${item.page}`}
                      aria-selected={page === item.page}
                      aria-controls="es-panel"
                      tabIndex={page === item.page ? 0 : -1}
                      className={`es-tab${item.page === 'new' ? ' es-tab-add' : ''}`}
                      ref={(element) => {
                        if (element) tabs.current.set(item.page, element);
                        else tabs.current.delete(item.page);
                      }}
                      onClick={() => setPage(item.page)}
                      onKeyDown={(event) => choose(event, index)}
                    >
                      {item.label}
                    </button>
                  </div>
                ))}
              </div>
              <div
                className="es-panel"
                role="tabpanel"
                id="es-panel"
                aria-labelledby={`es-tab-${page}`}
              >
                <h2 className="es-page-title">{heading}</h2>
                {body()}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
