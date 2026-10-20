import { Button, Card, Notice, Row, Segmented, Switch } from './controls.js';
import { ExternalLink, PANDOC_INSTALL } from './parts.js';
import type { ExportSettingsModel } from './useExportSettings.js';

function Pandoc({ model }: { model: ExportSettingsModel }) {
  const view = model.view;
  const pandoc = model.capabilities?.pandoc;
  const manual = !!view?.pandocPath;
  const buttons = (
    <>
      <Button onClick={() => void model.choosePandoc()}>选择程序…</Button>
      <Button onClick={() => void model.refreshCapabilities()}>重新检测</Button>
      {manual && <Button onClick={() => model.update('pandocPath', () => '')}>恢复自动检测</Button>}
    </>
  );
  return (
    <Card
      title="Pandoc"
      description="Word、OpenOffice、RTF、EPUB、LaTeX 等格式由 Pandoc 转换；PDF、HTML 和图像不需要它。"
    >
      {model.capabilityError && (
        <Notice kind="error">无法检查 Pandoc：{model.capabilityError}</Notice>
      )}
      {!pandoc && !model.capabilityError && (
        <p className="es-muted" role="status">
          正在检查 Pandoc…
        </p>
      )}
      {pandoc && (
        <>
          <div className={`es-row es-tool es-tool-${pandoc.status}`}>
            <div className="es-row-label">
              <span className="es-tool-title">
                <span className="es-tool-dot" aria-hidden="true" />
                {pandoc.status === 'available'
                  ? `已就绪 · Pandoc ${pandoc.version ?? ''}`
                  : pandoc.status === 'missing'
                    ? '未找到 Pandoc'
                    : 'Pandoc 无法使用'}
              </span>
              {pandoc.status === 'missing' ? (
                <p>
                  先 <ExternalLink href={PANDOC_INSTALL}>安装 Pandoc</ExternalLink>
                  ，再点“重新检测”；会在 PATH 与常见安装位置查找，也可以手动选择程序。
                </p>
              ) : pandoc.status === 'invalid' ? (
                <p>{pandoc.message}</p>
              ) : (
                <p>{manual ? '使用手动指定的程序。' : '自动检测到已安装的程序。'}</p>
              )}
            </div>
            <div className="es-row-control es-tool-actions">{buttons}</div>
          </div>
          {pandoc.path && (
            <div className="es-tool-path">
              <span>程序位置</span>
              <code className="es-path" title={pandoc.path}>
                {pandoc.path}
              </code>
            </div>
          )}
        </>
      )}
      {!pandoc && <div className="es-actions">{buttons}</div>}
    </Card>
  );
}

export function GeneralPage({ model }: { model: ExportSettingsModel }) {
  const view = model.view;
  if (!view) return null;
  const { general } = view;
  const custom = general.folderMode === 'custom' && !!general.folder;
  const chooseFolder = async () => {
    await model.choosePath({ kind: 'folder' });
  };
  return (
    <>
      <Card
        title="默认导出位置"
        description="保存对话框从这里开始；文件名与格式仍可在对话框中修改。"
      >
        <Row label="导出到">
          <Segmented
            label="默认导出位置"
            value={custom ? 'custom' : 'document'}
            options={[
              { value: 'document', label: '与原文件同一目录' },
              { value: 'custom', label: '指定文件夹' },
            ]}
            onChange={(value) => {
              if (value === 'document') {
                model.update('export.general', (current) => ({
                  ...current,
                  folderMode: 'document',
                }));
              } else if (general.folder) {
                model.update('export.general', (current) => ({ ...current, folderMode: 'custom' }));
              } else void chooseFolder();
            }}
          />
        </Row>
        {custom && (
          <div className="es-folder">
            <code className="es-path" title={general.folder}>
              {general.folder}
            </code>
            <Button onClick={() => void chooseFolder()}>更改…</Button>
            <Button
              label="清除指定文件夹"
              onClick={() =>
                model.update('export.general', (current) => {
                  const next = { ...current, folderMode: 'document' as const };
                  delete next.folder;
                  return next;
                })
              }
            >
              清除
            </Button>
          </div>
        )}
        <p className="es-note">还没有保存过的文稿没有所在目录，此时使用系统默认位置。</p>
      </Card>
      <Card title="导出后">
        <Row label="打开导出文件所在位置" hint="在文件管理器中选中刚导出的文件。">
          <Switch
            label="导出后打开所在位置"
            checked={general.openLocation === true}
            onChange={(value) =>
              model.update('export.general', (current) => ({ ...current, openLocation: value }))
            }
          />
        </Row>
        <Row label="打开导出文件" hint="用系统默认的应用打开刚导出的文件。">
          <Switch
            label="导出后打开文件"
            checked={general.openFile === true}
            onChange={(value) =>
              model.update('export.general', (current) => ({ ...current, openFile: value }))
            }
          />
        </Row>
      </Card>
      <Pandoc model={model} />
    </>
  );
}
