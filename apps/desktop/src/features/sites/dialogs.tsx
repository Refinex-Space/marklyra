import { type SyntheticEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import {
  type Site,
  type SiteGroup,
  type SiteMutation,
  type SiteMutationResult,
  type SitePreview,
  sites,
} from '../../services/sites.js';
import { Modal } from './Layer.js';
import type { SiteCatalog } from './model/catalog.js';
import { COLOR_NAMES, colorValue, GROUP_COLORS, isGroupColor } from './model/colors.js';
import { displayHost, hostKey, siteAddress } from './model/url.js';
import { SiteMark } from './SiteMark.js';

type Mutate = (mutation: SiteMutation) => Promise<SiteMutationResult | null>;

/** What a finished write means for a dialog: done, or the reason it stays open. */
function outcome(result: SiteMutationResult | null, problem: string | null): string | null {
  if (!result) return problem ?? '保存失败';
  if (result.conflicts.length) return '内容已在别处被修改，已载入最新内容，请检查后重试';
  return null;
}

type IconMode = 'auto' | 'letter' | 'upload';

export function SiteDialog({
  catalog,
  site,
  defaultGroup,
  mutate,
  problem,
  onClose,
  workspaceId,
  fetchMetadata,
  thirdParty,
  onReveal,
  iconSrc = null,
  fetching = false,
}: {
  catalog: SiteCatalog;
  /** Present when editing. */
  site?: Site;
  defaultGroup: string | null;
  mutate: Mutate;
  problem: string | null;
  onClose(): void;
  workspaceId: string;
  fetchMetadata: boolean;
  thirdParty: string;
  onReveal(site: Site): void;
  /** The saved icon of the site being edited. */
  iconSrc?: string | null;
  /** The host is fetching this site's details right now. */
  fetching?: boolean;
}) {
  const ids = useId();
  const [url, setUrl] = useState(site?.url ?? '');
  const [title, setTitle] = useState(site?.title ?? '');
  const [description, setDescription] = useState(site?.description ?? '');
  // Typed in this dialog: from then on a fetch never replaces the field.
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [group, setGroup] = useState<string | null>(site ? site.group : defaultGroup);
  const [pinned, setPinned] = useState(site?.pinned ?? false);
  const [iconMode, setIconMode] = useState<IconMode>(
    site?.manual.includes('icon') && !site.icon ? 'letter' : 'auto',
  );
  const [upload, setUpload] = useState<{ bytes: number[]; mime: string; url: string } | null>(null);
  const [preview, setPreview] = useState<SitePreview | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (upload) URL.revokeObjectURL(upload.url);
    },
    [upload],
  );

  const address = siteAddress(url);
  const duplicate =
    address &&
    catalog.items.find(
      (s) => s.id !== site?.id && hostKey(s.url) === hostKey(address) && samePath(s.url, address),
    );

  const touched = useRef({ title: titleTouched, description: descriptionTouched });
  touched.current = { title: titleTouched, description: descriptionTouched };
  /** The latest preview request; an older answer never replaces a newer one. */
  const request = useRef(0);
  const runPreview = useCallback(
    (target: string, fresh: boolean) => {
      const mine = ++request.current;
      setPreviewState('loading');
      void sites.preview(workspaceId, target, thirdParty, fresh).then(
        (result) => {
          if (mine !== request.current) return;
          setPreview(result);
          setPreviewState('ready');
          if (!touched.current.title) setTitle(result.title);
          if (!touched.current.description && result.description)
            setDescription(result.description);
        },
        () => {
          if (mine === request.current) setPreviewState('failed');
        },
      );
    },
    [thirdParty, workspaceId],
  );
  // The saved site's details are what an edit starts from. When a fetch updates them while
  // the dialog is open, the fields that were not typed in follow.
  const editingSaved = !!site && address === site.url;
  const savedTitle = site?.title;
  const savedDescription = site?.description;
  useEffect(() => {
    if (savedTitle !== undefined && !touched.current.title) setTitle(savedTitle);
  }, [savedTitle]);
  useEffect(() => {
    if (savedDescription !== undefined && !touched.current.description)
      setDescription(savedDescription);
  }, [savedDescription]);
  useEffect(() => {
    // Editing without changing the address has nothing new to fetch on its own.
    if (!fetchMetadata || !address || iconMode === 'letter' || editingSaved) {
      request.current += 1;
      setPreviewState('idle');
      return;
    }
    const handle = window.setTimeout(() => runPreview(address, false), 400);
    return () => window.clearTimeout(handle);
  }, [address, fetchMetadata, iconMode, editingSaved, runPreview]);
  /** 重新获取: the saved site is fetched again by the host; a new address is previewed fresh. */
  const refetch = () => {
    if (!address) return;
    if (site && editingSaved) {
      void sites.refetch(workspaceId, [site.id], thirdParty, true).catch(() => {});
      return;
    }
    runPreview(address, true);
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!address) {
      setError('请输入有效的网址，例如 https://example.com');
      return;
    }
    setBusy(true);
    setError(null);
    let result: SiteMutationResult | null;
    if (site) {
      const set: Record<string, unknown> = {};
      if (address !== site.url) set.url = address;
      if (title.trim() !== site.title) set.title = title;
      if (description.trim() !== site.description) set.description = description;
      if (group !== site.group) set.group = group;
      if (pinned !== site.pinned) set.pinned = pinned;
      result = Object.keys(set).length
        ? await mutate({ kind: 'updateItem', id: site.id, revision: site.revision, set })
        : { generation: 0, applied: [], conflicts: [], created: [] };
    } else {
      const manual = [
        ...(titleTouched && title.trim() ? ['title'] : []),
        ...(descriptionTouched && description.trim() ? ['description'] : []),
      ];
      result = await mutate({
        kind: 'addItem',
        url: address,
        group,
        ...(title.trim() ? { title } : {}),
        ...(description.trim() ? { description } : {}),
        pinned,
        manual,
      });
    }
    if (result && !result.conflicts.length) {
      const created = site?.id ?? result.created[0];
      const switchedToAuto = !!site?.manual.includes('icon') && iconMode === 'auto';
      if (created && (!site || iconMode !== 'auto' || switchedToAuto)) {
        await applyIcon(workspaceId, created, iconMode, upload, fetchMetadata, thirdParty);
      }
    }
    const failure = outcome(result, problem);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Modal label={site ? '编辑站点' : '添加站点'} close={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h3 className="site-dialog-title">{site ? '编辑站点' : '添加站点'}</h3>
        <div className="site-field">
          <label htmlFor={`${ids}-url`}>网址</label>
          <input
            id={`${ids}-url`}
            className="site-input"
            value={url}
            placeholder="https://example.com"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error && !address ? true : undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
          />
        </div>
        {duplicate && (
          <p className="site-note warn" role="status">
            该网址已在「{catalog.pathOf(duplicate.group)}」中，仍可以再添加一份。
            <button type="button" className="site-link" onClick={() => onReveal(duplicate)}>
              查看
            </button>
          </p>
        )}
        {address && (previewState !== 'idle' || upload || editingSaved) && (
          <div className="site-preview">
            {previewState === 'loading' ? (
              <Skeleton className="site-preview-skeleton" label="正在读取网站信息">
                <SkeletonBar width={40} height={40} radius={10} />
                <span>
                  <SkeletonBar width="46%" height={12} />
                  <SkeletonBar width="28%" height={9} />
                </span>
              </Skeleton>
            ) : (
              <>
                <SiteMark
                  title={title || displayHost(address)}
                  color={catalog.groupById.get(group ?? '')?.color ?? 'gray'}
                  size="lg"
                  src={
                    iconMode === 'letter'
                      ? null
                      : (upload?.url ?? (editingSaved ? iconSrc : (preview?.iconDataUrl ?? null)))
                  }
                  fetching={editingSaved && fetching}
                />
                <span className="site-preview-text">
                  <strong>{title || displayHost(address)}</strong>
                  <em>{displayHost(address)}</em>
                  {previewState === 'failed' ? (
                    <small>未能获取网站信息，可以重新获取或手动填写</small>
                  ) : editingSaved ? (
                    site?.description && <small>{site.description}</small>
                  ) : (
                    preview?.description && <small>{preview.description}</small>
                  )}
                </span>
                {fetchMetadata && (
                  <button
                    type="button"
                    className="site-btn quiet small"
                    disabled={editingSaved && fetching}
                    onClick={refetch}
                  >
                    <Icon name="refresh" />
                    重新获取
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div className="site-field">
          <label htmlFor={`${ids}-title`}>名称</label>
          <input
            id={`${ids}-title`}
            className="site-input"
            value={title}
            placeholder={address ? '留空则使用网址的域名' : ''}
            onChange={(event) => {
              setTitleTouched(true);
              setTitle(event.target.value);
            }}
          />
        </div>
        <div className="site-field top">
          <label htmlFor={`${ids}-desc`}>描述</label>
          <textarea
            id={`${ids}-desc`}
            className="site-input"
            rows={3}
            value={description}
            onChange={(event) => {
              setDescriptionTouched(true);
              setDescription(event.target.value);
            }}
          />
        </div>
        <div className="site-field">
          <label htmlFor={`${ids}-group`}>分组</label>
          <div className="site-field-row">
            <select
              id={`${ids}-group`}
              className="site-input"
              value={group ?? ''}
              onChange={(event) => setGroup(event.target.value || null)}
            >
              <option value="">未分组</option>
              {catalog.roots.flatMap((root) => [
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>,
                ...catalog.children(root.id).map((child) => (
                  <option key={child.id} value={child.id}>
                    {'　'}
                    {child.name}
                  </option>
                )),
              ])}
            </select>
            <label className="site-check">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) => setPinned(event.target.checked)}
              />
              设为常用
            </label>
          </div>
        </div>
        <div className="site-field">
          <span id={`${ids}-icon`}>图标</span>
          <div className="site-field-row">
            <div className="site-choice" role="radiogroup" aria-labelledby={`${ids}-icon`}>
              {(
                [
                  ['auto', '自动获取'],
                  ['upload', '上传图片'],
                  ['letter', '字母标'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="site-choice-option">
                  <input
                    type="radio"
                    name={`${ids}-icon`}
                    checked={iconMode === value}
                    onChange={() => setIconMode(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {iconMode === 'upload' && (
              <label className="site-btn small site-file">
                {upload ? '更换图片…' : '选择图片…'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.ico"
                  aria-label="上传图标"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_500_000) {
                      setError('图片不能超过 1.5 MB');
                      return;
                    }
                    void file.arrayBuffer().then((buffer) => {
                      const bytes = [...new Uint8Array(buffer)];
                      const url = URL.createObjectURL(file);
                      setUpload({ bytes, mime: file.type || 'application/octet-stream', url });
                      setError(null);
                    });
                  }}
                />
              </label>
            )}
          </div>
        </div>
        {error && (
          <p className="site-note error" role="alert">
            {error}
          </p>
        )}
        <div className="site-dialog-foot">
          <span className="site-spacer" />
          <button type="button" className="site-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="site-btn primary" disabled={busy}>
            {site ? '保存' : '添加'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

async function applyIcon(
  workspaceId: string,
  id: string,
  mode: IconMode,
  upload: { bytes: number[]; mime: string } | null,
  fetchMetadata: boolean,
  thirdParty: string,
) {
  const snapshot = await sites.snapshot(workspaceId);
  const saved = snapshot.items.find((item) => item.id === id);
  if (!saved) return;
  if (mode === 'letter') {
    await sites.setIcon(workspaceId, saved.id, saved.revision, { kind: 'letter' });
  } else if (mode === 'upload' && upload) {
    await sites.setIcon(workspaceId, saved.id, saved.revision, {
      kind: 'upload',
      bytes: upload.bytes,
      mime: upload.mime,
    });
  } else if (mode === 'auto') {
    if (saved.manual.includes('icon')) {
      const cleared = await sites.setIcon(workspaceId, saved.id, saved.revision, { kind: 'auto' });
      if (!cleared.applied.length) return;
    }
    if (fetchMetadata) await sites.enrich(workspaceId, saved.id, thirdParty).catch(() => {});
  }
}

const samePath = (a: string, b: string) => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && x.search === y.search;
  } catch {
    return false;
  }
};

export function GroupDialog({
  group,
  parent,
  catalog,
  mutate,
  problem,
  onClose,
}: {
  /** Present when editing. */
  group?: SiteGroup;
  /** The parent of a group being created. */
  parent?: SiteGroup;
  catalog: SiteCatalog;
  mutate: Mutate;
  problem: string | null;
  onClose(): void;
}) {
  const ids = useId();
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState<string>(
    group?.color ??
      GROUP_COLORS[catalog.snapshot.groups.length % (GROUP_COLORS.length - 1)] ??
      'blue',
  );
  const [custom, setCustom] = useState(group && /^#/.test(group.color) ? group.color : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = group ? '编辑分组' : parent ? `新建「${parent.name}」的子分组` : '新建分组';

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError('请输入分组名称');
      return;
    }
    if (!isGroupColor(color)) {
      setError('颜色格式应为 #rrggbb');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await (group
      ? name.trim() === group.name && color === group.color
        ? Promise.resolve({ generation: 0, applied: [], conflicts: [], created: [] })
        : mutate({
            kind: 'updateGroup',
            id: group.id,
            revision: group.revision,
            set: { name, color },
          })
      : mutate({ kind: 'addGroup', name, color, parent: parent?.id ?? null }));
    const failure = outcome(result, problem);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <Modal label={title} close={onClose} className="small">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h3 className="site-dialog-title">{title}</h3>
        <div className="site-field">
          <label htmlFor={`${ids}-name`}>名称</label>
          <input
            id={`${ids}-name`}
            className="site-input"
            value={name}
            maxLength={60}
            placeholder="例如：常用工具"
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="site-field">
          <span id={`${ids}-color`}>颜色</span>
          <div className="site-swatches" role="radiogroup" aria-labelledby={`${ids}-color`}>
            {GROUP_COLORS.map((c) => (
              <label key={c} className="site-swatch" style={{ background: colorValue(c) }}>
                <input
                  type="radio"
                  name={`${ids}-color`}
                  checked={color === c}
                  aria-label={COLOR_NAMES[c]}
                  onChange={() => {
                    setColor(c);
                    setError(null);
                  }}
                />
              </label>
            ))}
            {/* The last swatch opens the system colour picker; once used it shows that colour. */}
            <label
              className={`site-swatch picker${custom ? ' filled' : ''}`}
              style={custom ? { background: custom } : undefined}
              title={custom ? `自定义颜色 ${custom}` : '自定义颜色'}
            >
              <input
                type="color"
                aria-label="自定义颜色"
                data-checked={color === custom && custom !== '' ? 'true' : undefined}
                value={custom || '#2f74d0'}
                onChange={(event) => {
                  const value = event.target.value.toLowerCase();
                  setCustom(value);
                  setColor(value);
                  setError(null);
                }}
              />
            </label>
          </div>
        </div>
        {error && (
          <p className="site-note error" role="alert">
            {error}
          </p>
        )}
        <div className="site-dialog-foot">
          <span className="site-spacer" />
          <button type="button" className="site-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="site-btn primary" disabled={busy}>
            {group ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RemoveGroupDialog({
  group,
  count,
  hasChildren,
  onChoose,
  onClose,
}: {
  group: SiteGroup;
  /** Sites in the group and its children. */
  count: number;
  hasChildren: boolean;
  onChoose(items: 'ungroup' | 'delete'): void;
  onClose(): void;
}) {
  return (
    <Modal label={`删除分组「${group.name}」`} close={onClose} className="small">
      <h3 className="site-dialog-title">删除分组「{group.name}」？</h3>
      <p className="site-dialog-text">
        {hasChildren ? '这个分组及其子分组' : '这个分组'}中有 {count} 个站点。
        {count ? '选择如何处理它们；删除站点无法撤销。' : ''}
      </p>
      <div className="site-dialog-foot wrap">
        {/* The safe choice is first, so it holds the initial focus. */}
        <button type="button" className="site-btn" onClick={onClose}>
          返回
        </button>
        <span className="site-spacer" />
        {count > 0 && (
          <button
            type="button"
            className="site-btn"
            onClick={() => {
              onClose();
              onChoose('ungroup');
            }}
          >
            删除分组，站点移到未分组
          </button>
        )}
        <button
          type="button"
          className="site-btn danger"
          onClick={() => {
            onClose();
            onChoose(count ? 'delete' : 'ungroup');
          }}
        >
          {count ? `删除分组和 ${count} 个站点` : '删除分组'}
        </button>
      </div>
    </Modal>
  );
}
