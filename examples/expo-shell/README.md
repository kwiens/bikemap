# Expo shell for the bike map

A reference host for running the public map inside an Expo (React Native)
app. It is the native side of the bridge described in
[`docs/guides/native-shell.md`](../../docs/guides/native-shell.md): the web
map asks for location, keep-awake, the compass and the share sheet over a
small JSON protocol, and this host fulfils them with Expo modules.

This directory is a **separate project**. It is excluded from the repository's
lint, typecheck and dependency checks, and nothing in `src/` imports it. Copy
`src/` into your Expo app (or point a workspace at it).

## Files

| File | Role |
|---|---|
| `src/protocol.ts` | The message types, mirroring `src/platform/native/protocol.ts` (protocol v1). Keep the two in step. |
| `src/bridge.ts` | `createBridgeHost(deps)`: decodes page commands, runs the Expo modules, and sends events back. Pure logic with injected dependencies, so it can be unit-tested without a device. |
| `src/BikeMapWebView.tsx` | The `WebView` component: injects the host announcement before load, wires `onMessage` to the bridge host, and delivers events with `injectJavaScript`. |

## Setup

```bash
npx create-expo-app bikemap-shell
cd bikemap-shell
npx expo install react-native-webview expo-location expo-keep-awake expo-sharing expo-file-system expo-clipboard
cp -r ../bikemap/examples/expo-shell/src ./src/bikemap
```

`app.json` needs the location permissions and, for rides that continue with
the screen off, background location:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Records your ride while the app is open or in the background.",
          "isAndroidBackgroundLocationEnabled": true
        }
      ]
    ],
    "ios": { "infoPlist": { "UIBackgroundModes": ["location"] } }
  }
}
```

Then render the map:

```tsx
import { BikeMapWebView } from './src/bikemap/BikeMapWebView';

export default function App() {
  return <BikeMapWebView url="https://bikechatt.com/" />;
}
```

## What the host does

- **Announces itself** by injecting `window.__bikemapNative` with
  `protocolVersion: 1` and its capabilities before the page loads. The page
  reads it synchronously on first render; without it the page uses the Web
  APIs.
- **Geolocation**: `geolocation/watch` starts `Location.watchPositionAsync`
  with `Accuracy.BestForNavigation`; fixes are forwarded with the page's
  `watchId`. `geolocation/getCurrent` answers once from
  `Location.getCurrentPositionAsync` (or the last known position when the
  page asks for a cached fix). Permission is requested on the first watch;
  a refusal is reported as `permission-denied`, which ends a ride recording
  on the page side.
- **Keep awake**: `activateKeepAwakeAsync` / `deactivateKeepAwake`.
- **Heading**: `Location.watchHeadingAsync`, forwarding `magHeading`. The
  page smooths it and blends in GPS course at speed.
- **Share**: writes the file to the cache directory and opens the share
  sheet with `expo-sharing`; links are shared with React Native's `Share`.
  Every share answers `share/result`.

## Background recording

A ride keeps recording with the screen off only if the app holds background
location permission and the watch was started with it. `bridge.ts` asks for
foreground permission on the first watch and background permission the first
time the page starts a watch with `highAccuracy: true`, which is what the
ride recorder uses. Adjust `requestBackgroundPermission` in `bridge.ts` if
you want to ask up front instead.

## Testing without a device

`bridge.ts` takes its Expo modules as an argument, so a test can pass fakes
and assert on the events it sends. The page side has its own tests in
`src/platform/native/` of the main repository, and
`docs/guides/native-shell.md` shows how to drive the page from Chrome
DevTools by defining the two globals by hand.
