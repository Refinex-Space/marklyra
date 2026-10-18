import type { MarkLyraCommand } from '@marklyra/editor-runtime';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';

const groups: { label: string; items: [string, MarkLyraCommand][] }[] = [
  {
    label: '段落',
    items: [
      ['正文', { type: 'heading', level: 0 }],
      ['一级标题', { type: 'heading', level: 1 }],
      ['二级标题', { type: 'heading', level: 2 }],
      ['三级标题', { type: 'heading', level: 3 }],
      ['四级标题', { type: 'heading', level: 4 }],
      ['五级标题', { type: 'heading', level: 5 }],
      ['六级标题', { type: 'heading', level: 6 }],
    ],
  },
  {
    label: '行内格式',
    items: [
      ['删除线', { type: 'format', style: 'del' }],
      ['下划线', { type: 'format', style: 'underline' }],
      ['行内代码', { type: 'format', style: 'code' }],
      ['行内公式', { type: 'format', style: 'inline_math' }],
      ['链接', { type: 'format', style: 'link' }],
    ],
  },
  {
    label: '列表与引用',
    items: [
      ['无序列表', { type: 'list', style: 'ul' }],
      ['有序列表', { type: 'list', style: 'ol' }],
      ['任务列表', { type: 'list', style: 'tasklist' }],
      ['引用', { type: 'list', style: 'blockquote' }],
      ['分隔线', { type: 'horizontalRule' }],
    ],
  },
  {
    label: '编辑与视图',
    items: [
      ['撤销', { type: 'undo' }],
      ['重做', { type: 'redo' }],
      ['查找和替换', { type: 'find', replace: true }],
      ['专注模式', { type: 'toggleFocus' }],
      ['打字机模式', { type: 'toggleTypewriter' }],
    ],
  },
];
export function CommandMenu({
  disabled,
  execute,
}: {
  disabled: boolean;
  execute: (value: MarkLyraCommand) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 80 });
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const resize = () => setOpen(false);
    window.addEventListener('resize', resize);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    const owner = root.current?.ownerDocument;
    const frameBlur = () => {
      if (owner?.activeElement?.tagName === 'IFRAME') setOpen(false);
    };
    window.addEventListener('blur', frameBlur);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', frameBlur);
    };
  }, [open]);
  return (
    <div className="command-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        title="段落与更多命令"
        aria-label="更多编辑命令"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const bounds = trigger.current?.getBoundingClientRect();
          if (bounds)
            setPosition({
              left: Math.max(12, Math.min(bounds.left, window.innerWidth - 552)),
              top: bounds.bottom + 5,
            });
          setOpen(!open);
        }}
      >
        <Icon name="more" />
        <span>更多</span>
      </button>
      {open && !disabled && (
        <fieldset className="command-menu-panel" style={position} aria-label="段落与编辑命令">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              {group.items.map(([label, command]) => (
                <button
                  type="button"
                  key={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    execute(command);
                  }}
                >
                  {label}
                </button>
              ))}
            </section>
          ))}
        </fieldset>
      )}
    </div>
  );
}
