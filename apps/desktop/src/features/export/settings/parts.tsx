import { invoke } from '@tauri-apps/api/core';
import { useEffect, useId, useState } from 'react';
import type { ExportTheme } from '../preferences.js';
import { MAX_EXPORT_CSS_BYTES } from '../preferences.js';
import { formatBytes } from './catalog.js';
import { Button, Notice, Row, Select, TextArea } from './controls.js';
import type { ExportSettingsModel } from './useExportSettings.js';

export const PANDOC_INSTALL = 'https://pandoc.org/installing.html';

/** Opens a web page in the system browser; where that is refused the address stays visible. */
export function ExternalLink({ href, children }: { href: string; children: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          void invoke('open_external_link', { url: href }).then(
            () => setFailed(false),
            () => setFailed(true),
          );
        }}
      >
        {children}
      </a>
      {failed && <span className="es-link-address"> {href}</span>}
    </>
  );
}

const themeOptions = [
  { value: '', label: '跟随当前主题' },
  { value: 'marklyra-light', label: 'MarkLyra Light' },
  { value: 'marklyra-dark', label: 'MarkLyra Dark' },
] as const;

export function ThemeRow({
  value,
  onChange,
  hint,
}: {
  value: ExportTheme | undefined;
  onChange: (value: ExportTheme) => void;
  hint?: string | undefined;
}) {
  const id = useId();
  return (
    <Row
      label="导出主题"
      htmlFor={id}
      hint={hint ?? '导出的文件使用此主题的外观，与当前窗口的主题无关。'}
    >
      <Select
        id={id}
        label="导出主题"
        value={value ?? ''}
        options={themeOptions}
        onChange={onChange}
      />
    </Row>
  );
}

function cssProblem(css: string): string {
  if (new TextEncoder().encode(css).byteLength > MAX_EXPORT_CSS_BYTES)
    return `超过 ${formatBytes(MAX_EXPORT_CSS_BYTES)}`;
  if (/[\0<]/.test(css)) return '不能包含 < 或空字符（不支持 HTML 与脚本）';
  return '';
}

/** Static CSS appended to the exported document, saved only while it is acceptable. */
export function ExtraCss({
  value,
  onCommit,
  scope,
}: {
  value: string;
  onCommit: (value: string) => void;
  scope: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const note = useId();
  // The saved text (or a change from another window) replaces the local draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new saved value resets the draft.
  useEffect(() => setDraft(null), [value]);
  const text = draft ?? value;
  const problem = cssProblem(text);
  return (
    <details className="es-card es-details" open={value !== '' || undefined}>
      <summary>
        <span>自定义样式</span>
        <small>{value ? '已启用' : '未设置'}</small>
      </summary>
      <p className="es-card-note">
        追加在{scope}末尾的静态 CSS，用来微调字体、间距或配色。只接受纯样式：不能包含 &lt;
        与脚本，也不会加载外部资源。
      </p>
      <div className="es-card-body">
        <TextArea
          label="自定义样式"
          value={value}
          rows={7}
          placeholder={'#write { max-width: 860px; }\nh1 { border-bottom: 1px solid #ddd; }'}
          describedBy={note}
          invalid={problem !== ''}
          validate={(next) => cssProblem(next) === ''}
          onCommit={onCommit}
          onDraft={setDraft}
        />
        <p
          id={note}
          className={`es-counter${problem ? ' es-counter-error' : ''}`}
          role={problem ? 'alert' : undefined}
        >
          {problem
            ? `未保存：${problem}`
            : `${formatBytes(new TextEncoder().encode(text).byteLength)} / ${formatBytes(MAX_EXPORT_CSS_BYTES)}`}
        </p>
      </div>
    </details>
  );
}

/** Pandoc is not ready: say why and offer the two ways out. */
export function PandocBanner({
  model,
  onGeneral,
}: {
  model: ExportSettingsModel;
  onGeneral: () => void;
}) {
  const pandoc = model.capabilities?.pandoc;
  if (!pandoc) {
    return model.capabilityError ? (
      <Notice kind="error">无法检查 Pandoc：{model.capabilityError}</Notice>
    ) : (
      <Notice kind="info" live="status">
        正在检查 Pandoc…
      </Notice>
    );
  }
  if (pandoc.status === 'available') return null;
  return (
    <Notice
      kind={pandoc.status === 'missing' ? 'warning' : 'error'}
      live="status"
      actions={
        <>
          <Button onClick={() => void model.choosePandoc()}>选择程序…</Button>
          <Button onClick={onGeneral}>前往通用</Button>
        </>
      }
    >
      <strong>{pandoc.status === 'missing' ? '尚未安装 Pandoc' : 'Pandoc 无法使用'}</strong>
      <br />
      {pandoc.status === 'missing' ? (
        <>
          此格式由 Pandoc 转换，请先 <ExternalLink href={PANDOC_INSTALL}>安装 Pandoc</ExternalLink>
          ，安装后无需重启即可使用。
        </>
      ) : (
        pandoc.message
      )}
    </Notice>
  );
}
