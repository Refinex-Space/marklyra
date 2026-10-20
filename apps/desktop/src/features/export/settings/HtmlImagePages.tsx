import { useId } from 'react';
import type { ImageExportPreferences } from '../preferences.js';
import { MAX_IMAGE_HEIGHT, MAX_IMAGE_PIXELS } from './catalog.js';
import { Card, Notice, NumberField, Row, Segmented, Select } from './controls.js';
import { ExtraCss, ThemeRow } from './parts.js';
import type { ExportSettingsModel } from './useExportSettings.js';

export function HtmlPage({ model }: { model: ExportSettingsModel }) {
  const html = model.view?.html;
  if (!html) return null;
  return (
    <>
      <Card
        title="样式"
        description="导出为一个独立的 HTML 文件：样式、字体、图片、公式与图表都内嵌在文件里，离线也能完整显示。"
      >
        <ThemeRow
          value={html.exportTheme}
          onChange={(value) =>
            model.update('export.html', (current) => ({ ...current, exportTheme: value }))
          }
        />
      </Card>
      <ExtraCss
        scope=" HTML 页面"
        value={html.extraCss ?? ''}
        onCommit={(value) =>
          model.update('export.html', (current) => {
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

export function PlainHtmlPage() {
  return (
    <Card title="HTML（无样式）">
      <Notice kind="info">
        导出不含任何样式的纯净
        HTML：只保留标题、段落、列表、表格、代码与图片等语义标签，适合粘贴到内容管理系统或邮件。
        <br />
        这一格式没有可调选项；图片与公式的输出方式见“Markdown”设置。
      </Notice>
    </Card>
  );
}

const qualities = [
  { value: '0', label: '自动（1×）', scale: 1 },
  { value: '1', label: '中（1×）', scale: 1 },
  { value: '2', label: '高（2×）', scale: 2 },
  { value: '3', label: '最佳（3×）', scale: 3 },
] as const;

export function ImagePage({ model }: { model: ExportSettingsModel }) {
  const image = model.view?.image;
  const widthId = useId();
  const qualityId = useId();
  if (!image) return null;
  if (model.capabilities && !model.capabilities.image)
    return <Notice kind="warning">当前平台暂不支持导出图像。</Notice>;
  const edit = (change: (current: ImageExportPreferences) => ImageExportPreferences) =>
    model.update('export.image', change);
  const width = image.imageWidth ?? 640;
  const quality = qualities[image.quality ?? 0] ?? qualities[0];
  const themeFont = image.useThemeFontSize === 1;
  return (
    <>
      <Card
        title="尺寸"
        description="导出整篇文稿为一张 PNG 或 JPEG 图片，格式由保存时选择的扩展名决定。"
      >
        <Row label="宽度" htmlFor={widthId} hint="64 到 4096 像素。">
          <NumberField
            id={widthId}
            label="图片宽度"
            unit="像素"
            integer
            min={64}
            max={4096}
            value={width}
            onCommit={(value) => edit((current) => ({ ...current, imageWidth: value }))}
          />
        </Row>
        <Row label="图片质量" htmlFor={qualityId} hint={`输出宽度 ${width * quality.scale} 像素。`}>
          <Select
            id={qualityId}
            label="图片质量"
            value={String(image.quality ?? 0)}
            options={qualities.map(({ value, label }) => ({ value, label }))}
            onChange={(value) => edit((current) => ({ ...current, quality: Number(value) }))}
          />
        </Row>
        <p className="es-note">
          整张图片高度不能超过 {MAX_IMAGE_HEIGHT.toLocaleString()} 像素，总像素不能超过{' '}
          {(MAX_IMAGE_PIXELS / 1_048_576).toFixed(0)} Mi；超出时导出会提示失败，而不是裁切内容。
        </p>
      </Card>
      <Card title="文字与外观">
        <Row label="字号">
          <Segmented
            label="字号来源"
            value={themeFont ? 'theme' : 'custom'}
            options={[
              { value: 'custom', label: '自定义字号' },
              { value: 'theme', label: '使用主题字号' },
            ]}
            onChange={(value) =>
              edit((current) => ({ ...current, useThemeFontSize: value === 'theme' ? 1 : 0 }))
            }
          />
        </Row>
        {!themeFont && (
          <Row label="自定义字号" hint="6 到 128 像素。">
            <NumberField
              label="自定义字号"
              unit="像素"
              integer
              min={6}
              max={128}
              value={image.imageFontSize ?? 24}
              onCommit={(value) => edit((current) => ({ ...current, imageFontSize: value }))}
            />
          </Row>
        )}
        <ThemeRow
          value={image.exportTheme}
          onChange={(value) => edit((current) => ({ ...current, exportTheme: value }))}
        />
      </Card>
      <ExtraCss
        scope="图片内容"
        value={image.extraCss ?? ''}
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
