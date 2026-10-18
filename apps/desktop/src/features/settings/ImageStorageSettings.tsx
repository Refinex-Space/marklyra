import { useId, useState } from 'react';
import {
  filenameImageStorageFolder,
  previewImageStorageFolder,
  validateImageStorageFolder,
} from './image-storage.js';
import './image-storage.css';

type Choice = '' | '.' | 'assets' | '${filename}.assets' | 'custom';
const choiceFor = (value: string): Choice =>
  value === '' || value === '.' || value === 'assets' || value === filenameImageStorageFolder
    ? value
    : 'custom';

export function ImageStorageSettings({
  value,
  change,
}: {
  value: string;
  change: (folder: string) => void;
}) {
  const [choice, setChoice] = useState<Choice>(() => choiceFor(value));
  const [draft, setDraft] = useState(value);
  const locationId = useId();
  const customId = useId();
  const hintId = useId();
  const detailsId = useId();
  const errorId = useId();
  const validation = validateImageStorageFolder(draft);
  const preview = previewImageStorageFolder(choice === 'custom' ? draft : choice);
  const error = choice === 'custom' && !validation.valid ? validation.message : '';
  return (
    <fieldset className="image-storage-settings">
      <legend>图片</legend>
      <div className="preference-row">
        <label htmlFor={locationId}>图片保存位置</label>
        <select
          id={locationId}
          value={choice}
          aria-describedby={detailsId}
          onChange={(event) => {
            const next = event.target.value as Choice;
            setChoice(next);
            if (next !== 'custom') {
              setDraft(next);
              change(next);
            } else setDraft(value);
          }}
        >
          <option value="">不复制图片</option>
          <option value=".">文档所在目录</option>
          <option value="assets">assets 文件夹</option>
          <option value={filenameImageStorageFolder}>与文档同名的文件夹</option>
          <option value="custom">自定义目录</option>
        </select>
      </div>
      {choice === 'custom' && (
        <div className="image-storage-custom">
          <label htmlFor={customId}>自定义图片目录</label>
          <input
            id={customId}
            type="text"
            value={draft}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="例如 images/notes"
            aria-invalid={!!error}
            aria-describedby={
              error ? `${hintId} ${errorId} ${detailsId}` : `${hintId} ${detailsId}`
            }
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              const result = validateImageStorageFolder(next);
              if (result.valid) change(result.folder);
            }}
          />
          <small id={hintId}>{'可用 ${filename} 表示不带扩展名的文档名。'}</small>
        </div>
      )}
      {error && (
        <p id={errorId} className="image-storage-error" role="alert">
          {error} 当前保存位置仍为 {value === '.' ? '文档所在目录' : `${value}/`}。
        </p>
      )}
      <div className="image-storage-preview" aria-live="polite">
        <span>以「笔记.md」为例</span>
        <output aria-label="图片目录预览">{preview ?? '等待有效的目录名称'}</output>
      </div>
      <p id={detailsId} className="image-storage-help">
        导入的图片按设置复制到该位置。未命名文稿的图片先放入应用暂存区，保存时可选择复制。
        正文模式优先使用文档中指定的图片目录；更改设置不会移动已有图片。
      </p>
    </fieldset>
  );
}
