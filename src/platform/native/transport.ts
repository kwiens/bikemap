import type { Unsubscribe } from '../types';
import {
  decodePageEvent,
  encodeCommand,
  isCompatibleHost,
  type HostCommand,
  type NativeHostInfo,
  type PageEvent,
} from './protocol';

/** The two globals a React Native WebView host provides. */
interface HostWindow {
  /** react-native-webview's channel from page to host. */
  ReactNativeWebView?: { postMessage: (data: string) => void };
  /**
   * Installed by the host before load with the protocol version and
   * capabilities. The page adds `receive`, which the host calls (via
   * `injectJavaScript`) to deliver a PageEvent.
   */
  __bikemapNative?: Partial<NativeHostInfo> & {
    receive?: (data: string) => void;
  };
}

function hostWindow(): HostWindow | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as HostWindow)
    : undefined;
}

/** The host info injected before load, or null outside the shell. */
export function detectNativeHost(): NativeHostInfo | null {
  const w = hostWindow();
  if (!w?.ReactNativeWebView) return null;
  const info = w.__bikemapNative;
  return isCompatibleHost(info) ? info : null;
}

/** How commands leave the page and events arrive. Swappable for tests. */
export interface BridgeTransport {
  send(command: HostCommand): void;
  onEvent(handler: (event: PageEvent) => void): Unsubscribe;
}

/**
 * The real transport. Events are accepted both through
 * `window.__bikemapNative.receive(json)` and as `message` events on window
 * or document (react-native-webview delivers `postMessage` from the host
 * differently per OS), so the host can use whichever it has.
 */
export function createReactNativeWebViewTransport(): BridgeTransport {
  const handlers = new Set<(event: PageEvent) => void>();

  const deliver = (raw: unknown) => {
    const event = decodePageEvent(raw);
    if (!event) return;
    for (const handler of handlers) handler(event);
  };

  const w = hostWindow();
  if (w) {
    w.__bikemapNative = { ...w.__bikemapNative, receive: deliver };
    const onMessage = (event: Event) => deliver((event as MessageEvent).data);
    window.addEventListener('message', onMessage);
    document.addEventListener('message', onMessage);
  }

  return {
    send(command) {
      hostWindow()?.ReactNativeWebView?.postMessage(encodeCommand(command));
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
