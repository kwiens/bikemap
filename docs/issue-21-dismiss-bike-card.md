# Implementation Plan: Dismiss Card on Next Selection (Issue #21)

## Issue Summary

When a user clicks a bike rental or attraction card in the sidebar, the map flies to
that location and opens a Mapbox popup on the corresponding marker. If the user then
clicks a _different_ card, the previous popup remains open alongside the new one.
The fix is to close all open popups before opening the next one.

---

## Relevant Files

| File                                         | Role                                              |
| -------------------------------------------- | ------------------------------------------------- |
| `src/components/MapMarkers.tsx`              | `MarkerManager` class — owns all marker instances |
| `src/components/Map.tsx`                     | `handleCenterLocation` callback — opens popups    |
| `src/components/sidebar/AttractionsList.tsx` | Sidebar card list for attractions                 |
| `src/components/sidebar/BikeRentalList.tsx`  | Sidebar card list for bike rentals                |

---

## Current Behaviour (root-cause analysis)

In `Map.tsx`, `handleCenterLocation` is called whenever the `center-location` custom
DOM event fires (dispatched by `MapLegend.tsx → centerOnLocation` when a sidebar card
is clicked). The relevant section at the bottom of the callback (lines ~365–395):

```ts
if (showAttractions) {
  const attractionMarker = attractionMarkers.current.findByCoordinates(
    lng,
    lat,
  );
  if (attractionMarker) {
    attractionMarker.togglePopup(); // ← toggles; does NOT close others first
  }
}
// … same pattern for bikeResources and bikeRentals
```

`togglePopup()` on a Mapbox marker opens the popup if it is closed, or closes it if
it is already open. No code ever closes popups from the _other_ markers before doing
this, so previously opened popups stay visible.

`MarkerManager` currently has no method for bulk-closing popups.

---

## Desired Behaviour

When any card is clicked, the previously open popup within that manager closes and
the new one opens. Each `MarkerManager` owns this logic internally — `Map.tsx` does
not need to coordinate across managers.

**Why cross-manager coordination is not needed:** the layer toggles in `MapLegend.tsx`
have radio-button behaviour — enabling one layer disables the other two. It is
therefore impossible for two markers from different managers to have open popups at
the same time.

---

## TDD Implementation Plan

### Step 1 — Write failing tests for `MarkerManager.openPopupFor()`

**File to create:** `src/components/MapMarkers.test.ts`

The Vitest framework is already configured (`vitest.config.ts`); setup is in
`tests/vitest-setup.ts`. Mapbox GL cannot run in jsdom, so mock it with `vi.mock`
following the same pattern used in `src/utils/map.test.ts`.

```ts
// src/components/MapMarkers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimal Mapbox mock ──────────────────────────────────────────────────────
const makePopup = (open = false) => ({
  isOpen: vi.fn().mockReturnValue(open),
  remove: vi.fn(),
});

const makeMarker = (lng: number, lat: number, popupOpen = false) => ({
  getLngLat: vi.fn().mockReturnValue({ lng, lat }),
  getPopup: vi.fn().mockReturnValue(makePopup(popupOpen)),
  openPopup: vi.fn(),
  togglePopup: vi.fn(),
  addTo: vi.fn().mockReturnThis(),
  remove: vi.fn(),
});

vi.mock("mapbox-gl", () => ({
  default: {
    Marker: vi.fn().mockImplementation(() => makeMarker(0, 0)),
    Popup: vi.fn(),
    accessToken: "",
  },
}));
// ────────────────────────────────────────────────────────────────────────────

import { MarkerManager } from "./MapMarkers";

describe("MarkerManager", () => {
  let manager: MarkerManager;

  beforeEach(() => {
    manager = new MarkerManager();
  });

  // ── regression guards ──────────────────────────────────────────────────────

  it("tracks markers added via setMarkers()", () => {
    const m1 = makeMarker(1, 2) as any;
    const m2 = makeMarker(3, 4) as any;
    manager.setMarkers([m1, m2]);
    expect(manager.length).toBe(2);
  });

  it("findByCoordinates returns the correct marker", () => {
    const m1 = makeMarker(-85.3, 35.0) as any;
    const m2 = makeMarker(-85.4, 35.1) as any;
    manager.setMarkers([m1, m2]);
    expect(manager.findByCoordinates(-85.3, 35.0)).toBe(m1);
    expect(manager.findByCoordinates(-85.4, 35.1)).toBe(m2);
  });

  // ── new behaviour (MUST FAIL before implementation) ───────────────────────

  describe("openPopupFor()", () => {
    it("is a callable method on MarkerManager instances", () => {
      expect(typeof manager.openPopupFor).toBe("function");
    });

    it("opens the popup on the given marker", () => {
      const m = makeMarker(1, 2) as any;
      manager.setMarkers([m]);
      manager.openPopupFor(m);
      expect(m.openPopup).toHaveBeenCalledOnce();
    });

    it("closes the previously active popup before opening the new one", () => {
      const prevPopup = makePopup(true);
      const prev = {
        ...makeMarker(1, 2),
        getPopup: vi.fn().mockReturnValue(prevPopup),
      } as any;
      const next = makeMarker(3, 4) as any;

      manager.setMarkers([prev, next]);
      manager.openPopupFor(prev); // select first
      manager.openPopupFor(next); // select second — should close first

      expect(prevPopup.remove).toHaveBeenCalledOnce();
      expect(next.openPopup).toHaveBeenCalledOnce();
    });

    it("does not close the popup when the same marker is selected again", () => {
      const popup = makePopup(true);
      const m = {
        ...makeMarker(1, 2),
        getPopup: vi.fn().mockReturnValue(popup),
      } as any;
      manager.setMarkers([m]);
      manager.openPopupFor(m);
      manager.openPopupFor(m); // second click on the same card
      expect(popup.remove).not.toHaveBeenCalled();
    });

    it("clears active marker when clear() is called", () => {
      const popup = makePopup(true);
      const m = {
        ...makeMarker(1, 2),
        getPopup: vi.fn().mockReturnValue(popup),
      } as any;
      const next = makeMarker(3, 4) as any;

      manager.setMarkers([m, next]);
      manager.openPopupFor(m);
      manager.clear();
      // After clear, opening next should not try to close the old marker
      manager.setMarkers([next]);
      expect(() => manager.openPopupFor(next)).not.toThrow();
    });
  });
});
```

Run before any implementation and confirm the `openPopupFor` tests fail:

```bash
pnpm test:run src/components/MapMarkers.test.ts
```

Expected: `TypeError: manager.openPopupFor is not a function`.

---

### Step 2 — Implement `MarkerManager.openPopupFor()`

**File:** `src/components/MapMarkers.tsx`

Add a private `activeMarker` field and the new `openPopupFor` method to `MarkerManager`.
Also reset `activeMarker` in the existing `clear()` method.

```ts
export class MarkerManager {
  private markers: mapboxgl.Marker[] = [];
  private activeMarker: mapboxgl.Marker | null = null; // ← add this field

  // … existing methods unchanged …

  openPopupFor(marker: mapboxgl.Marker): void {
    // Close the previously active popup if it's a different marker
    if (this.activeMarker && this.activeMarker !== marker) {
      this.activeMarker.getPopup()?.remove();
    }
    this.activeMarker = marker;

    if (!marker.getPopup()?.isOpen()) {
      marker.togglePopup();
    }
  }

  clear(): void {
    this.hide();
    this.markers = [];
    this.activeMarker = null; // ← reset active marker on clear
  }
}
```

**Why this approach:**

- `activeMarker` is the single source of truth for which popup is open within this
  manager. No need to scan all markers or call `isOpen()`.
- The `marker !== activeMarker` guard means clicking the same card twice is a no-op
  (does not close the popup). The `isOpen()` check prevents `togglePopup()` from
  immediately closing the same popup on repeat selection.
- Resetting in `clear()` prevents a stale reference after markers are replaced (e.g.
  when a layer is toggled off and back on with freshly fetched rental data).

Run the tests again — all `openPopupFor` tests should pass:

```bash
pnpm test:run src/components/MapMarkers.test.ts
```

---

### Step 3 — Update `handleCenterLocation` in `Map.tsx`

**File:** `src/components/Map.tsx`

Replace each `marker.togglePopup()` call with `manager.openPopupFor(marker)`. No
cross-manager coordination is needed — each manager handles its own active popup.

```diff
         if (showAttractions) {
           const attractionMarker = attractionMarkers.current.findByCoordinates(
             coordinates[0],
             coordinates[1],
           );
           if (attractionMarker) {
-            attractionMarker.togglePopup();
+            attractionMarkers.current.openPopupFor(attractionMarker);
           }
         }

         if (showBikeResources) {
           const bikeMarker = bikeResourceMarkers.current.findByCoordinates(
             coordinates[0],
             coordinates[1],
           );
           if (bikeMarker) {
-            bikeMarker.togglePopup();
+            bikeResourceMarkers.current.openPopupFor(bikeMarker);
           }
         }

         if (showBikeRentals) {
           const rentalMarker = bikeRentalMarkers.current.findByCoordinates(
             coordinates[0],
             coordinates[1],
           );
           if (rentalMarker) {
-            rentalMarker.togglePopup();
+            bikeRentalMarkers.current.openPopupFor(rentalMarker);
           }
         }
```

---

### Step 4 — Run all tests and lint

```bash
pnpm test:run
pnpm lint
```

The full test suite must pass with no regressions. Lint must pass cleanly.

---

### Step 5 — Manual verification

Because Mapbox layer interactions cannot be driven synthetically in tests (see
`CLAUDE.md` — "Mapbox Testing Limitations"), manual browser verification is required:

1. `pnpm dev`
2. Open `http://localhost:3000`
3. Enable the **Bike Rentals** layer toggle in the sidebar.
4. Click any bike rental card — confirm its popup opens on the map.
5. Click a **different** bike rental card — confirm the first popup closes and the new
   one opens.
6. Repeat steps 3–5 for the **Attractions** layer.
7. Click the same card twice — confirm the popup stays open (no toggle-off).

---

## Summary of All Code Changes

### `src/components/MapMarkers.tsx`

1. Add `private activeMarker: mapboxgl.Marker | null = null` field to `MarkerManager`.
2. Add `openPopupFor(marker)` method.
3. Reset `activeMarker` in the existing `clear()` method.

### `src/components/Map.tsx`

In `handleCenterLocation`, replace the three `marker.togglePopup()` calls with
`manager.openPopupFor(marker)` (one per layer block). No other changes needed.

### `src/components/MapMarkers.test.ts` _(new file)_

Unit tests for `MarkerManager.openPopupFor()` as written in Step 1.

---

## What Does NOT Need to Change

- `MapLegend.tsx` — no state changes needed; the "card" being dismissed is the Mapbox
  popup on the map, not a sidebar UI element.
- `AttractionsList.tsx` / `BikeRentalList.tsx` — these components correctly dispatch
  `center-location` events; no changes needed.
- `sidebar/types.ts`, `BikeResourcesList.tsx`, `Map.css`, or any other file.

---

## Edge Cases Handled

| Scenario                                                      | Behaviour after fix                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Click card A, then card B (same layer)                        | Manager closes A's popup, opens B's                                      |
| Click the same card twice                                     | `activeMarker` is unchanged; `openPopup` called again — popup stays open |
| Layer toggled off then on (markers replaced via `setMarkers`) | `clear()` resets `activeMarker`; no stale reference                      |
| Card with no corresponding map marker                         | `openPopupFor` is never called; no change in behaviour                   |
