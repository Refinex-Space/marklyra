import { useEffect, useRef } from 'react';
import { RuntimePreferencesHost, type RuntimePreferencesOptions } from './host.js';

export interface RuntimePreferencesProps extends RuntimePreferencesOptions {
  closeRequest?: number;
}

export function RuntimePreferences(props: RuntimePreferencesProps) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  const currentHost = useRef<RuntimePreferencesHost | null>(null);
  callbacks.current = props;
  useEffect(() => {
    if (!container.current) return;
    let host: RuntimePreferencesHost;
    try {
      host = new RuntimePreferencesHost(container.current, {
        runtimeUrl: props.runtimeUrl,
        ...(props.platform ? { platform: props.platform } : {}),
        initialOptions: callbacks.current.initialOptions,
        presentation: callbacks.current.presentation,
        onPut: (key, value) => callbacks.current.onPut(key, value),
        onAction: async (name, data) => callbacks.current.onAction?.(name, data),
        onClose: () => callbacks.current.onClose(),
        onAiPage: (active) => callbacks.current.onAiPage?.(active),
        onError: (error) => callbacks.current.onError(error),
      });
    } catch (error) {
      callbacks.current.onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    currentHost.current = host;
    return () => {
      currentHost.current = null;
      host.dispose();
    };
  }, [props.runtimeUrl, props.platform]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a replaced runtime/platform creates a new host that must receive the outstanding close.
  useEffect(() => {
    if (props.closeRequest) currentHost.current?.requestClose();
  }, [props.closeRequest, props.runtimeUrl, props.platform]);
  useEffect(() => {
    currentHost.current?.setPresentation(props.presentation);
  }, [props.presentation]);
  return (
    <div
      ref={container}
      className="runtime-preferences"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
