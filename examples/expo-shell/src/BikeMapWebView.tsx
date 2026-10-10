/**
 * The WebView that hosts the public bike map and fulfils its bridge.
 *
 * Drop into an Expo app alongside `bridge.ts` and `protocol.ts`. See the
 * README for the install command and the app.json permissions.
 */

import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef } from 'react';
import { Share, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { createBridgeHost, type BridgeDeps } from './bridge';
import {
  decodeHostCommand,
  deliveryScript,
  hostAnnouncementScript,
  type NativeCapabilities,
} from './protocol';

const CAPABILITIES: NativeCapabilities = {
  geolocation: true,
  keepAwake: true,
  heading: true,
  share: true,
};

async function shareFile(
  filename: string,
  mimeType: string,
  content: string,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(path, { mimeType, dialogTitle: filename });
  return true;
}

async function shareLink(url: string): Promise<boolean> {
  try {
    const result = await Share.share({ message: url, url });
    if (result.action === Share.dismissedAction) {
      // iOS reports a dismissal; fall back to the clipboard so the rider
      // still ends up with the link.
      await Clipboard.setStringAsync(url);
    }
    return true;
  } catch {
    return false;
  }
}

export function BikeMapWebView({ url }: { url: string }) {
  const webViewRef = useRef<WebView>(null);

  const host = useMemo(() => {
    const deps: BridgeDeps = {
      location: Location,
      keepAwake: { activateKeepAwakeAsync, deactivateKeepAwake },
      share: { shareFile, shareLink },
      send: (event) => webViewRef.current?.injectJavaScript(deliveryScript(event)),
    };
    return createBridgeHost(deps);
  }, []);

  useEffect(() => {
    return () => {
      void host.dispose();
    };
  }, [host]);

  const onMessage = (event: WebViewMessageEvent) => {
    const command = decodeHostCommand(event.nativeEvent.data);
    if (command) void host.handle(command);
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      style={styles.webView}
      injectedJavaScriptBeforeContentLoaded={hostAnnouncementScript(CAPABILITIES)}
      onMessage={onMessage}
      // The page stores rides in IndexedDB and settings in a cookie.
      domStorageEnabled
      sharedCookiesEnabled
      // Geolocation is served over the bridge; the WebView's own prompt
      // would ask a second time.
      geolocationEnabled={false}
      allowsBackForwardNavigationGestures={false}
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1 },
});
