import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import type { Category, Status } from '../../services/tasks.js';
import { notify } from '../notices/notices.js';
import { PriorityGlyph, ProgressPie, StatusGlyph, TaskIcon } from './glyphs.js';
import './guide.css';

/** What the guide can start in the workbench, so a chapter ends in the real thing. */
export interface GuideActions {
  newTask(): void;
  newProject(): void;
  openAll(): void;
  openImport(): void;
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = mac ? '⌘' : 'Ctrl';
const ALT = mac ? '⌥' : 'Alt';
const SHIFT = mac ? '⇧' : 'Shift';

const status = (category: Category, color: string, name: string): Status => ({
  id: color,
  name,
  category,
  color,
  builtin: true,
  order: 0,
});
const S = {
  backlog: status('backlog', 'backlog', '待规划'),
  todo: status('unstarted', 'todo', '待办'),
  started: status('started', 'started', '进行中'),
  review: status('review', 'review', '评审中'),
  done: status('completed', 'done', '已完成'),
};

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="tg-keys">
      {keys.map((k, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed key sequence
        <kbd key={i} className="tg-key">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/* ——— Figures: small working pictures built from the product's own glyphs ——— */

function Row({
  id,
  title,
  s,
  p = 0,
  tag,
  className = '',
  style,
}: {
  id: string;
  title: string;
  s: Status;
  p?: number;
  tag?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`tg-row ${className}`} style={style}>
      <PriorityGlyph value={p} />
      <span className="tg-id">{id}</span>
      <StatusGlyph status={s} size={13} />
      <span className="tg-title">{title}</span>
      {tag && <span className="tg-tag">{tag}</span>}
    </div>
  );
}

function HeroFigure() {
  return (
    <div className="tg-window" aria-hidden="true">
      <div className="tg-window-bar">
        <i />
        <i />
        <i />
      </div>
      <div className="tg-window-body">
        <div className="tg-mini-nav">
          <span className="tg-mini-nav-item on">
            <TaskIcon name="list" />
            全部任务
          </span>
          <span className="tg-mini-nav-item">
            <TaskIcon name="cycle" />
            迭代 12
          </span>
          <span className="tg-mini-head">项目</span>
          <span className="tg-mini-nav-item">
            <TaskIcon name="folder" color="violet" />
            官网改版
          </span>
          <span className="tg-mini-nav-item">
            <TaskIcon name="folder" color="green" />
            写作计划
          </span>
        </div>
        <div className="tg-mini-list">
          <div className="tg-group">
            <StatusGlyph status={S.started} size={12} /> 进行中 <b>2</b>
          </div>
          <Row id="WEB-12" title="定价页支持年付切换" s={S.started} p={2} tag="功能" />
          <Row id="WEB-9" title="首屏动效与性能" s={S.started} p={3} className="tg-hero-cursor" />
          <div className="tg-group">
            <StatusGlyph status={S.todo} size={12} /> 待办 <b>3</b>
          </div>
          <Row id="WEB-14" title="移动端导航栏错位" s={S.todo} p={1} tag="缺陷" />
          <Row id="WEB-15" title="接入访问统计" s={S.todo} />
          <Row id="WEB-16" title="编写发布公告" s={S.todo} p={4} />
          <div className="tg-pop">
            <span className="tg-pop-title">修改状态…</span>
            {[S.todo, S.started, S.review, S.done].map((s, i) => (
              <span key={s.id} className={i === 2 ? 'tg-pop-item on' : 'tg-pop-item'}>
                <StatusGlyph status={s} size={12} />
                {s.name}
                <kbd>{i + 1}</kbd>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyboardFigure() {
  return (
    <div className="tg-stage tg-kbd-stage" aria-hidden="true">
      <div className="tg-kbd-list">
        <span className="tg-kbd-cursor" />
        <Row id="WEB-3" title="修复移动端导航栏错位" s={S.todo} p={1} />
        <Row id="WEB-4" title="接入访问统计" s={S.todo} className="tg-kbd-pick" />
        <Row id="WEB-5" title="编写发布公告" s={S.todo} className="tg-kbd-pick tg-kbd-pick-2" />
        <Row id="WEB-6" title="图片懒加载" s={S.backlog} />
        <div className="tg-bulk">
          <span>已选 2</span>
          <i />
          <span>状态</span>
          <span>优先级</span>
          <span>标签</span>
        </div>
      </div>
      <div className="tg-kbd-keys">
        {['J', 'X', '⇧J', 'S'].map((k, i) => (
          <kbd key={k} className="tg-key big" style={{ '--i': i } as CSSProperties}>
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function QueryFigure() {
  return (
    <div className="tg-stage" aria-hidden="true">
      <div className="tg-search">
        <Icon name="search" />
        <span className="tg-typed mono">is:open priority:high</span>
        <span className="tg-chips">
          <span className="tg-chip">
            <b>是</b>未关闭
          </span>
          <span className="tg-chip">
            <b>优先级</b>高
          </span>
        </span>
      </div>
      <div className="tg-query-rows">
        <Row id="WEB-12" title="定价页支持年付切换" s={S.started} p={2} />
        <Row id="WEB-14" title="移动端导航栏错位" s={S.todo} p={1} />
        <Row id="WEB-15" title="接入访问统计" s={S.todo} className="tg-filtered" />
        <Row id="WEB-2" title="旧版统计脚本移除" s={S.done} className="tg-filtered" />
      </div>
      <div className="tg-save">
        <TaskIcon name="board" /> 保存为视图「紧急待办」
      </div>
    </div>
  );
}

function BoardFigure() {
  const card = (id: string, title: string, p: number, tag?: string, className = '') => (
    <div className={`tg-card ${className}`}>
      <span className="tg-card-top">
        <span className="tg-id">{id}</span>
        <PriorityGlyph value={p} />
      </span>
      <span className="tg-card-title">{title}</span>
      {tag && <span className="tg-tag">{tag}</span>}
    </div>
  );
  return (
    <div className="tg-stage tg-board" aria-hidden="true">
      {[
        [S.todo, '待办'],
        [S.started, '进行中'],
        [S.done, '已完成'],
      ].map(([s, name], col) => (
        <div key={name as string} className="tg-col">
          <span className="tg-col-head">
            <StatusGlyph status={s as Status} size={12} /> {name as string}
          </span>
          {col === 0 && (
            <>
              {card('WEB-14', '移动端导航栏错位', 1, '缺陷', 'tg-drag')}
              {card('WEB-15', '接入访问统计', 0)}
            </>
          )}
          {col === 1 && (
            <>
              <div className="tg-slot" />
              {card('WEB-12', '定价页支持年付切换', 2, '功能')}
            </>
          )}
          {col === 2 && card('WEB-2', '旧版统计脚本移除', 0)}
        </div>
      ))}
    </div>
  );
}

function TaskPageFigure() {
  return (
    <div className="tg-stage tg-page" aria-hidden="true">
      <div className="tg-page-main">
        <span className="tg-crumb">
          <TaskIcon name="folder" color="violet" /> 官网改版 › WEB-12
        </span>
        <span className="tg-page-title">定价页支持年付切换</span>
        <span className="tg-line w80" />
        <span className="tg-line w55" />
        <span className="tg-sub-head">
          子任务 <ProgressPie fraction={2 / 3} size={12} /> 2/3
        </span>
        <Row id="WEB-17" title="价格接口加年付字段" s={S.done} />
        <Row id="WEB-18" title="切换动效" s={S.started} />
        <span className="tg-sub-head">关系</span>
        <span className="tg-relation">
          <TaskIcon name="blocked" /> 被阻塞于 <b>WEB-9</b>
        </span>
        <span className="tg-comment">
          <TaskIcon name="comment" /> 设计稿已更新，可以开工
        </span>
      </div>
      <div className="tg-props">
        {[
          ['状态', <StatusGlyph key="s" status={S.started} size={12} />, '进行中'],
          ['优先级', <PriorityGlyph key="p" value={2} />, '高'],
          ['类型', <TaskIcon key="t" name="type" />, '功能'],
          ['到期', <TaskIcon key="d" name="calendar" />, '12月1日'],
          ['迭代', <TaskIcon key="c" name="cycle" />, '迭代 12'],
        ].map(([label, icon, value]) => (
          <span key={label as string} className="tg-prop">
            <span className="tg-prop-label">{label}</span>
            <span className="tg-prop-value">
              {icon}
              {value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PlanFigure() {
  return (
    <div className="tg-stage tg-plan" aria-hidden="true">
      <div className="tg-burn">
        <span className="tg-burn-head">
          <TaskIcon name="cycle" /> 迭代 12 <em>11月23日–12月6日</em>
        </span>
        <svg viewBox="0 0 240 110" className="tg-burn-chart" aria-hidden="true">
          {[20, 50, 80].map((y) => (
            <line key={y} x1="0" x2="240" y1={y} y2={y} className="tg-burn-grid" />
          ))}
          <line x1="8" y1="14" x2="232" y2="100" className="tg-burn-ideal" />
          <polyline
            points="8,14 40,20 72,30 104,34 136,52 168,60 200,76 232,92"
            className="tg-burn-actual"
            pathLength={1}
          />
          <circle cx="232" cy="92" r="3.5" className="tg-burn-dot" />
        </svg>
        <span className="tg-burn-legend">
          <i className="ideal" />
          理想
          <i />
          实际剩余
        </span>
      </div>
      <div className="tg-template">
        <span className="tg-template-head">
          <TaskIcon name="template" /> 模板「缺陷报告」
        </span>
        <span className="tg-template-field">
          <TaskIcon name="type" /> 类型 缺陷
        </span>
        <span className="tg-template-field">
          <PriorityGlyph value={2} /> 优先级 高
        </span>
        <span className="tg-template-field">
          <TaskIcon name="subtask" /> 复现 · 修复 · 回归
        </span>
      </div>
    </div>
  );
}

function NoteFigure() {
  return (
    <div className="tg-stage tg-note" aria-hidden="true">
      <span className="tg-note-title">周会记录</span>
      <p>
        本周优先处理移动端问题，
        <span className="tg-convert">
          <span className="tg-convert-text">修复导航栏错位</span>
          <span className="tg-convert-chip">
            <StatusGlyph status={S.todo} size={11} /> WEB-14 修复导航栏错位
          </span>
        </span>
        ，周五前合并。
      </p>
      <p>
        跟进
        <span className="tg-note-chip done">
          <StatusGlyph status={S.done} size={11} /> WEB-2 旧版统计脚本移除
        </span>
      </p>
      <div className="tg-hover-card">
        <span className="tg-id">WEB-14</span>
        <span className="tg-hover-title">修复导航栏错位</span>
        <span className="tg-hover-meta">
          <StatusGlyph status={S.todo} size={11} /> 待办 · <PriorityGlyph value={1} /> 紧急
        </span>
      </div>
    </div>
  );
}

function AutomationFigure() {
  return (
    <div className="tg-stage tg-auto" aria-hidden="true">
      <div className="tg-term">
        <div className="tg-term-bar">
          <i />
          <i />
          <i />
          <span>marklyra</span>
        </div>
        <code className="tg-term-line l1">
          <b>$</b> marklyra task list is:open priority:urgent
        </code>
        <code className="tg-term-line l2 out">WEB-14 待办 紧急 移动端导航栏错位</code>
        <code className="tg-term-line l3">
          <b>$</b> marklyra task update WEB-14 --status 进行中
        </code>
        <code className="tg-term-line l4 out">已更新 WEB-14</code>
      </div>
      <div className="tg-approve">
        <span className="tg-approve-head">
          <TaskIcon name="tasks" /> Claude 想要创建 2 个任务
        </span>
        <span className="tg-approve-row">
          <i className="on" /> 补充年付价格的单元测试
        </span>
        <span className="tg-approve-row">
          <i className="on" /> 更新定价页文案
        </span>
        <span className="tg-approve-actions">
          <span>拒绝</span>
          <span className="primary">批准</span>
        </span>
      </div>
    </div>
  );
}

/* ——— Chapters ——— */

interface Point {
  keys?: string[];
  title: string;
  text: ReactNode;
}
interface ChapterData {
  id: string;
  /** The rail's name for it. */
  short: string;
  title: string;
  lead: string;
  figure: ReactNode;
  points: Point[];
  more?: ReactNode;
  try?: { label: string; run: keyof GuideActions };
}

const chapters = (copy: (text: string) => void): ChapterData[] => [
  {
    id: 'keyboard',
    short: '键盘操作',
    title: '用键盘走完一整天',
    lead: '列表里的每个动作都有单键，鼠标可以留在桌上。',
    figure: <KeyboardFigure />,
    points: [
      { keys: ['J', 'K'], title: '上下移动', text: '方向键同样有效；Enter 或 O 打开任务。' },
      {
        keys: ['X', `${SHIFT}J`],
        title: '多选',
        text: `X 勾选当前行，${SHIFT}J / ${SHIFT}K 连续扩选，${MOD}A 全选；底部出现批量栏。`,
      },
      {
        keys: ['S', 'P', 'L', 'T', 'D'],
        title: '改属性',
        text: '状态、优先级、标签、类型、到期；另有 M 项目、B 队列、Y 迭代。状态和优先级可按数字直选。',
      },
      {
        keys: ['C', '/'],
        title: '新建与搜索',
        text: `C 新建任务，/ 聚焦搜索，${MOD}Z 撤销上一步（批量修改也能一次撤回）。`,
      },
    ],
    try: { label: '打开全部任务', run: 'openAll' },
  },
  {
    id: 'query',
    short: '搜索与视图',
    title: '一句话筛出要看的任务',
    lead: '在搜索框里写条件，按空格变成可点的标签；常用组合存成视图。',
    figure: <QueryFigure />,
    points: [
      {
        title: '条件写法',
        text: (
          <>
            <code>键:值</code>，多个值用逗号：<code>priority:urgent,high</code>。键支持中文：
            <code>状态:进行中</code>。
          </>
        ),
      },
      {
        title: '编辑标签',
        text: '点键名切换“包含 / 排除”，点值重新多选；Backspace 把最后一个标签拆回文字。',
      },
      {
        title: '保存为视图',
        text: '视图带着筛选、分组、排序和列表/看板布局，可以挂在项目页签上。',
      },
    ],
    more: (
      <table className="tg-table">
        <caption className="tg-sr">查询条件</caption>
        <tbody>
          {[
            ['is', 'open · closed · overdue · blocked · parent · subtask · archived'],
            ['has', 'due · labels · description · comments · subtasks · relations'],
            ['status / priority', '状态名或 urgent · high · medium · low · none'],
            ['label / type / bucket', '标签、类型、队列名称'],
            ['project / cycle', '项目 key、迭代编号或 current'],
            ['due', 'today · week · overdue · none · <3d · >2w'],
            ['created / completed', '时间范围，例如 <7d'],
          ].map(([k, v]) => (
            <tr key={k}>
              <th scope="row">
                <code>{k}</code>
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'board',
    short: '看板',
    title: '看板：拖一下就改状态',
    lead: '同一份数据，换成看板只是显示方式不同。',
    figure: <BoardFigure />,
    points: [
      { title: '切换布局', text: '列表右上角“显示”里选择看板，列可以按状态或队列。' },
      { title: '拖动', text: '把卡片拖到别的列即修改状态或队列，其他卡片会让出位置。' },
      { title: '子任务', text: '子任务卡片顶部带父任务路径，不会和父任务混在一起。' },
    ],
  },
  {
    id: 'page',
    short: '任务页',
    title: '任务页：一件事的全部上下文',
    lead: '属性在右侧卡片，正文、子任务、关系和动态按阅读顺序排开。',
    figure: <TaskPageFigure />,
    points: [
      {
        keys: ['J', 'K'],
        title: '连续处理',
        text: '在任务页里 J / K 切换上一个、下一个，E 改标题，Esc 回到列表。',
      },
      {
        title: '描述',
        text: '点击描述用 Markdown 编辑；内容较多时用“⋯ → 在编辑器中编辑描述”，交给笔记编辑器。',
      },
      {
        title: '子任务与关系',
        text: '子任务回车连续添加；“阻塞 / 相关”可以从任意一侧添加和移除。关闭有未完成子任务的父任务前会先询问。',
      },
      {
        title: '动态',
        text: `每次修改都会记录，并标明来自 AI、命令行还是外部 MCP；评论支持 Markdown，${MOD}↩ 发送。`,
      },
    ],
    try: { label: '新建一个任务', run: 'newTask' },
  },
  {
    id: 'plan',
    short: '项目与迭代',
    title: '项目、迭代与模板',
    lead: '项目给任务编号，迭代给节奏，模板省掉重复填写。',
    figure: <PlanFigure />,
    points: [
      {
        title: '项目',
        text: '每个项目有自己的 key（如 WEB），任务编号为 WEB-1、WEB-2…；可以限定项目只使用部分状态、标签和队列。',
      },
      {
        title: '迭代',
        text: '在“任务设置 → 迭代”开启后按周期自动滚动；燃尽图对比理想与实际进度，完成迭代时逐条决定未完成任务的去向。',
      },
      {
        title: '模板与类型规则',
        text: '模板预填字段和子任务，可设为项目默认；类型规则在选择类型时自动加标签、设优先级。',
      },
    ],
    try: { label: '新建项目', run: 'newProject' },
  },
  {
    id: 'notes',
    short: '笔记联动',
    title: '和笔记连在一起',
    lead: '计划写在笔记里，执行留在任务里，两边始终同步。',
    figure: <NoteFigure />,
    points: [
      {
        keys: [MOD, ALT, SHIFT, 'T'],
        title: '选中文字转为任务',
        text: '在笔记中选中一句话，转为任务后原地替换成任务链接。',
      },
      {
        title: '任务链接',
        text: `链接显示为带状态的卡片，关闭后自动划线；${MOD} 点击打开任务。任务页“⋯ → 复制笔记链接”可粘贴到任意笔记。`,
      },
      {
        title: '提及',
        text: '任务页底部列出所有引用它的笔记，点击跳回原文位置。',
      },
    ],
  },
  {
    id: 'automation',
    short: 'AI 与命令行',
    title: 'AI、命令行与导入',
    lead: '同一份任务文件，可以由 AI、终端和其他工具一起读写。',
    figure: <AutomationFigure />,
    points: [
      {
        title: 'AI 助手',
        text: 'AI 可以查询、创建和修改任务；写入前逐条列出，由你勾选批准，之后也可以一键撤销。',
      },
      {
        title: '命令行',
        text: (
          <>
            应用菜单“安装命令行工具…”后可在终端使用 <code>marklyra</code>；加 <code>--json</code>{' '}
            输出机器可读结果。
            <button
              type="button"
              className="tg-copy"
              onClick={() => copy('marklyra task list is:open')}
            >
              复制示例
            </button>
          </>
        ),
      },
      {
        title: '外部 MCP',
        text: (
          <>
            <code>marklyra mcp</code> 供其他 AI 工具连接，默认只读；加 <code>--allow-write</code>{' '}
            才允许写入。
          </>
        ),
      },
      {
        title: '导入',
        text: '笔记清单、CSV（Linear / Jira / Todoist）、GitHub Issues、Octarine；先预览，每次导入都可以撤销。',
      },
    ],
    try: { label: '去导入', run: 'openImport' },
  },
];

function Chapter({
  data,
  index,
  actions,
}: {
  data: ChapterData;
  index: number;
  actions: GuideActions;
}) {
  return (
    <section className="tg-chapter" id={`tg-${data.id}`} aria-labelledby={`tg-${data.id}-title`}>
      <header className="tg-chapter-head">
        <span className="tg-chapter-no mono">{String(index + 1).padStart(2, '0')}</span>
        <h3 id={`tg-${data.id}-title`}>{data.title}</h3>
        <p>{data.lead}</p>
      </header>
      <div className="tg-figure">{data.figure}</div>
      <ul className="tg-points">
        {data.points.map((point) => (
          <li key={point.title}>
            <span className="tg-point-head">
              <b>{point.title}</b>
              {point.keys && <Keys keys={point.keys} />}
            </span>
            <span className="tg-point-text">{point.text}</span>
          </li>
        ))}
      </ul>
      {data.more}
      {data.try && (
        <button
          type="button"
          className="tg-try"
          onClick={() => data.try && actions[data.try.run]()}
        >
          {data.try.label}
          <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
}

/** Task settings → 使用指南: everything tasks can do, shown working, one chapter at a time. */
export function TaskGuide({ actions }: { actions: GuideActions }) {
  const root = useRef<HTMLDivElement>(null);
  const copy = (text: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => notify('已复制', 'success'),
      () => notify('无法写入剪贴板', 'error'),
    );
  const list = chapters(copy);
  const [active, setActive] = useState(list[0]?.id ?? '');
  const [progress, setProgress] = useState(0);

  // Figures play once they come into view; the rail follows the chapter being read.
  useEffect(() => {
    const host = root.current;
    const scroller = host?.closest<HTMLElement>('.task-settings-body') ?? null;
    if (!host) return;
    const sections = [...host.querySelectorAll<HTMLElement>('.tg-chapter, .tg-hero')];
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) entry.target.setAttribute('data-in', '');
      },
      { root: scroller, threshold: 0.18 },
    );
    for (const section of sections) {
      reveal.observe(section);
    }
    // The chapter being read is the last one whose top has passed a third of the pane; at the
    // very end it is the last chapter, however short.
    const scrolled = () => {
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      setProgress(max > 0 ? scroller.scrollTop / max : 0);
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
      let current = sections[0];
      for (const section of sections)
        if (section.getBoundingClientRect().top <= line) current = section;
      if (max > 0 && scroller.scrollTop >= max - 2) current = sections.at(-1);
      if (current) setActive(current.id.slice(3));
    };
    scroller?.addEventListener('scroll', scrolled, { passive: true });
    scrolled();
    return () => {
      reveal.disconnect();
      scroller?.removeEventListener('scroll', scrolled);
    };
  }, []);

  const jump = (id: string) => {
    const target = root.current?.querySelector<HTMLElement>(`#tg-${id}`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };
  const rail = [{ id: 'start', short: '三步上手' }, ...list];
  const activeIndex = Math.max(
    0,
    rail.findIndex((c) => c.id === active),
  );

  return (
    <div className="tg" ref={root}>
      <div className="tg-progress" style={{ '--p': progress } as CSSProperties} />
      <nav className="tg-rail" aria-label="指南目录">
        <span
          className="tg-rail-marker"
          style={{ '--i': activeIndex } as CSSProperties}
          aria-hidden="true"
        />
        {rail.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className="tg-rail-item"
            aria-current={c.id === active}
            onClick={() => jump(c.id)}
          >
            <span className="tg-rail-no mono">{String(i).padStart(2, '0')}</span>
            {c.short}
          </button>
        ))}
      </nav>

      <div className="tg-flow">
        <section className="tg-hero" id="tg-start" aria-labelledby="tg-start-title">
          <span className="tg-eyebrow">
            <TaskIcon name="book" /> 使用指南
          </span>
          <h2 id="tg-start-title">在写作的地方，管理要做的事</h2>
          <p className="tg-hero-lead">
            任务就存在你的文件夹里，是普通的 Markdown 文件：和笔记一起同步、一起版本管理，离开
            MarkLyra 也能读。
          </p>
          <div className="tg-figure hero">
            <HeroFigure />
          </div>
          <ol className="tg-steps">
            {[
              {
                title: '建一个项目',
                text: '给它起名和 key，任务会按 key 编号。',
                run: 'newProject' as const,
                label: '新建项目',
              },
              {
                title: '记下第一件事',
                text: '任何地方按 C，或用菜单“新建任务”。',
                keys: ['C'],
                run: 'newTask' as const,
                label: '新建任务',
              },
              {
                title: '推进它',
                text: '在列表中按 S 改状态，数字键直接选择。',
                keys: ['S', '3'],
                run: 'openAll' as const,
                label: '打开列表',
              },
            ].map((step, i) => (
              <li key={step.title} style={{ '--i': i } as CSSProperties}>
                <span className="tg-step-no mono">{i + 1}</span>
                <b>{step.title}</b>
                <span className="tg-step-text">
                  {step.text}
                  {step.keys && <Keys keys={step.keys} />}
                </span>
                <button type="button" className="tg-step-try" onClick={actions[step.run]}>
                  {step.label}
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="tg-hint">
            <Keys keys={[MOD, ALT, 'T']} /> 随时在文档与任务之间切换
          </p>
        </section>

        {list.map((data, i) => (
          <Chapter key={data.id} data={data} index={i} actions={actions} />
        ))}

        <footer className="tg-end">
          <TaskIcon name="check" />
          <span>忘了快捷键时，把鼠标停在按钮上就能看到提示。</span>
        </footer>
      </div>
    </div>
  );
}
