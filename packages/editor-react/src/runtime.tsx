import {
  type ImageHostAdapter,
  MarkLyraEditor,
  type MarkLyraEditorOptions,
} from '@marklyra/editor-runtime';
import { useEffect, useRef } from 'react';
export interface MarkLyraMarkdownEditorProps extends MarkLyraEditorOptions {
  onReady?: (editor: MarkLyraEditor) => void;
  className?: string;
}
export function MarkLyraMarkdownEditor(props: MarkLyraMarkdownEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const runtimeUrl = props.runtimeUrl;
  useEffect(() => {
    if (!container.current) return;
    let alive = true;
    const editor = new MarkLyraEditor(container.current, {
      ...latest.current,
      runtimeUrl,
      onChange: (source) => latest.current.onChange?.(source),
      onSelectionChange: (selection) => latest.current.onSelectionChange?.(selection),
      onOutlineChange: (outline) => latest.current.onOutlineChange?.(outline),
      onThemeAppearanceChange: (appearance) => latest.current.onThemeAppearanceChange?.(appearance),
      imagePreviewTopInset: () => latest.current.imagePreviewTopInset?.() ?? 0,
      onImagePreviewChange: (open) => {
        if (alive) latest.current.onImagePreviewChange?.(open);
      },
      onOutlinePopoverChange: (open) => latest.current.onOutlinePopoverChange?.(open),
      onViewModeChange: (mode) => {
        if (alive) return latest.current.onViewModeChange?.(mode);
      },
      onScrollAwayFromTopChange: (away) => {
        if (alive) latest.current.onScrollAwayFromTopChange?.(away);
      },
      onLinkHintPreferenceChange: (suppressed) => {
        if (alive) latest.current.onLinkHintPreferenceChange?.(suppressed);
      },
      onMenuStateChange: (state) => {
        if (alive) return latest.current.onMenuStateChange?.(state);
      },
      onOutlinePin: () => latest.current.onOutlinePin?.(),
      onCurrentHeadingChange: (id) => latest.current.onCurrentHeadingChange?.(id),
      onStatisticsInvalidated: () => latest.current.onStatisticsInvalidated?.(),
      onError: (error) => latest.current.onError?.(error),
      onExtensionError: (error) => {
        if (alive) latest.current.onExtensionError?.(error);
      },
      host: {
        ...latest.current.host,
        onAction: (action) => latest.current.host?.onAction?.(action),
        onOpenLink: (link) => latest.current.host?.onOpenLink?.(link),
        onUnsupportedCapability: (name) => latest.current.host?.onUnsupportedCapability?.(name),
        images: {
          nativeDrop: Boolean(latest.current.host?.images?.nativeDrop),
          ...(latest.current.host?.images?.action
            ? {
                actions: latest.current.host.images.actions,
                action: (request: Parameters<NonNullable<ImageHostAdapter['action']>>[0]) => {
                  const action = latest.current.host?.images?.action;
                  return action
                    ? action(request)
                    : Promise.reject(new Error('宿主尚未提供图片操作能力'));
                },
              }
            : {}),
          ...(latest.current.host?.images?.automatic
            ? {
                automatic: (request: Parameters<NonNullable<ImageHostAdapter['automatic']>>[0]) =>
                  latest.current.host?.images?.automatic?.(request) ?? false,
              }
            : {}),
          resolve: (request) =>
            latest.current.host?.images?.resolve(request) ?? Promise.resolve(null),
          import: (request) => {
            const adapter = latest.current.host?.images?.import;
            return adapter
              ? adapter(request)
              : Promise.reject(new Error('宿主尚未提供图片导入能力'));
          },
        },
      },
    });
    void editor.ready.then(
      () => {
        if (alive) latest.current.onReady?.(editor);
      },
      (error) => {
        if (alive)
          latest.current.onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      if (editor.isImagePreviewOpen) latest.current.onImagePreviewChange?.(false);
      alive = false;
      editor.destroy();
    };
  }, [runtimeUrl]);
  return (
    <div ref={container} className={props.className} style={{ height: '100%', minHeight: 0 }} />
  );
}
