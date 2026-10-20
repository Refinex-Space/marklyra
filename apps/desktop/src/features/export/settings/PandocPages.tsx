import { useEffect, useId, useRef, useState } from 'react';
import { documentExports } from '../../../services/exports.js';
import {
  type CustomExportPreference,
  customExportProblems,
  MAX_CUSTOM_EXPORTS,
  MAX_EXTRA_ARGUMENT_BYTES,
  type PandocFormatKey,
  type PandocFormatPreferences,
} from '../preferences.js';
import { inferExtension, pandocFormat } from './catalog.js';
import { Button, Card, LiveField, Notice, Row, Select, Switch, TextField } from './controls.js';
import { PandocBanner } from './parts.js';
import type { ExportSettingsModel } from './useExportSettings.js';

const examples = [
  '--toc-depth=2',
  '--number-sections',
  '-V lang:zh-CN',
  '--shift-heading-level-by=-1',
] as const;

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; normalized: string[] }
  | { state: 'error'; message: string };

/**
 * Free-form Pandoc options. The host is the only authority on what is allowed, so the text is
 * checked there as it is typed and saved only once it passes.
 */
function ArgumentsField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const note = useId();
  const field = useId();
  const turn = useRef(0);
  const text = draft ?? value;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly saved value replaces the draft.
  useEffect(() => setDraft(null), [value]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the check follows the shown text only.
  useEffect(() => {
    if (!text.trim()) {
      turn.current++;
      setCheck({ state: 'idle' });
      if (draft !== null && draft !== value) onCommit('');
      return;
    }
    const mine = ++turn.current;
    setCheck({ state: 'checking' });
    const timer = setTimeout(() => {
      documentExports.checkArguments(text).then(
        (normalized) => {
          if (mine !== turn.current) return;
          setCheck({ state: 'ok', normalized });
          if (draft !== null && draft !== value) onCommit(text);
        },
        (error: unknown) => {
          if (mine !== turn.current) return;
          setCheck({ state: 'error', message: String(error).replace(/^Error:\s*/, '') });
        },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <div className="es-arguments">
      <textarea
        id={field}
        className="es-input es-textarea es-mono"
        aria-label="额外参数"
        aria-invalid={check.state === 'error' || undefined}
        aria-describedby={note}
        rows={3}
        maxLength={MAX_EXTRA_ARGUMENT_BYTES}
        placeholder="例如：--toc-depth=2 -V lang:zh-CN"
        spellCheck={false}
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (check.state !== 'error') setDraft(null);
        }}
      />
      <p
        id={note}
        className={`es-counter${check.state === 'error' ? ' es-counter-error' : ''}`}
        role={check.state === 'error' ? 'alert' : 'status'}
      >
        {check.state === 'error' && `未保存：${check.message}`}
        {check.state === 'checking' && '正在检查…'}
        {check.state === 'ok' && `已通过检查 · 将传给 Pandoc：${check.normalized.join(' ')}`}
        {check.state === 'idle' && '没有额外参数。'}
      </p>
      <fieldset className="es-variables" aria-label="常用参数示例">
        <span>常用</span>
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            className="es-chip es-mono"
            onClick={() => setDraft(`${text.trim()} ${example}`.trim())}
          >
            {example}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function PathRow({
  label,
  hint,
  value,
  choose,
  clear,
}: {
  label: string;
  hint: string;
  value: string;
  choose: () => void;
  clear: () => void;
}) {
  const name = value.split(/[\\/]/).pop() ?? value;
  return (
    <Row label={label} hint={hint}>
      <div className="es-folder">
        {value ? (
          <code className="es-path" title={value}>
            {name}
          </code>
        ) : (
          <span className="es-muted">未设置</span>
        )}
        <Button onClick={choose}>{value ? '更改…' : '选择…'}</Button>
        {value && (
          <Button label={`清除${label}`} onClick={clear}>
            清除
          </Button>
        )}
      </div>
    </Row>
  );
}

/** The options every Pandoc-backed export shares, for a built-in format or a custom one. */
function PandocOptions({
  model,
  target,
  styled,
  options,
  edit,
}: {
  model: ExportSettingsModel;
  /** `docx` or `custom:<id>`; names the target of the file dialogs. */
  target: string;
  styled: boolean;
  options: PandocFormatPreferences;
  edit: (change: (current: PandocFormatPreferences) => PandocFormatPreferences) => void;
}) {
  const depth = useId();
  const toc = options.toc === true;
  return (
    <>
      <Card title="目录与编号" description="文稿中单独一行的 [TOC] 也会生成目录。">
        <Row label="生成目录">
          <Switch
            label="生成目录"
            checked={toc}
            onChange={(value) => edit((current) => ({ ...current, toc: value }))}
          />
        </Row>
        <Row label="目录层级" htmlFor={depth} hint="目录收录到第几级标题。">
          <Select
            id={depth}
            label="目录层级"
            disabled={!toc}
            value={options.tocDepth === undefined ? '' : String(options.tocDepth)}
            options={[
              { value: '', label: '默认（3 级）' },
              ...[1, 2, 3, 4, 5, 6].map((level) => ({
                value: String(level),
                label: `${level} 级`,
              })),
            ]}
            onChange={(value) =>
              edit((current) => {
                const next = { ...current };
                if (value === '') delete next.tocDepth;
                else next.tocDepth = Number(value);
                return next;
              })
            }
          />
        </Row>
        <Row label="章节编号" hint="为各级标题加上 1、1.1、1.1.1 样式的编号。">
          <Switch
            label="章节编号"
            checked={options.numberSections === true}
            onChange={(value) => edit((current) => ({ ...current, numberSections: value }))}
          />
        </Row>
      </Card>
      {styled ? (
        <Card
          title="样式参考文档"
          description="标题、正文、列表等样式取自这个文档，用来套用你自己的模板；不选择则使用 Pandoc 的默认样式。"
        >
          <PathRow
            label="参考文档"
            hint="选择一个 .docx 或 .odt 文件。"
            value={options.referenceDoc ?? ''}
            choose={() => void model.choosePath({ kind: 'referenceDoc', format: target })}
            clear={() =>
              edit((current) => {
                const next = { ...current };
                delete next.referenceDoc;
                return next;
              })
            }
          />
        </Card>
      ) : (
        <Card
          title="模板"
          description="用自己的 Pandoc 模板控制输出的整体结构；不选择则使用该格式的默认模板。"
        >
          <PathRow
            label="模板文件"
            hint="选择一个 Pandoc 模板文件。"
            value={options.template ?? ''}
            choose={() => void model.choosePath({ kind: 'template', format: target })}
            clear={() =>
              edit((current) => {
                const next = { ...current };
                delete next.template;
                return next;
              })
            }
          />
        </Card>
      )}
      <Card
        title="额外参数"
        description="传给 Pandoc 的版式类选项。出于安全，不接受会读写其他文件、运行过滤器或改变输出位置的选项。"
      >
        <ArgumentsField
          value={options.extraArguments ?? ''}
          onCommit={(value) =>
            edit((current) => {
              const next = { ...current };
              if (value === '') delete next.extraArguments;
              else next.extraArguments = value;
              return next;
            })
          }
        />
      </Card>
    </>
  );
}

export function PandocFormatPage({
  model,
  format,
  onGeneral,
}: {
  model: ExportSettingsModel;
  format: PandocFormatKey;
  onGeneral: () => void;
}) {
  const info = pandocFormat(format);
  const options = model.view?.formats[format] ?? {};
  const unavailable =
    model.capabilities?.pandoc.status === 'available' &&
    !model.capabilities.formats.includes(format);
  if (!info || !model.view) return null;
  return (
    <>
      <p className="es-lead">{info.summary}</p>
      <PandocBanner model={model} onGeneral={onGeneral} />
      {unavailable && (
        <Notice kind="warning">当前 Pandoc 没有提供这个输出格式，导出会失败。</Notice>
      )}
      <PandocOptions
        model={model}
        target={format}
        styled={info.styled}
        options={options}
        edit={(change) =>
          model.update('export.formats', (current) => ({
            ...current,
            [format]: change(current[format] ?? {}),
          }))
        }
      />
    </>
  );
}

function WriterInput({
  value,
  onCommit,
  writers,
  invalid,
  live,
}: {
  value: string;
  onCommit: (value: string) => void;
  writers: readonly string[];
  invalid?: boolean | undefined;
  /** Edits apply immediately (a form) instead of after a pause (saved settings). */
  live?: boolean | undefined;
}) {
  const list = useId();
  return (
    <>
      {live ? (
        <LiveField
          label="输出格式"
          mono
          value={value}
          list={list}
          placeholder="例如 gfm、asciidoc、pptx"
          invalid={invalid}
          onChange={onCommit}
        />
      ) : (
        <TextField
          label="输出格式"
          mono
          value={value}
          list={list}
          placeholder="例如 gfm、asciidoc、pptx"
          invalid={invalid}
          onCommit={onCommit}
        />
      )}
      <datalist id={list}>
        {writers.map((writer) => (
          <option key={writer} value={writer} />
        ))}
      </datalist>
    </>
  );
}

export function CustomPage({
  model,
  item,
  index,
  count,
  onGeneral,
  onSelect,
}: {
  model: ExportSettingsModel;
  item: CustomExportPreference;
  index: number;
  count: number;
  onGeneral: () => void;
  onSelect: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const nameId = useId();
  const extensionId = useId();
  const writers = model.capabilities?.writers ?? [];
  const patch = (
    change: Partial<Pick<CustomExportPreference, 'name' | 'writer' | 'extension'>>,
  ) => {
    const next = { name: item.name, writer: item.writer, extension: item.extension, ...change };
    const found = customExportProblems(next);
    setProblems(found);
    const field = Object.keys(change)[0] as 'name' | 'writer' | 'extension' | undefined;
    if (field && found[field]) return;
    model.update('export.custom', (list) =>
      list.map((entry) => (entry.id === item.id ? { ...entry, ...change } : entry)),
    );
  };
  const move = (by: -1 | 1) =>
    model.update('export.custom', (list) => {
      const from = list.findIndex((entry) => entry.id === item.id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= list.length) return list;
      const next = [...list];
      const [entry] = next.splice(from, 1);
      if (entry) next.splice(to, 0, entry);
      return next;
    });
  const remove = () => {
    const neighbour = model.view?.custom[index + 1] ?? model.view?.custom[index - 1];
    model.update('export.custom', (list) => list.filter((entry) => entry.id !== item.id));
    setConfirming(false);
    onSelect(neighbour?.id ?? '');
  };
  return (
    <>
      <PandocBanner model={model} onGeneral={onGeneral} />
      <Card
        title="基本信息"
        description="自定义导出出现在“文件 → 导出”菜单中，由 Pandoc 把文稿转换成所选格式。"
        actions={
          <>
            <Button label="上移" disabled={index === 0} onClick={() => move(-1)}>
              上移
            </Button>
            <Button label="下移" disabled={index === count - 1} onClick={() => move(1)}>
              下移
            </Button>
          </>
        }
      >
        <Row label="名称" htmlFor={nameId} hint="显示在导出菜单中。">
          <TextField
            id={nameId}
            label="名称"
            value={item.name}
            maxLength={40}
            invalid={!!problems.name}
            onCommit={(value) => patch({ name: value })}
          />
        </Row>
        {problems.name && (
          <p className="es-field-error" role="alert">
            {problems.name}
          </p>
        )}
        <Row label="输出格式" hint="Pandoc 的 --to 格式。">
          <WriterInput
            value={item.writer}
            writers={writers}
            invalid={!!problems.writer}
            onCommit={(value) => patch({ writer: value })}
          />
        </Row>
        {problems.writer && (
          <p className="es-field-error" role="alert">
            {problems.writer}
          </p>
        )}
        <Row label="文件扩展名" htmlFor={extensionId} hint="不含点号。">
          <TextField
            id={extensionId}
            label="文件扩展名"
            mono
            value={item.extension}
            maxLength={10}
            invalid={!!problems.extension}
            onCommit={(value) => patch({ extension: value })}
          />
        </Row>
        {problems.extension && (
          <p className="es-field-error" role="alert">
            {problems.extension}
          </p>
        )}
      </Card>
      <PandocOptions
        model={model}
        target={`custom:${item.id}`}
        styled={['docx', 'odt'].includes(item.writer.split(/[+-]/)[0] ?? '')}
        options={item.options}
        edit={(change) =>
          model.update('export.custom', (list) =>
            list.map((entry) =>
              entry.id === item.id ? { ...entry, options: change(entry.options) } : entry,
            ),
          )
        }
      />
      <Card title="删除">
        {confirming ? (
          <Notice
            kind="warning"
            live="alert"
            actions={
              <>
                <Button kind="danger" onClick={remove}>
                  删除
                </Button>
                <Button onClick={() => setConfirming(false)}>取消</Button>
              </>
            }
          >
            删除“{item.name}”？它将从导出菜单中移除，已导出的文件不受影响。
          </Notice>
        ) : (
          <Button kind="danger" onClick={() => setConfirming(true)}>
            删除此自定义导出…
          </Button>
        )}
      </Card>
    </>
  );
}

export function NewCustomPage({
  model,
  onCreated,
  onGeneral,
}: {
  model: ExportSettingsModel;
  onCreated: (id: string) => void;
  onGeneral: () => void;
}) {
  const [name, setName] = useState('');
  const [writer, setWriter] = useState('');
  const [extension, setExtension] = useState('');
  const [touched, setTouched] = useState(false);
  const [extensionEdited, setExtensionEdited] = useState(false);
  const nameId = useId();
  const extensionId = useId();
  const count = model.view?.custom.length ?? 0;
  const problems = customExportProblems({ name, writer, extension });
  const full = count >= MAX_CUSTOM_EXPORTS;
  const valid = Object.keys(problems).length === 0 && !full;
  const writers = model.capabilities?.writers ?? [];
  const show = (field: 'name' | 'writer' | 'extension') => (touched ? problems[field] : undefined);
  return (
    <form
      className="es-new"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!valid) return;
        const id = crypto.randomUUID();
        model.update('export.custom', (list) => [
          ...list,
          { id, name: name.trim(), writer, extension, options: {} },
        ]);
        onCreated(id);
      }}
    >
      <PandocBanner model={model} onGeneral={onGeneral} />
      <Card description="用 Pandoc 把文稿转换成任意它支持的格式，例如 AsciiDoc、PowerPoint（pptx）或 Markdown 变体。">
        <Row label="名称" htmlFor={nameId} hint="显示在“文件 → 导出”菜单中。">
          <LiveField
            id={nameId}
            label="名称"
            value={name}
            maxLength={40}
            placeholder="例如 AsciiDoc"
            invalid={!!show('name')}
            onChange={(value) => {
              setName(value);
              setTouched(true);
            }}
          />
        </Row>
        {show('name') && (
          <p className="es-field-error" role="alert">
            {show('name')}
          </p>
        )}
        <Row
          label="输出格式"
          hint={
            writers.length
              ? `可输入或选择 Pandoc 提供的 ${writers.length} 种格式。`
              : '输入 Pandoc 的输出格式名称。'
          }
        >
          <WriterInput
            live
            value={writer}
            writers={writers}
            invalid={!!show('writer')}
            onCommit={(value) => {
              setWriter(value);
              if (!extensionEdited) setExtension(inferExtension(value));
              setTouched(true);
            }}
          />
        </Row>
        {show('writer') && (
          <p className="es-field-error" role="alert">
            {show('writer')}
          </p>
        )}
        <Row label="文件扩展名" htmlFor={extensionId} hint="已按输出格式推荐，可以修改。">
          <LiveField
            id={extensionId}
            label="文件扩展名"
            mono
            value={extension}
            maxLength={10}
            invalid={!!show('extension')}
            onChange={(value) => {
              setExtension(value);
              setExtensionEdited(true);
              setTouched(true);
            }}
          />
        </Row>
        {show('extension') && (
          <p className="es-field-error" role="alert">
            {show('extension')}
          </p>
        )}
        <div className="es-actions">
          <Button kind="primary" type="submit" disabled={full}>
            创建
          </Button>
          {full && <span className="es-muted">最多创建 {MAX_CUSTOM_EXPORTS} 项自定义导出。</span>}
        </div>
      </Card>
    </form>
  );
}
