import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { AgentDialog } from './AgentDialog.js';
import {
  attachmentSize,
  attachmentText,
  attachmentUrl,
  cachedAttachment,
  readAttachment,
} from './attachments.js';
import { ImageViewer } from './ImageViewer.js';
import type { Attachment, DraftAttachment } from './types.js';

export function AttachmentRail({
  values,
  recordId,
  rootPath,
  remove,
  report,
}: {
  values: (Attachment | DraftAttachment)[];
  recordId: string;
  rootPath: string;
  remove?: (id: string) => void;
  report: (error: string) => void;
}) {
  const [preview, setPreview] = useState<DraftAttachment | null>(null);
  const previewText = useMemo(() => (preview ? attachmentText(preview) : null), [preview]);
  return (
    <>
      <section
        className={`ai-attachment-rail${remove ? ' ai-attachment-drafts' : ''}`}
        aria-label={remove ? '待发送附件' : '消息附件'}
      >
        {values.map((value) => (
          <AttachmentItem
            key={value.id}
            value={value}
            recordId={recordId}
            rootPath={rootPath}
            {...(remove ? { remove } : {})}
            preview={setPreview}
            report={report}
          />
        ))}
      </section>
      {preview?.mimeType.startsWith('image/') ? (
        <ImageViewer value={preview} close={() => setPreview(null)} report={report} />
      ) : (
        preview && (
          <AgentDialog title={preview.name} close={() => setPreview(null)}>
            {previewText !== null ? (
              <pre className="ai-attachment-preview-text">{previewText?.slice(0, 200_000)}</pre>
            ) : (
              <p>此文件已作为附件保留，暂不支持在此预览。{attachmentSize(preview.size)}</p>
            )}
          </AgentDialog>
        )
      )}
    </>
  );
}
function AttachmentItem({
  value,
  recordId,
  rootPath,
  remove,
  preview,
  report,
}: {
  value: Attachment | DraftAttachment;
  recordId: string;
  rootPath: string;
  remove?: (id: string) => void;
  preview: (value: DraftAttachment) => void;
  report: (error: string) => void;
}) {
  const [loaded, setLoaded] = useState<DraftAttachment | undefined>(() =>
    'data' in value ? value : cachedAttachment(recordId, value.id),
  );
  const [failed, setFailed] = useState(false);
  const image = value.mimeType.startsWith('image/');
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState('data' in value);
  useEffect(() => {
    if ('data' in value) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting === true),
      { rootMargin: '200px' },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [value]);
  useEffect(() => {
    if (!visible && !('data' in value)) {
      setLoaded(undefined);
      return;
    }
    if (loaded || !image) return;
    let live = true;
    void readAttachment(rootPath, recordId, value).then(
      (data) => {
        if (live) setLoaded(data);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [loaded, image, rootPath, recordId, value, visible]);
  return (
    <div ref={element} className={`ai-attachment-item${image ? ' ai-attachment-image' : ''}`}>
      <button
        type="button"
        className="ai-attachment-open"
        title={`${value.name} · ${attachmentSize(value.size)}`}
        aria-label={`预览附件 ${value.name}`}
        onClick={(event) => {
          event.currentTarget.focus();
          void (loaded ? Promise.resolve(loaded) : readAttachment(rootPath, recordId, value)).then(
            (data) => {
              setLoaded(data);
              preview(data);
            },
            (error) => report(String(error)),
          );
        }}
      >
        {image && loaded ? (
          <img src={attachmentUrl(loaded)} alt={value.name} />
        ) : (
          <Icon name={image ? 'image' : 'document'} />
        )}
        <span>
          <strong>{value.name}</strong>
          <small>{failed ? '附件暂不可用' : attachmentSize(value.size)}</small>
        </span>
      </button>
      {remove && (
        <button
          className="ai-attachment-remove"
          type="button"
          aria-label={`移除附件 ${value.name}`}
          title="移除附件"
          onClick={() => remove(value.id)}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
