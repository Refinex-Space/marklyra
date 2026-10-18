import { useModalFocus } from '../../components/useModalFocus.js';
import type { StatisticsUnit } from '../settings/preferences.js';
import type { useStatistics } from './useStatistics.js';

const labels = { words: '词', characters: '字符', lines: '行', readingMinutes: '分钟' } as const;
export function StatisticsStatus({
  statistics,
  unit,
  open,
  setOpen,
  closing,
}: {
  statistics: ReturnType<typeof useStatistics>;
  unit: StatisticsUnit;
  open: boolean;
  setOpen: (open: boolean) => void;
  closing: boolean;
}) {
  const panel = useModalFocus(open, () => setOpen(false), closing, closing);
  const value = statistics.value;
  return (
    <>
      <button
        type="button"
        className="statistics-trigger"
        aria-label="文档统计"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
        title="查看文档与选区统计"
      >
        {value ? (
          <>
            {(['words', 'characters', 'lines', 'readingMinutes'] as const).map((name) => (
              <span
                key={name}
                className={name === unit ? 'statistics-primary' : 'statistics-secondary'}
              >
                {name === 'readingMinutes' && value.words > 0 && value.readingMinutes === 0
                  ? '不足 1'
                  : value[name].toLocaleString()}{' '}
                {labels[name]}
              </span>
            ))}
            {value.selection && (
              <span className="statistics-selection">已选 {value.selection.words} 词</span>
            )}
            {statistics.pending && <span className="statistics-pending">更新中</span>}
          </>
        ) : statistics.error ? (
          '统计暂不可用'
        ) : (
          '正在统计…'
        )}
      </button>
      {open && (
        <div className="modal-backdrop">
          <section
            className="statistics-panel"
            role="dialog"
            aria-modal="true"
            aria-busy={closing}
            aria-labelledby="statistics-title"
            ref={panel}
          >
            <header className="panel-heading">
              <h2 id="statistics-title">文档统计</h2>
              <button type="button" disabled={closing} onClick={() => setOpen(false)}>
                关闭
              </button>
            </header>
            {statistics.error && (
              <p role="alert">
                {statistics.error}
                <button type="button" onClick={statistics.invalidate}>
                  重新统计
                </button>
              </p>
            )}
            {statistics.pending && <p role="status">正在更新统计…</p>}
            {value && (
              <>
                <dl className="statistics-grid">
                  {(['words', 'characters', 'lines', 'readingMinutes'] as const).map((name) => (
                    <div key={name}>
                      <dt>{name === 'readingMinutes' ? '阅读时间（分钟）' : labels[name]}</dt>
                      <dd>
                        {name === 'readingMinutes' && value.words > 0 && value.readingMinutes === 0
                          ? '不足 1'
                          : value[name].toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
                {value.selection && (
                  <p className="statistics-selected">
                    当前选区：{value.selection.words} 词 · {value.selection.characters} 字符
                  </p>
                )}
                <p className="statistics-explanation">
                  词数按 MarkLyra 编辑器渲染内容统计；字符和行数包含 Markdown 标记，字符按 UTF-16
                  代码单元计数。阅读时间按每分钟 {value.wordsPerMinute} 词四舍五入。
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
