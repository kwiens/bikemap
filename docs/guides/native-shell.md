# Embedding the map in a native shell (Expo / React Native WebView)

The public map runs unchanged inside a React Native `WebView`. What changes is
where device capabilities come from: in the browser the map uses
`navigator.geolocation`, the Screen Wake Lock API and `deviceorientation`;
inside the shell it asks the host for the same things over a small JSON
protocol, so the host can use background location, `expo-keep-awake` and the
device compass. Each capability is opt-in. A host that only provides location
leaves the others on their web implementations.

The page side lives in `src/platform/native/`. The protocol's single source of
truth is [`src/platform/native/protocol.ts`](../../src/platform/native/protocol.ts);
this guide restates it for the native implementer. **Change them together.**

## 1. Announce the host before the page loads

Inject a global with `injectedJavaScriptBeforeContentLoaded`. The page checks
for it synchronously during its first render, so it must exist before any
script runs:

```js
window.__bikemapNative = {
  protocolVersion: 1,
  capabilities: { geolocation: true, keepAwake: true, heading: true },
};
```

The page only treats itself as embedded when **both** `window.ReactNativeWebView`
(provided by `react-native-webview`) and a compatible `__bikemapNative` are
present. A different `protocolVersion` is ignored and the page falls back to
the browser APIs, so an old app build against a new site keeps working.

When embedded, the page also:

- skips the "Add to home screen" prompt and service-worker registration;
- reports `kind: 'native'` from `usePlatform()`, for any further UI
  differences.

## 2. Channel

**Page → host**: the page calls `window.ReactNativeWebView.postMessage(json)`.
Receive it with the `WebView`'s `onMessage` prop.

**Host → page**: deliver a JSON string by injecting a call to the function the
page installs on the same global:

```js
webViewRef.current.injectJavaScript(
  `window.__bikemapNative.receive(${JSON.stringify(JSON.stringify(event))}); true;`,
);
```

The page also accepts `message` events on `window` and `document` (how
`postMessage` from the host arrives on iOS and Android respectively), so either
delivery works.

Every message has `source: "bikemap"` and `v: 1`. The page ignores anything on
the channel without them, so the host may share it with other traffic. It also
checks each event's payload (a fix needs finite `lng`, `lat`, `accuracy` and
`timestamp`; an error needs one of the three codes; a heading needs a number)
and drops anything malformed rather than letting it reach the map or a ride.

A `message` event that was posted by another *window* (an iframe on the page)
is ignored: the host's deliveries arrive with no `event.source`, a frame's
never do. Prefer `receive()`, which cannot be reached from a frame at all.

## 3. Messages

### Geolocation

The page keeps **one** watch open at a time (both the location marker and the
ride recorder read from a shared stream), but each watch carries a `watchId`
and the host must honour it.

| Page → host | Meaning |
|---|---|
| `{ type: "geolocation/watch", watchId, options }` | Start streaming fixes. `options`: `{ highAccuracy?, maximumAgeMs?, timeoutMs? }`. Use the app's background-location permission if it has one; the ride recorder relies on fixes continuing while the screen is off. |
| `{ type: "geolocation/clearWatch", watchId }` | Stop that watch. |
| `{ type: "geolocation/getCurrent", requestId, options }` | One fix, not part of any watch. Used for a cached coarse fix on a cold start (`highAccuracy: false, maximumAgeMs: 60000`) and as a nudge after returning from the background. Treat `options.timeoutMs` as the GPS budget; the page waits that long plus 2 s for the bridge (10 s when no timeout is given) before giving up. |

| Host → page | Meaning |
|---|---|
| `{ type: "geolocation/fix", watchId, fix }` | A fix for an open watch. |
| `{ type: "geolocation/error", watchId, error }` | The watch failed. `permission-denied` and `unavailable` end a ride recording; `timeout` is ignored and the watch is expected to continue. |
| `{ type: "geolocation/current", requestId, fix }` | Answer to `getCurrent`. |
| `{ type: "geolocation/currentError", requestId, error }` | Failed answer to `getCurrent`. |

`fix` is:

```ts
{
  lng: number; lat: number;
  accuracy: number;              // metres, horizontal
  altitude: number | null;       // metres
  altitudeAccuracy: number | null;
  speed: number | null;          // m/s
  heading: number | null;        // degrees clockwise from north
  timestamp: number;             // Unix ms
}
```

`error` is `{ code: "permission-denied" | "unavailable" | "timeout", message: string }`.

`expo-location` maps directly: `coords.longitude/latitude/accuracy/altitude/
altitudeAccuracy/speed/heading` and `timestamp`. Send `null`, not `-1`, for
values the device doesn't have.

### Keep awake

| Page → host | Meaning |
|---|---|
| `{ type: "keepAwake/acquire" }` | Keep the screen on. The page counts its own holders and sends this once, when the first appears. |
| `{ type: "keepAwake/release" }` | The last holder let go. |

Pairs with `activateKeepAwakeAsync()` / `deactivateKeepAwake()` from
`expo-keep-awake`. There is no reply.

### Heading (compass)

| Page → host | Meaning |
|---|---|
| `{ type: "heading/requestPermission", requestId }` | Ask for whatever permission the compass needs. Always sent before the first `heading/watch`, from a user tap. |
| `{ type: "heading/watch" }` | Start streaming headings. Sent once, when the first page-side watcher appears. |
| `{ type: "heading/clearWatch" }` | Stop streaming. |

| Host → page | Meaning |
|---|---|
| `{ type: "heading/permission", requestId, granted }` | Answer. If none arrives within 10 s the page treats it as denied. |
| `{ type: "heading/reading", headingDegrees }` | A magnetic heading, 0–360 clockwise from north. The page smooths it and blends in GPS course at speed, so send raw readings at the sensor's rate. |

Pairs with `Location.watchHeadingAsync` (`magHeading`) from `expo-location`.

## 4. Minimal host sketch

```tsx
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const hostInfo = `window.__bikemapNative = ${JSON.stringify({
  protocolVersion: 1,
  capabilities: { geolocation: true, keepAwake: true, heading: true },
})}; true;`;

function send(ref, event) {
  const json = JSON.stringify({ source: 'bikemap', v: 1, ...event });
  ref.current?.injectJavaScript(
    `window.__bikemapNative.receive(${JSON.stringify(json)}); true;`,
  );
}

// onMessage={(e) => handle(JSON.parse(e.nativeEvent.data))}
async function handle(ref, subs, msg) {
  if (msg.source !== 'bikemap' || msg.v !== 1) return;
  switch (msg.type) {
    case 'geolocation/watch':
      subs.set(msg.watchId, await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation },
        (p) => send(ref, { type: 'geolocation/fix', watchId: msg.watchId, fix: toFix(p) }),
      ));
      break;
    case 'geolocation/clearWatch':
      subs.get(msg.watchId)?.remove(); subs.delete(msg.watchId);
      break;
    case 'keepAwake/acquire': await activateKeepAwakeAsync('bikemap'); break;
    case 'keepAwake/release': deactivateKeepAwake('bikemap'); break;
    // getCurrent, heading/* follow the same pattern.
  }
}
```

## 5. Testing the page side without a device

In Chrome DevTools on the public site, before the map mounts (or after a
reload with a breakpoint at the top of the page), define both globals:

```js
window.ReactNativeWebView = { postMessage: (m) => console.log('→ host', m) };
window.__bikemapNative = {
  protocolVersion: 1,
  capabilities: { geolocation: true, keepAwake: true, heading: true },
};
```

Tap the locate button and watch `geolocation/watch` go out; then feed a fix:

```js
window.__bikemapNative.receive(JSON.stringify({
  source: 'bikemap', v: 1, type: 'geolocation/fix', watchId: 1,
  fix: { lng: -85.31, lat: 35.05, accuracy: 5, altitude: 200,
         altitudeAccuracy: 5, speed: 3, heading: 90, timestamp: Date.now() },
}));
```

The unit tests in `src/platform/native/*.test.ts` cover the protocol, the
transport and each service against a fake transport.

## 6. What the page does not do

- It never requests location, keep-awake or the compass on load; only on the
  locate button, Record, or the compass mode tap.
- It does not send a hello/handshake. Presence of the injected global is the
  handshake, which keeps the first render synchronous.
- It does not expect the host to persist anything. Rides are stored in the
  WebView's IndexedDB; the settings cookie works as in a browser.
