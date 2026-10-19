import { useEffect, useRef, useState } from 'react';
import { AgentDialog } from './AgentDialog.js';
import { agentApi } from './api.js';
import { attachmentUrl } from './attachments.js';
import {
  drawMarks,
  fitImage,
  type ImageMark,
  type ImagePoint,
  imagePoint,
  validImageSize,
} from './image-preview.js';
import type { DraftAttachment } from './types.js';

import './image-viewer.css';

type Tool = 'view' | 'draw' | 'comment' | 'resize';
function ViewerIcon({ name }: { name: string }) {
  return (
    <span
      className="ai-viewer-symbol"
      style={{ maskImage: `url(/icons/image-viewer/${name}.svg)` }}
      aria-hidden="true"
    />
  );
}
export function ImageViewer({
  value,
  close,
  report,
}: {
  value: DraftAttachment;
  close: () => void;
  report: (error: string) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const commentInput = useRef<HTMLInputElement>(null);
  const resizeInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [area, setArea] = useState({ width: 1, height: 1 });
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState('fit');
  const [tool, setTool] = useState<Tool>('view');
  const [marks, setMarks] = useState<ImageMark[]>([]);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const drawing = useRef<ImagePoint[] | null>(null);
  const [comment, setComment] = useState('');
  const [commentPoint, setCommentPoint] = useState<ImagePoint | null>(null);
  const [dimensions, setDimensions] = useState({ width: '', height: '' });
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const revisions = useRef<
    { marks: ImageMark[]; size: { width: number; height: number } | null }[]
  >([]);
  const commit = (nextMarks: ImageMark[], nextSize: { width: number; height: number } | null) => {
    revisions.current.push({ marks: marksRef.current, size });
    if (revisions.current.length > 100) revisions.current.shift();
    setMarks(nextMarks);
    setSize(nextSize);
  };
  const [exported, setExported] = useState('');
  const undo = () => {
    const previous = revisions.current.pop();
    if (previous) {
      setMarks(previous.marks);
      setSize(previous.size);
      setNotice('已撤销上一步');
      stage.current?.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    if (!notice || busy) return;
    const timer = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [notice, busy]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'z' ||
        event.shiftKey ||
        event.isComposing ||
        busy ||
        discard
      )
        return;
      if (
        stage.current?.closest('dialog') !== [...document.querySelectorAll('dialog[open]')].at(-1)
      )
        return;
      if (
        (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = revisions.current.pop();
      if (previous) {
        setMarks(previous.marks);
        setSize(previous.size);
        setNotice('已撤销上一步');
        stage.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [busy, discard]);
  const current = size ?? natural;
  const saved = JSON.stringify({ marks, size });
  const pendingComment = !!commentPoint && !!comment.trim();
  const pendingSize =
    tool === 'resize' &&
    (Number(dimensions.width) !== current.width || Number(dimensions.height) !== current.height);
  const dirty =
    pendingComment || pendingSize || ((marks.length > 0 || size !== null) && saved !== exported);
  const scale = natural.width ? (zoom === 'fit' ? fitImage(current, area) : Number(zoom)) : 1;
  scaleRef.current = scale;
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(
        String(Math.max(0.1, Math.min(4, scaleRef.current * (event.deltaY > 0 ? 0.9 : 1.1)))),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const url = attachmentUrl(value);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  };
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setArea({
        width: Math.max(1, element.clientWidth - 48),
        height: Math.max(1, Math.min(element.clientHeight - 48, window.innerHeight * 0.62)),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const paint = (pending?: ImagePoint[]) => {
    const target = canvas.current;
    if (!target || !natural.width) return;
    if (target.width !== current.width) target.width = current.width;
    if (target.height !== current.height) target.height = current.height;
    const context = target.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, target.width, target.height);
    drawMarks(
      context,
      [
        ...marksRef.current,
        ...(pending ? [{ kind: 'stroke' as const, color: '#e24444', points: pending }] : []),
      ],
      target.width,
      target.height,
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: paint reads the resident overlay and current mark list through refs.
  useEffect(() => {
    paint();
  }, [marks, current.width, current.height]);
  const position = (event: { clientX: number; clientY: number }) =>
    imagePoint(
      { x: event.clientX, y: event.clientY },
      surface.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 },
    );
  const endStroke = () => {
    const points = drawing.current;
    drawing.current = null;
    if (points?.length) {
      commit([...marksRef.current, { kind: 'stroke', color: '#e24444', points }], size);
      setNotice('已添加标注');
    }
  };
  const output = async () => {
    if (!natural.width || !image.current) throw new Error('图片尚未加载');
    if (!marks.length && !size)
      return { name: value.name, mimeType: value.mimeType, data: value.data };
    if (!validImageSize(current.width, current.height))
      throw new Error('图片尺寸无效或超过 1600 万像素限制');
    const target = document.createElement('canvas');
    target.width = current.width;
    target.height = current.height;
    const context = target.getContext('2d');
    if (!context) throw new Error('图片处理暂不可用');
    context.drawImage(image.current, 0, 0, target.width, target.height);
    drawMarks(context, marks, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => target.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 16 * 1024 * 1024)
      throw new Error('修改后图片超过 16 MiB，请减小尺寸后保存');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('无法读取图片结果'));
      reader.readAsDataURL(blob);
    });
    return {
      name: `${value.name.replace(/\.[^.]+$/, '')}-edited.png`,
      mimeType: 'image/png',
      data,
    };
  };
  const exportImage = async (action: 'save' | 'open') => {
    if (busy) return;
    if (pendingComment || pendingSize) {
      setError(
        pendingComment ? '请先点击“添加”完成评论，再导出图片' : '请先应用尺寸调整，再导出图片',
      );
      return;
    }
    setBusy(true);
    setNotice(action === 'save' ? '正在准备保存…' : '正在打开图片副本…');
    setError('');
    try {
      const upload = await output();
      const result = await agentApi.invoke<boolean>('agent_preview_image', { upload, action });
      if (result) {
        setExported(saved);
        setNotice(action === 'save' ? '图片已保存' : '已在默认应用打开图片副本');
      } else setNotice('已取消保存');
    } catch (error) {
      setError(String(error));
      report(String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (commentPoint) commentInput.current?.focus({ preventScroll: true });
  }, [commentPoint]);
  useEffect(() => {
    if (tool === 'resize') resizeInput.current?.focus({ preventScroll: true });
  }, [tool]);
  const changeTool = (next: Tool) => {
    if (pendingComment && commentPoint && marks.length < 100)
      commit(
        [
          ...marksRef.current,
          { kind: 'comment', color: '#d73c3c', point: commentPoint, text: comment.trim() },
        ],
        size,
      );
    setComment('');
    setTool(tool === next ? 'view' : next);
    setCommentPoint(null);
    setError('');
    if (next === 'resize')
      setDimensions({ width: String(current.width), height: String(current.height) });
  };
  return (
    <AgentDialog title={value.name} viewer busy={busy || discard} close={requestClose}>
      <header className="ai-viewer-topbar">
        <div className="ai-viewer-file" title={value.name}>
          <ViewerIcon name="photo" />
          <span>{value.name}</span>
        </div>
        <div className="ai-viewer-actions">
          <label className="ai-viewer-zoom" title={`缩放 ${Math.round(scale * 100)}%`}>
            <select
              aria-label="图片缩放"
              value={zoom}
              onChange={(event) => setZoom(event.target.value)}
            >
              <option value="fit">
                {zoom === 'fit' ? `${Math.round(scale * 100)}%` : '适应窗口'}
              </option>
              {!['fit', '0.5', '1', '1.5', '2'].includes(zoom) && (
                <option value={zoom}>{Math.round(Number(zoom) * 100)}%</option>
              )}
              <option value="0.5">50%</option>
              <option value="1">100%</option>
              <option value="1.5">150%</option>
              <option value="2">200%</option>
            </select>
            <ViewerIcon name="chevron-down" />
          </label>
          <div className="ai-viewer-open-combo">
            {' '}
            <button
              type="button"
              title="在默认应用打开图片副本"
              disabled={busy || !natural.width}
              onClick={() => void exportImage('open')}
            >
              <ViewerIcon name="external-link" />
              <span>打开</span>
            </button>
            <label title="打开方式">
              <select
                aria-label="图片打开方式"
                value=""
                disabled={busy || !natural.width}
                onChange={(event) => {
                  if (event.target.value === 'open' || event.target.value === 'save')
                    void exportImage(event.target.value);
                }}
              >
                <option value="" disabled>
                  打开方式
                </option>
                <option value="open">在默认应用打开副本</option>
                <option value="save">另存为图片…</option>
              </select>
              <ViewerIcon name="chevron-down" />
            </label>
          </div>
          <button
            type="button"
            className="ai-viewer-icon-button"
            aria-label="下载图片"
            title="下载图片"
            disabled={busy || !natural.width}
            onClick={() => void exportImage('save')}
          >
            <ViewerIcon name="download" />
          </button>
          <button
            type="button"
            className="ai-viewer-icon-button"
            aria-label="关闭图片预览"
            title="关闭"
            disabled={busy}
            onClick={requestClose}
          >
            <ViewerIcon name="x" />
          </button>
        </div>
      </header>
      <div
        className={`ai-viewer-stage${tool !== 'view' ? ' ai-viewer-editing' : ''}`}
        ref={stage}
        role="application"
        aria-label="图片查看区域"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the image viewport supports arrow-key panning and Home to fit.
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-80, 0],
            ArrowRight: [80, 0],
            ArrowUp: [0, -80],
            ArrowDown: [0, 80],
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            event.currentTarget.scrollBy(direction[0], direction[1]);
          } else if (event.key === 'Home') {
            event.preventDefault();
            setZoom('fit');
          }
        }}
        onDoubleClick={() => {
          if (tool === 'view') setZoom(zoom === 'fit' ? '1' : 'fit');
        }}
        onPointerDown={(event) => {
          if (tool !== 'view' || event.button !== 0) return;
          pan.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pan.current) return;
          event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
          event.currentTarget.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
      >
        <div
          ref={surface}
          className="ai-viewer-surface"
          style={{
            width: current.width * scale,
            height: current.height * scale,
            visibility: natural.width ? 'visible' : 'hidden',
          }}
        >
          <img
            ref={image}
            src={url}
            alt={value.name}
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              if (!validImageSize(width, height)) {
                setError('图片尺寸超过预览限制');
                return;
              }
              setNatural({ width, height });
            }}
            onError={() => setError('图片加载失败，可关闭后重试')}
          />
          <canvas
            ref={canvas}
            className="ai-viewer-overlay"
            aria-label="图片标注画布"
            style={{ pointerEvents: tool === 'draw' || tool === 'comment' ? 'auto' : 'none' }}
            onPointerDown={(event) => {
              if (event.button !== 0 || busy || discard || marks.length >= 100) return;
              if (tool === 'comment') {
                if (pendingComment && commentPoint && marks.length < 100)
                  commit(
                    [
                      ...marksRef.current,
                      {
                        kind: 'comment',
                        color: '#d73c3c',
                        point: commentPoint,
                        text: comment.trim(),
                      },
                    ],
                    size,
                  );
                setCommentPoint(position(event));
                setComment('');
                return;
              }
              if (tool === 'draw') {
                event.currentTarget.setPointerCapture(event.pointerId);
                drawing.current = [position(event)];
                paint(drawing.current);
              }
            }}
            onPointerMove={(event) => {
              if (!drawing.current || drawing.current.length >= 2000) return;
              drawing.current.push(position(event));
              paint(drawing.current);
            }}
            onPointerUp={endStroke}
            onPointerCancel={() => {
              drawing.current = null;
              paint();
            }}
          />
        </div>
      </div>
      {error && (
        <p className="ai-viewer-notice ai-error" role="alert">
          {error}
        </p>
      )}
      {!error && notice && (
        <p className="ai-viewer-notice" role="status">
          {notice}
        </p>
      )}
      {tool === 'comment' && (
        <div className="ai-viewer-tool-options">
          <span>{commentPoint ? '为所选位置添加评论' : '点击图片，选择评论位置'}</span>
          {commentPoint && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim() || marks.length >= 100) return;
                commit(
                  [
                    ...marksRef.current,
                    {
                      kind: 'comment',
                      color: '#d73c3c',
                      point: commentPoint,
                      text: comment.trim(),
                    },
                  ],
                  size,
                );
                setCommentPoint(null);
                setComment('');
                setNotice('评论已添加到副本');
                stage.current?.focus({ preventScroll: true });
              }}
            >
              <input
                aria-label="图片评论"
                maxLength={120}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="写下评论…"
              />
              <button type="submit" disabled={!comment.trim()}>
                添加
              </button>
            </form>
          )}
        </div>
      )}
      {tool === 'draw' && (
        <div className="ai-viewer-tool-options">
          <span>拖动标注 · 修改仅保存在导出的副本中</span>
        </div>
      )}
      {tool === 'resize' && (
        <form
          className="ai-viewer-tool-options ai-viewer-resize"
          onSubmit={(event) => {
            event.preventDefault();
            const width = Number(dimensions.width),
              height = Number(dimensions.height);
            if (!validImageSize(width, height)) {
              setError('请输入有效尺寸，单边不超过 16384，且总量不超过 1600 万像素');
              return;
            }
            commit(
              marksRef.current,
              width === natural.width && height === natural.height ? null : { width, height },
            );
            setZoom('fit');
            setNotice(`尺寸已调整为 ${width} × ${height}`);
            setTool('view');
            stage.current?.focus({ preventScroll: true });
          }}
        >
          <label>
            宽
            <input
              type="number"
              aria-label="图片宽度"
              min="1"
              max="16384"
              value={dimensions.width}
              onChange={(event) => {
                const width = event.target.value;
                setDimensions({
                  width,
                  height:
                    locked && natural.width
                      ? String(
                          Math.max(1, Math.round((Number(width) * current.height) / current.width)),
                        )
                      : dimensions.height,
                });
              }}
            />
          </label>
          <label>
            高
            <input
              type="number"
              aria-label="图片高度"
              min="1"
              max="16384"
              value={dimensions.height}
              onChange={(event) => {
                const height = event.target.value;
                setDimensions({
                  height,
                  width:
                    locked && natural.height
                      ? String(
                          Math.max(
                            1,
                            Math.round((Number(height) * current.width) / current.height),
                          ),
                        )
                      : dimensions.width,
                });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={locked}
              onChange={(event) => setLocked(event.target.checked)}
            />
            锁定比例
          </label>
          <button type="submit">应用</button>
        </form>
      )}
      <footer className="ai-viewer-bottom">
        <div className="ai-viewer-tools" role="toolbar" aria-label="图片工具">
          <button
            type="button"
            aria-pressed={tool === 'draw'}
            disabled={busy || !natural.width || marks.length >= 100}
            onClick={() => changeTool('draw')}
          >
            <ViewerIcon name="pencil" />
            <span>标注</span>
          </button>
          <button
            type="button"
            aria-pressed={tool === 'comment'}
            disabled={busy || !natural.width || marks.length >= 100}
            onClick={() => changeTool('comment')}
          >
            <ViewerIcon name="message-circle" />
            <span>添加评论</span>
          </button>
          <button
            type="button"
            aria-pressed={tool === 'resize'}
            disabled={busy || !natural.width}
            onClick={() => changeTool('resize')}
          >
            <ViewerIcon name="arrows-maximize" />
            <span>调整大小</span>
          </button>
          {(marks.length > 0 || size) && (
            <button
              type="button"
              aria-label="撤销图片修改"
              title="撤销上一步"
              disabled={busy}
              onClick={undo}
            >
              <ViewerIcon name="arrow-back-up" />
            </button>
          )}
        </div>
      </footer>
      {discard && (
        <AgentDialog
          title="放弃图片修改"
          close={() => setDiscard(false)}
          footer={
            <>
              <button type="button" onClick={() => setDiscard(false)}>
                继续编辑
              </button>
              <button type="button" onClick={close}>
                放弃修改
              </button>
            </>
          }
        >
          <p>关闭并放弃尚未导出的修改？原始附件会保留。</p>
        </AgentDialog>
      )}
    </AgentDialog>
  );
}
