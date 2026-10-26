import { type MarkLyraEditor, rewriteImageReferences } from '@marklyra/editor-runtime';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { DAILY_EXISTS, type DailyLocation, dailyNotes } from '../../services/daily.js';
import {
  type ChangedDocument,
  type DocumentFile,
  type DocumentMetadata,
  desktopAvailable,
  documents,
  type SavedDocumentPreview,
} from '../../services/documents.js';
import { filePreferences } from '../../services/file-preferences.js';
import { imageEpoch, recordImageEpoch } from '../../services/image-epochs.js';
import { relocationImageReferences } from '../../services/image-relocation.js';
import {
  activateImageOwner,
  closeUntitledImageOwner,
  createUntitledImageOwner,
  fenceImageSave,
  imageSaves,
  provisionalImageSources,
  setDraftImageHandoff,
} from '../../services/images.js';
import { recentFiles } from '../../services/recent.js';
import {
  type DraftContent,
  fallbackRecovery,
  type RecoveryDraft,
  recovery,
} from '../../services/recovery.js';
import { RecoveryFallback } from '../../services/recovery-fallback.js';
import { type WorkspaceMatchPosition, workspaces } from '../../services/workspaces.js';
import { readPreferences } from '../settings/preferences.js';
import { effectiveSaveFileOnSwitch } from '../settings/runtime-preferences/file-preferences.js';
import { RecoveryJournal } from './recovery-journal.js';
import { STALE_SEARCH_POSITION, searchPositionIsCurrent } from './search-position.js';
export type DocumentAction =
  | { kind: 'open' }
  | { kind: 'native-input'; document: DocumentFile }
  | { kind: 'new' }
  | { kind: 'close' }
  | { kind: 'recover'; id: string; version: number; associate: boolean }
  | { kind: 'recent'; id: string }
  | {
      kind: 'workspace';
      workspaceId: string;
      relativePath: string;
      match?: WorkspaceMatchPosition | undefined;
    }
  | { kind: 'daily'; location: DailyLocation; key: string; template: string };
/** A day without a file: an untitled draft that is created at its fixed path on first save. */
export interface DailyDraft {
  location: DailyLocation;
  key: string;
}
const DAILY_CONFLICT =
  '该日日程已在磁盘上创建（可能来自同步或其他窗口），未覆盖。当前内容保留为未命名草稿，请打开已有日程后合并。';
interface SaveAttempt {
  source: string | null;
  revision?: number;
}
export interface DocumentCheckpoint {
  id: string;
  source: string;
  revision: number;
}
function draft(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function useDocumentSession(
  editor: MutableRefObject<MarkLyraEditor | null>,
  closeWindow: () => Promise<void>,
  draftKey = 'marklyra-draft',
  closeCancelled?: () => void,
  beforeEditorRead?: () => Promise<void>,
  onRecentOpened?: (documentId: string) => void,
) {
  const initial = useRef(desktopAvailable ? '' : (draft(draftKey) ?? ''));
  const restored = useRef(!desktopAvailable && draft(draftKey) !== null);
  const source = useRef(initial.current);
  const saved = useRef(restored.current ? '' : initial.current);
  const current = useRef<DocumentFile | null>(null);
  const imageContext = useRef<string | null>(null);
  const imageContextDraft = useRef(false);
  const metadata = useRef(new Map<string, DocumentMetadata>());
  const uncertainDocuments = useRef(new Set<string>());
  const documentOwner = useRef<object>({});
  const loadingImages = useRef<{ id: string; runtime: MarkLyraEditor } | null>(null);
  const restoredMetadata = useRef<DraftContent['document']>(null);
  const busy = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const savingAttempt = useRef<SaveAttempt | null>(null);
  const autoSaveFailureSource = useRef<string | null>(null);
  const saveAgain = useRef(false);
  const saveLifetime = useRef(0);
  const saveMounted = useRef(false);
  useEffect(() => {
    saveMounted.current = true;
    saveLifetime.current++;
    return () => {
      saveMounted.current = false;
      saveLifetime.current++;
    };
  }, []);
  const replacing = useRef(false);
  const reloadingView = useRef(false);
  const daily = useRef<DailyDraft | null>(null);
  const [dailyDraft, setDailyDraftState] = useState<DailyDraft | null>(null);
  const setDailyDraft = (value: DailyDraft | null) => {
    daily.current = value;
    setDailyDraftState(value);
  };
  const [file, setFile] = useState<DocumentFile | null>(null);
  const [savedPreview, setSavedPreview] = useState<SavedDocumentPreview>();
  const [dirty, setDirty] = useState(restored.current && source.current !== '');
  const [working, setWorking] = useState(false);
  const [imageRelocation, setImageRelocation] = useState<{
    id: string;
    previousPath: string;
    path: string;
    metadataRevision: number;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [snapshot, setSnapshot] = useState(source.current);
  const [pending, setPending] = useState<DocumentAction | null>(null);
  const pendingRef = useRef<DocumentAction | null>(null);
  const journal = useRef<RecoveryJournal | null>(null);
  const fallback = useRef<RecoveryFallback | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(!desktopAvailable);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly reruns the native ownership handshake.
  useEffect(() => {
    if (!desktopAvailable) return;
    let active = true;
    void fallbackRecovery
      .context()
      .then((context) => {
        if (!active) return;
        fallback.current ??= new RecoveryFallback(localStorage, context.owner);
        setRecoveryError('');
        setMessage((message) => (message.startsWith('恢复保护尚未就绪：') ? '' : message));
        setRecoveryReady(true);
      })
      .catch((error: unknown) => {
        if (active) {
          const message = `恢复保护尚未就绪：${String(error)}。本地草稿保持原样。`;
          setRecoveryError(message);
          setMessage(message);
        }
      });
    return () => {
      active = false;
    };
  }, [recoveryAttempt]);
  if (desktopAvailable && !journal.current)
    journal.current = new RecoveryJournal(
      recovery,
      (error) => setMessage(`无法保存恢复副本：${String(error)}`),
      (content) => {
        try {
          fallback.current?.confirm(content);
        } catch (error) {
          setMessage(`原生副本已保存，本地副本清理失败：${String(error)}`);
        }
      },
      (warning) => setMessage(`正文恢复副本已保存；图片恢复信息未完成：${warning}`),
    );
  const protect = () => {
    if (replacing.current) return;
    const content: DraftContent = {
      text: source.current,
      savedText: saved.current,
      document: current.current
        ? { path: current.current.path, encoding: current.current.encoding }
        : restoredMetadata.current,
      selection: null,
    };
    try {
      fallback.current?.update(content);
    } catch (error) {
      setMessage(`同步恢复副本未更新（原生恢复仍异步进行）：${String(error)}`);
    }
    journal.current?.update(content);
  };
  const mergeMetadata = (document: DocumentFile): DocumentFile => {
    const latest = metadata.current.get(document.id);
    if (latest && latest.metadataRevision >= (document.metadataRevision ?? 0)) {
      document.path = latest.path;
      document.metadataRevision = latest.metadataRevision;
      document.locationState = latest.locationState ?? 'available';
    }
    if (
      current.current?.id === document.id &&
      document.metadataRevision !== undefined &&
      document.metadataRevision > (imageEpoch(document.id) ?? -1)
    ) {
      const owner = documentOwner.current;
      const runtime = editor.current;
      void runtime?.setDocumentContext(document.id, true).catch((error: unknown) => {
        if (documentOwner.current === owner && current.current?.id === document.id)
          setMessage(`图片位置世代尚未刷新：${String(error)}`);
      });
    }
    recordImageEpoch(document.id, document.metadataRevision);
    return document;
  };
  const observeMetadata = (change: DocumentMetadata) => {
    const previous = metadata.current.get(change.id);
    if (previous && previous.metadataRevision >= change.metadataRevision) return;
    metadata.current.set(change.id, change);
    if (metadata.current.size > 128) {
      const oldest = metadata.current.keys().next().value;
      if (oldest) metadata.current.delete(oldest);
    }
    const active = current.current;
    if (!active || active.id !== change.id) {
      const loading = loadingImages.current;
      if (loading?.id === change.id)
        void loading.runtime.setDocumentContext(change.id, true).catch(() => {});
      recordImageEpoch(change.id, change.metadataRevision);
      return;
    }
    // Keep the logical owner and in-flight Save's object identity. This is a
    // path handoff, not a document load or a change to its saved source.
    const oldPath = active.path;
    const oldLocation = active.locationState;
    {
      const owner = documentOwner.current;
      const runtime = editor.current;
      // force aborts synchronously before the new Native epoch becomes visible.
      void runtime?.setDocumentContext(change.id, true).catch((error: unknown) => {
        if (
          documentOwner.current === owner &&
          current.current === active &&
          metadata.current.get(change.id)?.metadataRevision === change.metadataRevision
        )
          setMessage(`文件位置已更新，但图片上下文刷新未完成：${String(error)}`);
      });
    }
    recordImageEpoch(change.id, change.metadataRevision);
    mergeMetadata(active);
    setFile({ ...active });
    setSavedPreview((preview) =>
      preview?.path === oldPath ? { ...preview, path: active.path } : preview,
    );
    protect();
    if (oldPath !== active.path && active.locationState !== 'trashed' && oldLocation !== 'trashed')
      setImageRelocation({
        id: active.id,
        previousPath: oldPath,
        path: active.path,
        metadataRevision: change.metadataRevision,
      });
    if (active.locationState === 'trashed')
      setMessage(
        '文件已移入回收站，当前正文和撤销历史仍保留。自动保存已暂停；可撤销文件操作或另存为。',
      );
    else if (oldLocation === 'trashed') setMessage('文件已恢复，当前正文和撤销历史保持不变。');
  };
  const onMetadata = useRef(observeMetadata);
  onMetadata.current = observeMetadata;
  useEffect(() => {
    if (!desktopAvailable) return;
    let alive = true;
    const stops = [
      getCurrentWindow().listen<DocumentMetadata[]>('document-metadata-changed', (event) => {
        if (alive) for (const change of event.payload) onMetadata.current(change);
      }),
      getCurrentWindow().listen<string[]>('document-file-operation-uncertain', (event) => {
        if (!alive) return;
        for (const id of event.payload) uncertainDocuments.current.add(id);
        if (current.current && uncertainDocuments.current.has(current.current.id))
          setMessage(
            '文件操作已执行，但位置无法确认。原稿已保留，请核对磁盘后另存为；自动保存已暂停。',
          );
      }),
      getCurrentWindow().listen<string>('workspace-operation-warning', (event) => {
        if (alive) setMessage(event.payload);
      }),
    ];
    for (const stop of stops)
      void stop.catch((error: unknown) => {
        if (alive) setMessage(`文档路径监听失败：${String(error)}`);
      });
    return () => {
      alive = false;
      for (const stop of stops) void stop.then((dispose) => dispose()).catch(() => {});
    };
  }, []);
  const reconcileMetadata = async (document: DocumentFile) => {
    // Older host/test DTOs have no path generation. Actual new hosts always do.
    if (desktopAvailable && document.metadataRevision !== undefined) {
      const latest = await documents.metadata(document.id);
      onMetadata.current(latest);
    }
    return mergeMetadata(document);
  };
  const retire = () => {
    try {
      fallback.current?.discard();
    } catch (error) {
      setMessage(`旧本地恢复副本保持保留：${String(error)}`);
    }
    void journal.current
      ?.retire(true)
      .catch((error: unknown) => setMessage(`旧恢复副本未能清理：${String(error)}`));
  };
  const pendingAction = (action: DocumentAction | null) => {
    const previous = pendingRef.current;
    if (
      action &&
      previous?.kind === 'native-input' &&
      previous !== action &&
      previous.document.id !== current.current?.id
    )
      void documents.close(previous.document.id).catch(() => {});
    pendingRef.current = action;
    setPending(action);
  };
  const change = (text: string) => {
    source.current = text;
    setSnapshot(text);
    setDirty(text !== saved.current);
    protect();
    if (desktopAvailable) return;
    try {
      if (text === saved.current) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, text);
    } catch {
      setMessage('无法写入本地恢复草稿');
    }
  };
  const instance = () => {
    const value = editor.current;
    if (!value) throw new Error('编辑器仍在加载');
    if (value.isComposing) throw new Error('请先完成输入法候选');
    return value;
  };
  const flush = async (active: MarkLyraEditor): Promise<string> => {
    await beforeEditorRead?.();
    if (editor.current !== active) throw new Error('编辑器已更换，请重试文档操作');
    return active.flush();
  };
  const run = async (work: () => Promise<void>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setWorking(true);
    try {
      await work();
      return true;
    } catch (error) {
      // A failed close may have retired its previous journal. The still-visible
      // document must regain a recovery record, including newly arrived input.
      protect();
      closeCancelled?.();
      const text = String(error);
      if (!text.includes('取消')) setMessage(text);
      return false;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const remember = async (document: DocumentFile): Promise<string | undefined> => {
    if (!desktopAvailable) return undefined;
    try {
      await recentFiles.remember(document.id);
    } catch (error) {
      return `文档操作已完成，但无法更新最近文件：${String(error)}`;
    }
    return undefined;
  };
  const activateImages = async (id: string | null) => {
    try {
      await activateImageOwner(id);
    } catch (error) {
      const warning = `正文已加载；图片恢复上下文未确认：${String(error)}`;
      setMessage(warning);
      return warning;
    }
  };
  const accept = async (
    document: DocumentFile | null,
    text: string,
    expectedRevision?: number,
    mayLoad?: () => boolean,
  ) => {
    const previous = current.current;
    const previousImages = imageContext.current;
    const previousImagesDraft = imageContextDraft.current;
    let nextImages: string | null = document?.id ?? null;
    let imageActivationWarning: string | undefined;
    replacing.current = true;
    try {
      const active = instance();
      if (document) await reconcileMetadata(document);
      if (mayLoad && !mayLoad()) throw new Error('创建期间焦点已更换，已保留当前文稿');
      if (!document) nextImages = await createUntitledImageOwner();
      const imageOwner = document ? { id: document.id, runtime: active } : null;
      loadingImages.current = imageOwner;
      try {
        await active.load(text, {
          expectedSource: source.current,
          expectedRevision: expectedRevision ?? active.revision,
          documentContext: nextImages,
        });
      } finally {
        if (loadingImages.current === imageOwner) loadingImages.current = null;
      }
      imageActivationWarning = await activateImages(nextImages);
      if (document) mergeMetadata(document);
    } catch (error) {
      replacing.current = false;
      if (!document && nextImages && nextImages !== previousImages)
        await closeUntitledImageOwner(nextImages).catch(() => {});
      await activateImages(previousImages);
      protect();
      if (document && document.id !== previous?.id) await documents.close(document.id);
      throw error;
    }
    replacing.current = false;
    documentOwner.current = {};
    current.current = document;
    setDailyDraft(null);
    imageContext.current = nextImages;
    imageContextDraft.current = !document;
    if (previousImages && previousImages !== nextImages) {
      if (previousImagesDraft) await closeUntitledImageOwner(previousImages).catch(() => {});
      else if (previousImages !== previous?.id)
        await documents.close(previousImages).catch(() => {});
    }
    restoredMetadata.current = null;
    saved.current = text;
    source.current = text;
    setFile(document);
    setSnapshot(text);
    setDirty(false);
    setMessage(imageActivationWarning ?? '');
    retire();
    protect();
    try {
      if (!desktopAvailable) localStorage.removeItem(draftKey);
    } catch {
      /* File storage does not rely on localStorage. */
    }
    if (previous && previous.id !== document?.id) await documents.close(previous.id);
    if (document) {
      const warning = await remember(document);
      if (warning) setMessage(warning);
    }
  };
  const performSaveWork = async (as: boolean, attempt?: SaveAttempt, nativeClose = false) => {
    if (!desktopAvailable) throw new Error('原生保存需要桌面程序');
    const active = instance(),
      lifetime = saveLifetime.current;
    let document = current.current;
    if (!as && document?.locationState === 'trashed')
      throw new Error('文件已移入回收站，请先撤销文件操作或使用“另存为”，未重新创建旧文件');
    const assertOwner = () => {
      if (
        !saveMounted.current ||
        lifetime !== saveLifetime.current ||
        editor.current !== active ||
        current.current !== document
      )
        throw new Error('保存操作所属文档已关闭或更换');
    };
    assertOwner();
    let text = await flush(active);
    let revision = active.revision;
    assertOwner();
    if (!as && document?.locationState === 'trashed')
      throw new Error('文件已移入回收站，请先撤销文件操作或使用“另存为”，未重新创建旧文件');
    const previous = document;
    // A day's draft has one fixed, host-computed location: no dialog, no image staging.
    const dailyTarget = !as && !previous && !nativeClose ? daily.current : null;
    const suggestedName = previous || dailyTarget ? undefined : await active.getSuggestedFileName();
    assertOwner();
    if (attempt) {
      attempt.source = text;
      attempt.revision = revision;
    }
    let result: DocumentFile;
    let imageWarning: string | undefined;
    let preserveReferences = false;
    let references: string[] = [];
    if ((as || !previous) && !dailyTarget) {
      try {
        references = (await active.getImageReferences()).filter(
          (reference) => !/^(?:https?:|\/\/|data:)/i.test(reference),
        );
      } catch {
        // An unproven image grammar must not prevent an exact-source Save As.
        preserveReferences = true;
      }
    }
    assertOwner();
    if (references.length || preserveReferences) {
      const policy = preserveReferences
        ? { referenceRoot: '', storageFolder: '' }
        : await active.getImageStorageContext();
      assertOwner();
      if (active.revision !== revision || active.getMarkdown() !== text || active.hasPendingChanges)
        throw new Error('准备图片保存期间正文已变化，请重新保存');
      const sourceOwner = previous?.id ?? imageContext.current;
      if (!sourceOwner) throw new Error('图片暂存尚未就绪，文稿和原图片已保留');
      const prepared = await imageSaves.prepare({
        sourceOwner,
        ...(previous ? { sourceId: previous.id } : {}),
        ...(previous?.metadataRevision === undefined
          ? {}
          : { expectedMetadataRevision: previous.metadataRevision }),
        ...(!previous && restoredMetadata.current?.encoding
          ? { encoding: restoredMetadata.current.encoding }
          : {}),
        ...(suggestedName ? { suggestedName } : {}),
        references,
        referenceRoot: policy.referenceRoot,
        storageFolder: policy.storageFolder ?? readPreferences().imageStorageFolder,
        preserveReferences,
        close: nativeClose,
        relativePath: readPreferences().useRelativeImagePath,
        relativePathWithDot: readPreferences().relativeImagePathWithDot,
      });
      assertOwner();
      if (prepared.kind !== 'prepared') {
        if (nativeClose) return prepared.kind;
        throw new Error('已取消图片保存');
      }
      const release = provisionalImageSources(prepared.mappings);
      let committed = false;
      try {
        if (
          active.revision !== revision ||
          active.getMarkdown() !== text ||
          active.hasPendingChanges
        )
          throw new Error('选择图片目标期间正文已变化，未保存旧版本，请重试');
        const replacements = prepared.mappings.map(({ source, target }) => ({
          source,
          target: target.source,
        }));
        const mapped = replacements.length ? rewriteImageReferences(text, replacements) : text;
        result = await imageSaves.commit(prepared.operationId, mapped);
        committed = true;
        assertOwner();
        // A disk acknowledgement remains valid when newer input makes the view
        // update obsolete. Native aliases retain the saved hrefs for that draft.
        if (
          active.revision === revision &&
          active.getMarkdown() === text &&
          !active.hasPendingChanges
        ) {
          try {
            if (replacements.length)
              await active.updateImageReferences(replacements, {
                expectedSource: text,
                expectedRevision: revision,
              });
            revision = active.revision;
          } catch (error) {
            imageWarning = `文稿与图片已保存，当前新编辑保留为未保存状态：${String(error)}`;
          }
        } else imageWarning = '文稿与图片已保存；保存期间的新编辑已保留，请再次保存。';
        text = mapped;
      } finally {
        release();
        if (!committed) await imageSaves.cancel(prepared.operationId).catch(() => {});
      }
    } else if (nativeClose) {
      if (previous) throw new Error('原生未命名保存确认不能用于已有文件');
      if (active.isComposing) throw new Error('请先完成输入法候选');
      const choice = await documents.prepareUntitledClose(
        text,
        restoredMetadata.current?.encoding,
        suggestedName,
      );
      assertOwner();
      switch (choice.kind) {
        case 'cancel':
        case 'discard':
        case 'unsupported':
          return choice.kind;
        case 'saved':
          result = choice.document;
          break;
        default:
          throw new Error('原生保存确认返回了未知结果，已保留文稿');
      }
    } else if (dailyTarget) {
      try {
        result = await dailyNotes.create(dailyTarget.location, dailyTarget.key, text);
      } catch (error) {
        if (String(error).includes(DAILY_EXISTS) && daily.current === dailyTarget) {
          setDailyDraft(null);
          throw new Error(DAILY_CONFLICT);
        }
        throw error;
      }
    } else {
      result =
        as || !previous
          ? await documents.saveAs(
              text,
              previous?.id,
              previous ? undefined : restoredMetadata.current?.encoding,
              suggestedName,
            )
          : await documents.save(previous.id, text);
    }
    assertOwner();
    let metadataWarning: string | undefined = imageWarning ?? result.imageWarning ?? undefined;
    try {
      await reconcileMetadata(result);
    } catch (error) {
      // Native write already succeeded; a metadata read failure cannot turn its
      // saved source acknowledgement into a failed/uncommitted save.
      mergeMetadata(result);
      metadataWarning = `正文已保存，但文件路径尚未确认：${String(error)}`;
    }
    assertOwner();
    current.current = result;
    document = result;
    setDailyDraft(null);
    restoredMetadata.current = null;
    saved.current = text;
    setFile(result);
    setSavedPreview({ path: result.path, sourcePrefix: text.slice(0, 500) });
    protect();
    const oldImages = imageContext.current;
    const oldImagesDraft = imageContextDraft.current;
    let contextReady = false;
    try {
      await active.setDocumentContext(result.id);
      assertOwner();
      const warning = await activateImages(result.id);
      if (warning) metadataWarning = `文稿已保存；${warning}`;
      else {
        imageContext.current = result.id;
        imageContextDraft.current = false;
        contextReady = true;
      }
    } catch (error) {
      metadataWarning = `文稿已保存；图片上下文未交接，原权限保留，请重试保存：${String(error)}`;
    }
    if (contextReady && oldImages && oldImages !== result.id) {
      try {
        if (oldImagesDraft) await closeUntitledImageOwner(oldImages);
        else await documents.close(oldImages);
      } catch (error) {
        // Native activation can already retire the draft scope. A named close
        // failure also cannot invalidate the successful document publication.
        if (!oldImagesDraft) metadataWarning = `文稿已保存；旧图片会话清理未确认：${String(error)}`;
      }
    }
    if (previous && previous.id !== result.id && previous.id !== oldImages) {
      try {
        await documents.close(previous.id);
      } catch (error) {
        metadataWarning = `文稿已保存；旧会话清理未确认：${String(error)}`;
      }
    }
    const recentWarning = await remember(result);
    assertOwner();
    const untouched =
      active.revision === revision && !active.hasPendingChanges && active.getMarkdown() === text;
    setDirty(!untouched || source.current !== text);
    if (untouched) {
      let confirmed: boolean;
      try {
        confirmed = await active.markSaved(text);
      } catch (error) {
        setDirty(true);
        setMessage(`文稿已保存；编辑器保存标记未确认，请重试保存：${String(error)}`);
        return;
      }
      assertOwner();
      if (!confirmed || source.current !== text || active.hasPendingChanges) {
        setDirty(source.current !== saved.current || active.hasPendingChanges);
        if (recentWarning || metadataWarning) setMessage(recentWarning ?? metadataWarning ?? '');
        return;
      }
      try {
        fallback.current?.discard();
        if (!desktopAvailable) localStorage.removeItem(draftKey);
      } catch {
        /* Already saved to disk; any failed cleanup leaves a recoverable copy. */
      }
    }
    setMessage(metadataWarning ?? recentWarning ?? `已保存 · ${result.encoding}`);
  };
  const saveWork = async (as: boolean, attempt?: SaveAttempt, nativeClose = false) => {
    const release = fenceImageSave(imageContext.current);
    try {
      return await performSaveWork(as, attempt, nativeClose);
    } finally {
      release();
    }
  };
  const save = (as = false): Promise<boolean> => {
    // Another Save during slow IO still belongs to this document. Coalesce it
    // inside the same operation rather than losing a later Undo/Redo or input.
    // Save As and unrelated document operations never acquire a deferred dialog.
    if (saving.current) {
      if (as) return Promise.resolve(false);
      saveAgain.current = true;
      return saving.current;
    }
    if (busy.current || !saveMounted.current) return Promise.resolve(false);
    const active = editor.current,
      lifetime = saveLifetime.current;
    const attempt: SaveAttempt = { source: null };
    savingAttempt.current = attempt;
    const work = run(async () => {
      saveAgain.current = false;
      await saveWork(as, attempt);
      while (saveAgain.current) {
        saveAgain.current = false;
        if (!active) throw new Error('保存期间编辑器已更换');
        const document = current.current;
        const assertOwner = () => {
          if (
            !active ||
            !saveMounted.current ||
            editor.current !== active ||
            lifetime !== saveLifetime.current ||
            current.current !== document
          )
            throw new Error('保存期间编辑器或文档已更换');
        };
        assertOwner();
        const text = await flush(active);
        assertOwner();
        if (text !== saved.current || active.hasPendingChanges) await saveWork(false, attempt);
      }
    });
    saving.current = work;
    void work.finally(() => {
      if (saving.current === work) saving.current = null;
      if (savingAttempt.current === attempt) savingAttempt.current = null;
      saveAgain.current = false;
    });
    return work;
  };
  // The draft owner keeps resolving to its new file until the editor has adopted it.
  const imageHandoff = useRef<{ draft: string; next: string } | null>(null);
  const materializeForImage = (draft: string): string | Promise<string> => {
    if (imageHandoff.current?.draft === draft) return imageHandoff.current.next;
    const target = daily.current;
    if (!target || !imageContextDraft.current || imageContext.current !== draft) return draft;
    return createForImage(draft, target);
  };
  const createForImage = async (draft: string, target: DailyDraft): Promise<string> => {
    if (busy.current) throw new Error('文档操作进行中，请稍后再插入图片');
    busy.current = true;
    setWorking(true);
    try {
      // No flush: the editor is waiting for this image. Its later edits stay unsaved.
      const text = source.current;
      let result: DocumentFile;
      try {
        result = await dailyNotes.create(target.location, target.key, text);
      } catch (error) {
        if (String(error).includes(DAILY_EXISTS) && daily.current === target) {
          setDailyDraft(null);
          throw new Error(DAILY_CONFLICT);
        }
        throw error;
      }
      if (daily.current !== target || imageContext.current !== draft) {
        await documents.close(result.id).catch(() => {});
        throw new Error('日程文件已创建，但当前文稿已更换；请从日历重新打开该日');
      }
      try {
        await reconcileMetadata(result);
      } catch {
        mergeMetadata(result);
      }
      imageHandoff.current = { draft, next: result.id };
      current.current = result;
      setDailyDraft(null);
      restoredMetadata.current = null;
      saved.current = text;
      setFile(result);
      setSavedPreview({ path: result.path, sourcePrefix: text.slice(0, 500) });
      setDirty(source.current !== text);
      protect();
      void remember(result).then((warning) => warning && setMessage(warning));
      return result.id;
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  const settleImageHandoff = (draft: string, next: string) => {
    // A macrotask later the editor has inserted the image under its old generation.
    setTimeout(() => {
      void (async () => {
        const active = editor.current;
        if (imageHandoff.current?.next !== next) return;
        try {
          if (!active || current.current?.id !== next) return;
          await flush(active).catch(() => {});
          await active.setDocumentContext(next);
          const warning = await activateImages(next);
          if (warning) return;
          imageContext.current = next;
          imageContextDraft.current = false;
          await closeUntitledImageOwner(draft).catch(() => {});
        } catch (error) {
          setMessage(`日程已创建；图片上下文未交接，请重试保存：${String(error)}`);
        } finally {
          if (imageHandoff.current?.next === next) imageHandoff.current = null;
        }
      })();
    }, 0);
  };
  const handoffHandlers = useRef({ materializeForImage, settleImageHandoff });
  handoffHandlers.current = { materializeForImage, settleImageHandoff };
  useEffect(
    () =>
      setDraftImageHandoff({
        materialize: (draft) => handoffHandlers.current.materializeForImage(draft),
        settle: (draft, next) => handoffHandlers.current.settleImageHandoff(draft, next),
      }),
    [],
  );
  const initializeImageContext = async (active: MarkLyraEditor) => {
    if (!desktopAvailable || current.current || imageContext.current) return;
    const id = await createUntitledImageOwner();
    if (editor.current !== active || current.current || imageContext.current) {
      await closeUntitledImageOwner(id).catch(() => {});
      return;
    }
    try {
      await active.setDocumentContext(id);
      imageContext.current = id;
      imageContextDraft.current = true;
      await activateImages(id);
    } catch (error) {
      await closeUntitledImageOwner(id).catch(() => {});
      throw error;
    }
  };
  const initialize = async (
    document: DocumentFile,
    expectedRevision: number,
    mayLoad?: () => boolean,
    draftText?: string,
  ): Promise<boolean> => {
    let accepted = false;
    await run(async () => {
      const active = instance();
      await flush(active);
      if (
        current.current ||
        source.current !== '' ||
        pendingRef.current ||
        active.hasPendingChanges ||
        active.revision !== expectedRevision
      )
        throw new Error('启动期间已有输入或文档操作，已保留当前内容，未替换为恢复文件。');
      await accept(document, draftText ?? document.text, expectedRevision, mayLoad);
      if (draftText !== undefined) {
        // The new window has a fresh editor but retains the actual disk save
        // baseline. Loading the handoff never writes or marks its draft saved.
        saved.current = document.text;
        setDirty(draftText !== saved.current);
        protect();
      }
      accepted = true;
    });
    if (!accepted && current.current?.id !== document.id) await documents.close(document.id);
    return accepted;
  };
  const autoSave = async (): Promise<'saved' | 'deferred' | 'skipped' | 'failed'> => {
    const active = editor.current;
    if (
      !desktopAvailable ||
      (!current.current && !daily.current) ||
      source.current === saved.current
    )
      return 'skipped';
    if (current.current?.locationState === 'trashed') return 'skipped';
    if (current.current && uncertainDocuments.current.has(current.current.id)) return 'skipped';
    if (
      !active ||
      busy.current ||
      pendingRef.current ||
      active.isComposing ||
      active.hasPendingChanges
    )
      return 'deferred';
    const attempted = source.current;
    autoSaveFailureSource.current = null;
    const work = save();
    const attempt = savingAttempt.current;
    if (await work) return 'saved';
    // The manual Save coalesced into this lane may have attempted a later raw
    // source than the timer began with. Suppress that actual failure, not an
    // older source which would immediately trigger an unintended retry.
    autoSaveFailureSource.current = attempt?.source ?? attempted;
    return 'failed';
  };
  const restoreDraft = async (draft: RecoveryDraft, associate: boolean) => {
    const active = instance();
    const opening = { source: source.current, id: current.current?.id, revision: active.revision };
    let target: DocumentFile | null = null;
    const previousImages = imageContext.current;
    const previousImagesDraft = imageContextDraft.current;
    let nextImages: string | null = null;
    if (associate) {
      target = await documents.open();
      if (
        !draft.document ||
        target.path !== draft.document.path ||
        target.text !== draft.savedText ||
        target.encoding !== draft.document.encoding
      ) {
        await documents.close(target.id);
        throw new Error(
          '所选文件与恢复记录的原文件或保存基线不同。恢复副本仍保留；请恢复为新文档，比较后另存。',
        );
      }
    }
    try {
      if (target) await reconcileMetadata(target);
      await flush(active);
      if (
        source.current !== opening.source ||
        current.current?.id !== opening.id ||
        active.revision !== opening.revision ||
        active.hasPendingChanges
      )
        throw new Error('恢复期间当前文档已有更改，已保留当前内容，请重试。');
      replacing.current = true;
      nextImages = target?.id ?? draft.imageContext ?? (await createUntitledImageOwner());
      const imageOwner = target ? { id: target.id, runtime: active } : null;
      loadingImages.current = imageOwner;
      try {
        await active.load(draft.text, {
          expectedSource: opening.source,
          documentContext: nextImages,
        });
      } finally {
        if (loadingImages.current === imageOwner) loadingImages.current = null;
      }
      await activateImages(nextImages);
    } catch (error) {
      replacing.current = false;
      if (!target && nextImages && nextImages !== previousImages)
        await closeUntitledImageOwner(nextImages).catch(() => {});
      await activateImages(previousImages);
      protect();
      if (target) await documents.close(target.id);
      throw error;
    }
    replacing.current = false;
    documentOwner.current = {};
    const previous = current.current;
    if (target) mergeMetadata(target);
    current.current = target;
    setDailyDraft(null);
    imageContext.current = nextImages;
    imageContextDraft.current = !target;
    if (previousImages && previousImages !== nextImages) {
      if (previousImagesDraft) await closeUntitledImageOwner(previousImages).catch(() => {});
      else if (previousImages !== previous?.id)
        await documents.close(previousImages).catch(() => {});
    }
    restoredMetadata.current = target ? null : draft.document;
    saved.current = target?.text ?? draft.savedText;
    source.current = draft.text;
    setFile(target);
    setSnapshot(draft.text);
    setDirty(draft.text !== saved.current);
    retire();
    protect();
    if (previous && previous.id !== target?.id) await documents.close(previous.id);
    // Do not consume the only durable copy until its replacement checkpoint exists.
    await journal.current?.flush();
    let cleanupWarning: string | undefined;
    try {
      await recovery.consume(draft.id, draft.version);
    } catch (error) {
      // The replacement is already loaded and durably checkpointed. A lost
      // cleanup reply is not permission to reload or consume the old record again.
      cleanupWarning = `原恢复记录清理结果未确认：${String(error)}`;
    }
    const recentWarning = target ? await remember(target) : undefined;
    const restoredMessage = target
      ? '已恢复到原文件，修改尚未保存'
      : `已恢复为新文档${draft.document ? ` · 原文件：${draft.document.path}（${draft.document.encoding}）` : ''}`;
    setMessage(
      [restoredMessage, draft.imageWarning, cleanupWarning, recentWarning]
        .filter(Boolean)
        .join('；'),
    );
  };
  const proceedWork = async (action: DocumentAction) => {
    const active = instance();
    if (action.kind === 'new') {
      await accept(null, '');
      return;
    }
    if (action.kind === 'close') {
      const closing = { source: source.current, revision: active.revision };
      await journal.current?.retire(true);
      await flush(active);
      if (
        source.current !== closing.source ||
        active.revision !== closing.revision ||
        active.hasPendingChanges
      )
        throw new Error('关闭期间文档又有更改，已保留当前内容，请再次确认关闭。');
      try {
        fallback.current?.discard();
        if (!desktopAvailable) localStorage.removeItem(draftKey);
      } catch {
        /* Confirmed close; cleanup failure retains the fallback. */
      }
      await closeWindow();
      return;
    }
    if (action.kind === 'recover') {
      const opening = {
        source: source.current,
        id: current.current?.id,
        revision: active.revision,
      };
      const draft = await recovery.read(action.id, action.version);
      await flush(active);
      if (
        source.current !== opening.source ||
        current.current?.id !== opening.id ||
        active.revision !== opening.revision ||
        active.hasPendingChanges
      )
        throw new Error('恢复期间当前文档已有更改，已保留当前内容，请重试。');
      await restoreDraft(draft, action.associate);
      return;
    }
    const opening = {
      id: current.current?.id,
      source: source.current,
      revision: active.revision,
    };
    let next: DocumentFile;
    if (action.kind === 'daily') {
      const [note] = await dailyNotes.read(action.location, [action.key]);
      if (!note) {
        await flush(active);
        if (
          active.revision !== opening.revision ||
          current.current?.id !== opening.id ||
          active.hasPendingChanges ||
          source.current !== opening.source
        )
          throw new Error('打开期间当前文档已有更改，已保留当前内容，请重试。');
        await accept(null, action.template);
        setDailyDraft({ location: action.location, key: action.key });
        return;
      }
      next = await workspaces.open(action.location.workspaceId, note.relativePath);
    } else
      next =
        action.kind === 'open'
          ? await documents.open()
          : action.kind === 'native-input'
            ? action.document
            : action.kind === 'recent'
              ? await recentFiles.open(action.id)
              : await workspaces.open(action.workspaceId, action.relativePath);
    try {
      await flush(active);
    } catch (error) {
      if (action.kind === 'native-input' && current.current?.id !== action.document.id)
        void documents.close(action.document.id).catch(() => {});
      await documents.close(next.id);
      throw error;
    }
    if (
      active.revision !== opening.revision ||
      current.current?.id !== opening.id ||
      active.hasPendingChanges ||
      source.current !== opening.source
    ) {
      await documents.close(next.id);
      throw new Error('打开期间当前文档已有更改，已保留当前内容，请重试。');
    }
    await accept(next, next.text);
    if (action.kind === 'recent') onRecentOpened?.(next.id);
    if (action.kind === 'workspace' && action.match) {
      if (
        active.getMarkdown() !== next.text ||
        active.hasPendingChanges ||
        !searchPositionIsCurrent(next.text, action.match)
      ) {
        setMessage(STALE_SEARCH_POSITION);
        return;
      }
      await active.execute({
        type: 'sourcePosition',
        line: action.match.line,
        column: action.match.column,
      });
    }
  };
  const releaseNativeCandidate = (action: DocumentAction) => {
    if (action.kind === 'native-input' && current.current?.id !== action.document.id)
      void documents.close(action.document.id).catch(() => {});
  };
  const proceed = async (action: DocumentAction) => {
    const accepted = await run(() => proceedWork(action));
    if (!accepted) releaseNativeCandidate(action);
    return accepted;
  };
  const request = async (action: DocumentAction) => {
    if (busy.current) {
      if (action.kind === 'native-input' && current.current?.id !== action.document.id)
        void documents.close(action.document.id).catch(() => {});
      if (action.kind === 'close') closeCancelled?.();
      return;
    }
    try {
      const active = instance();
      await flush(active);
      if (busy.current) {
        releaseNativeCandidate(action);
        if (action.kind === 'close') closeCancelled?.();
        return;
      }
      if (source.current !== saved.current) {
        if (desktopAvailable && action.kind === 'close' && !current.current && !daily.current) {
          await run(async () => {
            const owner = documentOwner.current;
            const attempt: SaveAttempt = { source: null };
            const choice = await saveWork(false, attempt, true);
            if (choice === 'cancel') {
              closeCancelled?.();
              return;
            }
            if (choice === 'unsupported') {
              pendingAction(action);
              return;
            }
            if (editor.current !== active || documentOwner.current !== owner)
              throw new Error('保存确认所属文稿已更换');
            await flush(active);
            if (
              active.hasPendingChanges ||
              (choice === 'discard'
                ? source.current !== attempt.source || active.revision !== attempt.revision
                : source.current !== saved.current)
            )
              throw new Error('保存确认期间文档又有更改，已保留内容，请再次确认关闭。');
            await proceedWork(action);
          });
          return;
        }
        if (
          (current.current || daily.current) &&
          ['workspace', 'recent', 'open', 'native-input', 'daily'].includes(action.kind)
        ) {
          const owner = documentOwner.current;
          const success = await run(async () => {
            let automatic = false;
            try {
              automatic = effectiveSaveFileOnSwitch(await filePreferences.get());
            } catch (error) {
              setMessage(`文件设置读取失败，需确认保存：${String(error)}`);
            }
            if (!automatic) {
              pendingAction(action);
              return;
            }
            await saveWork(false);
            await flush(active);
            if (source.current !== saved.current || active.hasPendingChanges) {
              pendingAction(action);
              return;
            }
            await proceedWork(action);
          });
          if (!success && documentOwner.current === owner) pendingAction(action);
          return;
        }
        pendingAction(action);
        return;
      }
      await proceed(action);
    } catch (error) {
      if (action.kind === 'close') closeCancelled?.();
      if (action.kind === 'native-input' && current.current?.id !== action.document.id)
        void documents.close(action.document.id).catch(() => {});
      setMessage(String(error));
    }
  };
  const discard = async () => {
    if (busy.current || !pending) return;
    const action = pending;
    pendingAction(null);
    await proceed(action);
  };
  const saveAndContinue = async () => {
    if (busy.current || !pending) return;
    const action = pending;
    const accepted = await run(async () => {
      await saveWork(current.current?.locationState === 'trashed');
      const active = instance();
      await flush(active);
      if (source.current !== saved.current || active.hasPendingChanges) {
        throw new Error('保存期间文档又有更改，请保存后再继续。');
      }
      pendingAction(null);
      await proceedWork(action);
    });
    if (!accepted && pendingRef.current !== action) releaseNativeCandidate(action);
  };
  const observeExternal = async (): Promise<DocumentCheckpoint | null> => {
    const active = editor.current;
    const document = current.current;
    if (!active || !document || busy.current || pendingRef.current || active.isComposing)
      return null;
    const text = await flush(active);
    if (
      busy.current ||
      pendingRef.current ||
      active.isComposing ||
      current.current?.id !== document.id
    )
      return null;
    return { id: document.id, source: text, revision: active.revision };
  };
  const reloadExternal = async (
    changed: ChangedDocument,
    expected: DocumentCheckpoint,
    automatic: boolean,
  ): Promise<'applied' | 'deferred' | 'failed'> => {
    if (busy.current || pendingRef.current) return 'deferred';
    let applied = false;
    const success = await run(async () => {
      const active = instance();
      if (current.current?.id !== changed.document.id || expected.id !== current.current.id) return;
      await flush(active);
      if (
        source.current !== expected.source ||
        active.revision !== expected.revision ||
        active.hasPendingChanges ||
        (automatic && source.current !== saved.current)
      )
        return;
      reloadingView.current = true;
      try {
        await active.reloadFromDisk(changed.document.text, {
          expectedSource: expected.source,
          expectedRevision: expected.revision,
        });
      } finally {
        reloadingView.current = false;
      }
      // The view update is undoable. A failed disk CAS keeps it as an unsaved
      // version instead of rolling back over input that arrived during this await.
      const accepted = await documents.acceptChange(changed.document.id, changed.version);
      let metadataWarning: string | undefined;
      try {
        await reconcileMetadata(accepted);
      } catch (error) {
        mergeMetadata(accepted);
        metadataWarning = `磁盘内容已接受，但文件路径尚未确认：${String(error)}`;
      }
      current.current = accepted;
      saved.current = accepted.text;
      setFile(accepted);
      change(active.getMarkdown());
      if (!active.isComposing && !active.hasPendingChanges && source.current === accepted.text) {
        const confirmed = await active.markSaved(accepted.text);
        setDirty(!confirmed || source.current !== accepted.text || active.hasPendingChanges);
      }
      applied = true;
      setMessage(metadataWarning ?? '已载入磁盘版本，可撤销返回先前内容');
    });
    return applied ? 'applied' : success ? 'deferred' : 'failed';
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: one metadata queue item owns this attempt; callbacks read the live owner/revision refs.
  useEffect(() => {
    if (!imageRelocation || working || pending) return;
    const queued = imageRelocation;
    const active = editor.current;
    const document = current.current;
    if (
      !active ||
      !document ||
      document.id !== queued.id ||
      document.path !== queued.path ||
      document.metadataRevision !== queued.metadataRevision
    ) {
      setImageRelocation(null);
      return;
    }
    if (active.isComposing) {
      const timer = setTimeout(
        () => setImageRelocation((value) => (value === queued ? { ...value } : value)),
        250,
      );
      return () => clearTimeout(timer);
    }
    setImageRelocation(null);
    const releaseImageFence = fenceImageSave(imageContext.current);
    void run(async () => {
      const owner = documentOwner.current;
      const text = await flush(active);
      const revision = active.revision;
      const policy = await active.getImageStorageContext();
      const references = relocationImageReferences(
        queued.previousPath,
        queued.path,
        policy.storageFolder ?? readPreferences().imageStorageFolder,
        policy.referenceRoot,
        await active.getImageReferences(),
      );
      if (!references.length) return;
      const currentAttempt = () =>
        editor.current === active &&
        documentOwner.current === owner &&
        current.current?.id === queued.id &&
        current.current.path === queued.path &&
        current.current.metadataRevision === queued.metadataRevision;
      if (
        !currentAttempt() ||
        active.revision !== revision ||
        active.getMarkdown() !== text ||
        active.hasPendingChanges
      )
        throw new Error('文件位置或正文已变化，未开始图片迁移');
      const prepared = await imageSaves.prepare({
        sourceOwner: queued.id,
        sourceId: queued.id,
        references,
        referenceRoot: policy.referenceRoot,
        storageFolder: policy.storageFolder ?? readPreferences().imageStorageFolder,
        close: false,
        relativePath: readPreferences().useRelativeImagePath,
        relativePathWithDot: readPreferences().relativeImagePathWithDot,
        relocation: {
          previousPath: queued.previousPath,
          metadataRevision: queued.metadataRevision,
        },
      });
      if (prepared.kind !== 'prepared') return;
      const release = provisionalImageSources(prepared.mappings);
      let committed = false;
      try {
        if (
          !currentAttempt() ||
          active.revision !== revision ||
          active.getMarkdown() !== text ||
          active.hasPendingChanges
        )
          throw new Error('图片确认期间正文已变化，原图片与当前内容均保留');
        const replacements = prepared.mappings.map(({ source, target }) => ({
          source,
          target: target.source,
        }));
        const mapped = replacements.length ? rewriteImageReferences(text, replacements) : text;
        const result = await imageSaves.commit(prepared.operationId, mapped);
        committed = true;
        if (!currentAttempt()) return;
        if (
          active.revision === revision &&
          active.getMarkdown() === text &&
          !active.hasPendingChanges
        ) {
          try {
            if (replacements.length)
              await active.updateImageReferences(replacements, {
                expectedSource: text,
                expectedRevision: revision,
              });
          } catch (error) {
            setMessage(`图片与文稿已保存，当前新编辑未改写：${String(error)}`);
          }
        }
        mergeMetadata(result);
        current.current = result;
        saved.current = mapped;
        setFile(result);
        setSavedPreview({ path: result.path, sourcePrefix: mapped.slice(0, 500) });
        let followupWarning: string | undefined;
        let contextReady = false;
        try {
          await active.setDocumentContext(result.id);
          const warning = await activateImages(result.id);
          if (warning) followupWarning = `文稿已保存；${warning}`;
          else {
            imageContext.current = result.id;
            imageContextDraft.current = false;
            contextReady = true;
          }
        } catch (error) {
          followupWarning = `文稿已保存；图片上下文未确认，请重试保存：${String(error)}`;
        }
        if (editor.current !== active || documentOwner.current !== owner) return;
        if (contextReady && queued.id !== result.id) {
          try {
            await documents.close(queued.id);
          } catch (error) {
            followupWarning = `文稿已保存；旧会话清理未确认：${String(error)}`;
          }
        }
        let confirmed = false;
        try {
          confirmed =
            active.getMarkdown() === mapped &&
            !active.hasPendingChanges &&
            (await active.markSaved(mapped));
        } catch (error) {
          followupWarning = `文稿已保存；编辑器保存标记未确认：${String(error)}`;
        }
        setDirty(!confirmed || source.current !== mapped);
        protect();
        setMessage(
          followupWarning ??
            result.imageWarning ??
            (confirmed
              ? '图片副本与对应引用已保存；原图片保留。'
              : '图片与文稿已保存；期间的新编辑保持未保存，请再次保存。'),
        );
      } finally {
        release();
        if (!committed) await imageSaves.cancel(prepared.operationId).catch(() => {});
      }
    }).finally(releaseImageFence);
  }, [imageRelocation, working, pending]);
  return {
    recoveryReady,
    recoveryError,
    retryRecovery: () => setRecoveryAttempt((attempt) => attempt + 1),
    initial: initial.current,
    source,
    file,
    getFile: () => current.current,
    dailyDraft,
    getDailyDraft: () => daily.current,
    getOwner: () => documentOwner.current,
    acceptsEditorCommands: () => !replacing.current && !reloadingView.current,
    hasUnsavedChanges: () => source.current !== saved.current,
    checkpoint: async () => {
      protect();
      await journal.current?.flush();
    },
    savedPreview,
    dirty,
    working,
    snapshot,
    message,
    pending,
    change,
    save,
    initialize,
    initializeImageContext,
    autoSave,
    getAutoSaveFailureSource: () => autoSaveFailureSource.current,
    request,
    discard,
    saveAndContinue,
    observeExternal,
    reloadExternal,
    setMessage,
    cancel: () => {
      if (!busy.current) {
        if (pendingRef.current?.kind === 'native-input')
          void documents.close(pendingRef.current.document.id).catch(() => {});
        if (pendingRef.current?.kind === 'close') closeCancelled?.();
        pendingAction(null);
      }
    },
  };
}
