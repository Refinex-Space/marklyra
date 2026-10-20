import { useId, useMemo } from 'react';
import type { ExportPaperSize, PdfExportPreferences } from '../preferences.js';
import { DEFAULT_MARGIN_MM, paperLabels, paperOrder } from './catalog.js';
import {
  Card,
  Notice,
  NumberField,
  Row,
  Segmented,
  Select,
  Switch,
  TextField,
} from './controls.js';
import { HeaderFooterEditor } from './HeaderFooterEditor.js';
import { PagePreview } from './PagePreview.js';
import { ExtraCss, ThemeRow } from './parts.js';
import { pdfPreview } from './pdfLayout.js';
import type { ExportSettingsModel } from './useExportSettings.js';

type TextKey = 'headerLeft' | 'header' | 'headerRight' | 'footerLeft' | 'footer' | 'footerRight';
const margins = [
  { key: 'paper.marginTop', label: '上边距' },
  { key: 'paper.marginBottom', label: '下边距' },
  { key: 'paper.marginLeft', label: '左边距' },
  { key: 'paper.marginRight', label: '右边距' },
] as const;

export function PdfPage({ model }: { model: ExportSettingsModel }) {
  const view = model.view;
  const capabilities = model.capabilities;
  const paperId = useId();
  const authorId = useId();
  const marginId = useId();
  const pdf = view?.pdf ?? {};
  const bands = capabilities?.headerFooter === true;
  const preview = useMemo(() => pdfPreview(pdf, bands), [pdf, bands]);
  const sample = useMemo(
    () => ({
      title: '示例文稿',
      author: pdf.author || '作者',
      pageNo: 1,
      totalPages: 8,
      today: new Date().toLocaleDateString(),
    }),
    [pdf.author],
  );
  if (!view) return null;
  const edit = (change: (current: PdfExportPreferences) => PdfExportPreferences) =>
    model.update('export.pdf', change);
  const paper = pdf.paper ?? '';
  const customMargins = pdf['paper.margin'] === 'custom';
  const [customWidth, customHeight] = pdf['paper.custom'] ?? [210, 297];
  const setText = (field: TextKey | 'author', value: string) =>
    edit((current) => {
      const next = { ...current };
      if (value === '') delete next[field];
      else next[field] = value;
      return next;
    });
  if (capabilities?.pdf === 'none')
    return <Notice kind="warning">当前平台暂不支持导出 PDF。</Notice>;
  const mac = capabilities?.pdf === 'dialog';
  return (
    <>
      <Card title="页面">
        <div className="es-page-card">
          <div className="es-page-controls">
            <Row label="纸张大小" htmlFor={paperId}>
              <Select
                id={paperId}
                label="纸张大小"
                value={paper}
                options={paperOrder.map((value) => ({
                  value,
                  label:
                    value === ''
                      ? mac
                        ? '跟随系统'
                        : '默认（A4 · 210 × 297 毫米）'
                      : paperLabels[value],
                }))}
                onChange={(value: ExportPaperSize) =>
                  edit((current) => ({
                    ...current,
                    paper: value,
                  }))
                }
              />
            </Row>
            {paper === 'custom' && (
              <Row label="自定义尺寸" hint="宽 × 高，10 到 2000 毫米。">
                <span className="es-pair">
                  <NumberField
                    label="纸张宽度"
                    unit="毫米"
                    min={10}
                    max={2000}
                    value={customWidth}
                    onCommit={(value) =>
                      edit((current) => ({ ...current, 'paper.custom': [value, customHeight] }))
                    }
                  />
                  <span aria-hidden="true">×</span>
                  <NumberField
                    label="纸张高度"
                    unit="毫米"
                    min={10}
                    max={2000}
                    value={customHeight}
                    onCommit={(value) =>
                      edit((current) => ({ ...current, 'paper.custom': [customWidth, value] }))
                    }
                  />
                </span>
              </Row>
            )}
            <Row label="方向">
              <Segmented
                label="纸张方向"
                value={pdf.landscape ? 'landscape' : 'portrait'}
                options={[
                  { value: 'portrait', label: '纵向' },
                  { value: 'landscape', label: '横向' },
                ]}
                onChange={(value) =>
                  edit((current) => ({ ...current, landscape: value === 'landscape' }))
                }
              />
            </Row>
            <Row label="页边距" hint={`标准为 ${DEFAULT_MARGIN_MM} 毫米`}>
              <Segmented
                label="页边距"
                value={customMargins ? 'custom' : ''}
                options={[
                  { value: '', label: '标准' },
                  { value: 'custom', label: '自定义' },
                ]}
                onChange={(value) => edit((current) => ({ ...current, 'paper.margin': value }))}
              />
            </Row>
            {customMargins && (
              <div className="es-margins">
                {margins.map((entry) => (
                  <label key={entry.key} htmlFor={`${marginId}-${entry.key}`}>
                    <span>{entry.label}</span>
                    <NumberField
                      id={`${marginId}-${entry.key}`}
                      label={entry.label}
                      unit="毫米"
                      min={0}
                      max={500}
                      step={0.5}
                      value={pdf[entry.key] ?? DEFAULT_MARGIN_MM}
                      onCommit={(value) => edit((current) => ({ ...current, [entry.key]: value }))}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
          <PagePreview
            model={preview}
            sample={sample}
            orientation={pdf.landscape ? '横向' : '纵向'}
          />
        </div>
      </Card>
      <Card title="内容">
        <ThemeRow
          value={pdf.exportTheme}
          onChange={(value) => edit((current) => ({ ...current, exportTheme: value }))}
        />
        <Row label="按一级标题分页" hint="每个一级标题另起一页。">
          <Switch
            label="按一级标题分页"
            checked={pdf.splitPages === true}
            onChange={(value) => edit((current) => ({ ...current, splitPages: value }))}
          />
        </Row>
        {bands && (
          <>
            <Row label="生成书签" hint="在 PDF 阅读器的侧栏显示标题目录。">
              <Switch
                label="生成书签"
                checked={pdf.bookmarks !== false}
                onChange={(value) => edit((current) => ({ ...current, bookmarks: value }))}
              />
            </Row>
            <Row label="打印背景色" hint="保留主题背景与代码块底色；使用深色主题时需要开启。">
              <Switch
                label="打印背景色"
                checked={pdf.background !== false}
                onChange={(value) => edit((current) => ({ ...current, background: value }))}
              />
            </Row>
          </>
        )}
      </Card>
      {bands ? (
        <Card
          title="页眉与页脚"
          description={`每个区域是一行文字，可以包含变量；页眉或页脚需要至少 12 毫米的边距，不足时导出会自动加宽。`}
        >
          <HeaderFooterEditor pdf={pdf} onChange={setText} />
          <Row label="作者" htmlFor={authorId} hint="用于变量 ${author}。">
            <TextField
              id={authorId}
              label="作者"
              value={pdf.author ?? ''}
              maxLength={100}
              placeholder="未设置"
              onCommit={(value) => setText('author', value)}
            />
          </Row>
        </Card>
      ) : (
        mac && (
          <Notice kind="info" live="status">
            macOS 通过系统打印面板导出 PDF：在面板中选择“存储为
            PDF”。页眉页脚请使用面板的“打印页眉和页脚”选项设置。
          </Notice>
        )
      )}
      <ExtraCss
        scope=" PDF 内容"
        value={pdf.extraCss ?? ''}
        onCommit={(value) =>
          edit((current) => {
            const next = { ...current };
            if (value === '') delete next.extraCss;
            else next.extraCss = value;
            return next;
          })
        }
      />
    </>
  );
}
