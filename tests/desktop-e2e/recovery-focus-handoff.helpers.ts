export interface RecoveryFocusGate {
  armed: boolean;
  requests: number;
  held: number;
  arm(): void;
  release(error?: string): void;
}
export type RecoveryFocusWindow = Window &
  typeof globalThis & { __recoveryFocusGate: RecoveryFocusGate };

/** Delay the real SDK focus acknowledgement, preserving its source/channel/id.
 * The editor still performs its real focus operation; only delivery is held. */
export function installRecoveryFocusGate() {
  if (window !== window.top) {
    window.addEventListener(
      'message',
      (event) => {
        const message = event.data;
        if (
          message?.protocol === 'marklyra/editor/v1' &&
          message.kind === 'request' &&
          message.operation === 'focus'
        )
          parent.postMessage(
            { recoveryFocusRequest: true, channel: message.channel, id: message.id },
            '*',
          );
      },
      true,
    );
    return;
  }
  const pending = new Set<string>();
  const held: MessageEvent[] = [];
  const probe: RecoveryFocusGate = {
    armed: false,
    requests: 0,
    held: 0,
    arm() {
      this.armed = true;
      this.requests = 0;
      this.held = 0;
      pending.clear();
    },
    release(error) {
      this.armed = false;
      pending.clear();
      this.held = 0;
      for (const event of held.splice(0))
        window.dispatchEvent(
          new MessageEvent('message', {
            data: error ? { ...event.data, error } : event.data,
            source: event.source,
            origin: event.origin,
          }),
        );
    },
  };
  Object.assign(window, { __recoveryFocusGate: probe });
  window.addEventListener(
    'message',
    (event) => {
      const iframe = document.querySelector<HTMLIFrameElement>('.marklyra-editor-frame');
      if (event.source !== iframe?.contentWindow) return;
      const message = event.data;
      if (message?.recoveryFocusRequest === true && probe.armed) {
        pending.add(`${String(message.channel)}:${String(message.id)}`);
        probe.requests++;
      }
      if (
        message?.protocol === 'marklyra/editor/v1' &&
        message.kind === 'response' &&
        probe.armed &&
        pending.has(`${String(message.channel)}:${String(message.id)}`)
      ) {
        event.stopImmediatePropagation();
        held.push(event);
        probe.held = held.length;
      }
    },
    true,
  );
}
