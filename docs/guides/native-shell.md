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
Version 1 is provisional until it has been exercised by a real Expo host. The
host implementation is not yet linked from this repository; add its location
here when it exists. Once native builds ship, incompatible protocol changes
must increment `PROTOCOL_VERSION`.

## 1. Supply host metadata before the first device action

Use `injectedJavaScriptObject` on the WebView:

```tsx
<WebView
  source={{ uri: 'https://bikechatt.com/' }}
  injectedJavaScriptObject={{
    bikemap: {
      protocolVersion: 1,
      capabilities: { geolocation: true, keepAwake: true, heading: true, share: true },
    },
  }}
  onMessage={handleMessage}
/>
```

The page reads `window.ReactNativeWebView.injectedObjectJson()` and validates
its `bikemap` member. [React Native WebView recommends this over early script
injection on Android](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#injectedjavascriptbeforecontentloaded),
where `injectedJavaScriptBeforeContentLoaded` is not fully reliable.
Older hosts may still inject `window.__bikemapNative = { protocolVersion: 1,
capabilities: ... }`.

`usePlatform()` returns a stable facade. Rendering and capability checks do not
commit to browser services: metadata arriving after the first render is read
again when the rider first uses a device service. That first action selects the
backend for the session, keeping the marker, recorder and their cleanup on one
shared stream. Supply metadata before enabling device actions. If a host loads
after an actual browser watch or recording has begun, reload the page after
preserving the ride; the facade deliberately does not switch a live session to
a different backend.

`share` is optional (defaults to off). Without it the page keeps blob downloads
and clipboard sharing, so provide it for a complete WebView integration.
An incompatible protocol uses browser services. Presence of the WebView channel
suppresses installation prompts and service-worker registration even before
metadata arrives or when the host uses an incompatible protocol.

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
| `{ type: "geolocation/watch", watchId, options }` | Start streaming fixes. `options`: `{ highAccuracy?, maximumAgeMs?, timeoutMs? }`. This is a foreground position subscription. It is shared with the map marker and does not indicate that a ride is being recorded; see the background-recording requirements below. |
| `{ type: "geolocation/clearWatch", watchId }` | Stop that watch. |
| `{ type: "geolocation/getCurrent", requestId, options }` | One fix, not part of any watch. Used for a cached coarse fix on a cold start (`highAccuracy: false, maximumAgeMs: 60000`) and as a nudge after returning from the background. Treat `options.timeoutMs` as the GPS budget; the page waits that long plus 2 s for the bridge (10 s when no timeout is given) before giving up. |

| Host → page | Meaning |
|---|---|
| `{ type: "geolocation/fix", watchId, fix }` | A fix for an open watch. |
| `{ type: "geolocation/error", watchId, error }` | An error on an open watch. `permission-denied` ends the watch and any ride recording. `unavailable` ends them only if the watch has not produced a fix yet (no provider); after a fix it means the signal was lost, the page keeps recording and expects the watch to carry on, so report a lost signal as `unavailable` and keep the watch running. `timeout` is ignored. |
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

### Share

| Page → host | Meaning |
|---|---|
| `{ type: "share/file", requestId, filename, mimeType, content }` | Offer a generated file (a GPX track, text content) through the share sheet. Write it to the cache directory with `expo-file-system` and hand it to `expo-sharing`. |
| `{ type: "share/link", requestId, url }` | Share a link to what is on screen (a trail or route deep link). |

| Host → page | Meaning |
|---|---|
| `{ type: "share/result", requestId, ok }` | The sheet closed. `ok: false` when it was dismissed or sharing failed; the page then shows "Could not export GPX" / "Could not share link". There is no page-side timeout: a sheet stays open as long as the rider likes, so always answer. |

## 4. Foreground-only host sketch

```tsx
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const hostInfo = {
  bikemap: {
    protocolVersion: 1,
    capabilities: { geolocation: true, keepAwake: true, heading: true },
  },
};

// <WebView injectedJavaScriptObject={hostInfo} onMessage={...} />

function send(ref, event) {
  const json = JSON.stringify({ source: 'bikemap', v: 1, ...event });
  ref.current?.injectJavaScript(
    `window.__bikemapNative.receive(${JSON.stringify(json)}); true;`,
  );
}

// onMessage={(e) => handle(webViewRef, subscriptions, JSON.parse(e.nativeEvent.data))}
async function handle(ref, subs, msg) {
  if (msg.source !== 'bikemap' || msg.v !== 1) return;
  switch (msg.type) {
    case 'geolocation/watch': {
      const pending: { subscription: Location.LocationSubscription | null } = { subscription: null };
      subs.set(msg.watchId, pending);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (subs.get(msg.watchId) !== pending) break;
      if (permission.status !== 'granted') {
        subs.delete(msg.watchId);
        send(ref, { type: 'geolocation/error', watchId: msg.watchId,
          error: { code: 'permission-denied', message: 'Location permission denied' } });
        break;
      }
      try {
        const subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation },
          (p) => {
            if (subs.get(msg.watchId) === pending) {
              send(ref, { type: 'geolocation/fix', watchId: msg.watchId, fix: toFix(p) });
            }
          },
        );
        // A clearWatch may arrive while permission/GPS startup is pending.
        if (subs.get(msg.watchId) !== pending) subscription.remove();
        else pending.subscription = subscription;
      } catch {
        if (subs.get(msg.watchId) !== pending) break;
        subs.delete(msg.watchId);
        send(ref, { type: 'geolocation/error', watchId: msg.watchId,
          error: { code: 'unavailable', message: 'Could not start location' } });
      }
      break;
    }
    case 'geolocation/clearWatch':
      subs.get(msg.watchId)?.subscription?.remove(); subs.delete(msg.watchId);
      break;
    case 'keepAwake/acquire': await activateKeepAwakeAsync('bikemap'); break;
    case 'keepAwake/release': deactivateKeepAwake('bikemap'); break;
    // getCurrent, heading/* and share/* follow the same pattern.
  }
}
```

This sketch only demonstrates the foreground protocol. `watchPositionAsync`
does not provide background updates. The native Expo host is separate work; the
contract above and the page-side tests define the messages it must implement,
including the share sheet. Add the host location here when it lands.

### Background recording requires a separate host contract

[Expo documents `watchPositionAsync` as foreground-only](https://docs.expo.dev/versions/latest/sdk/location/#locationwatchpositionasyncoptions-callback-errorhandler).
Screen-off recording needs `TaskManager` and `startLocationUpdatesAsync`, the
platform background permissions, and a development build rather than Expo Go.
A live WebView callback alone is not durable recording storage.

Before advertising background recording, implement and test these together in
the host and a versioned protocol extension:

- Explicit recording start, pause, resume and stop with a stable recording ID.
  `geolocation/watch` cannot stand in for recording intent: the marker retains
  that subscription after following is turned off and after a ride ends.
- Native durable storage of ordered fixes while the WebView is suspended or
  terminated; acknowledge persisted batches, replay on reconnect, and deduplicate
  by recording ID and sequence. Retain the original fix timestamps.
- Recovery into the web ride history after reload, with one authority for the
  recording state and its pause boundaries. IndexedDB alone cannot checkpoint
  fixes that never reached the suspended page.
- Native cleanup on stop and WebView/process disposal, including cancellation of
  location subscriptions still being created asynchronously.
- Physical iOS and Android checks: screen lock, app switch, revoked permission,
  delayed/batched fixes, reload/process loss, recovery, and stop releasing the
  background task while foreground location remains available.

Version 1 currently covers foreground device services. It does not claim to
solve those background lifecycle requirements.

## 5. Testing the page side without a device

In Chrome DevTools on the public site, before using any device service, define
both globals. A first render without them no longer locks in browser services:

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
- It does not send a hello/handshake. Validated injected metadata is the
  announcement; service selection happens on the first device action.
- Foreground rides are stored in the WebView's IndexedDB; settings use cookies.
  Durable background recording requires the host extension described above.
