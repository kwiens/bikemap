'use client';

/**
 * The current condition of every trail, and the vocabulary to report a new one.
 *
 * Fetched on the client rather than passed down with the trails, for two
 * reasons: the page is 60-second ISR, which is right for a trail's name and
 * wrong for something meant to change during the day; and `MountainBikeTrail`
 * is also the shape of the checked-in static data, which has no conditions.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { activeCityId } from '@/config/map.config';
import {
  type ConditionOption,
  type ConditionReport,
  type ConditionSummary,
  lockFor,
} from '@/data/trail-conditions';

interface TrailConditionsValue {
  /** The newest visible report per trail slug. Absent means nobody has said. */
  latest: Record<string, ConditionReport>;
  /** True until the first fetch settles, either way. */
  loading: boolean;
  /**
   * Why a trail is not taking reports, or null. Wraps the three switches so
   * callers can't get the precedence wrong. Only decides whether to offer the
   * button — the server enforces the same rule on submit.
   */
  lockedReason: (slug: string) => null | string;
  options: ConditionOption[];
  /** Merge a just-filed report so the badge updates without waiting on a fetch. */
  recordLocal: (slug: string, report: ConditionReport) => void;
  /** Re-read from the server. */
  refresh: () => void;
}

/**
 * Layers this page's just-filed reports back over a server response, but only
 * where the server hasn't caught up yet.
 *
 * The overlay exists for the race where a refresh beats the GET's 30-second
 * cache and comes back without the report the rider just filed. But it must not
 * outrank a *newer* server report — e.g. a steward closing the trail after the
 * rider rode it. Keep the local echo only while its observation is at least as
 * recent as the server's; an equal or newer server report wins, since the server
 * is the source of truth.
 */
function mergeLocal(
  server: Record<string, ConditionReport>,
  local: Record<string, ConditionReport>,
): Record<string, ConditionReport> {
  const merged = { ...server };
  for (const [slug, report] of Object.entries(local)) {
    const current = merged[slug];
    if (!current || report.observedAt > current.observedAt) {
      merged[slug] = report;
    }
  }
  return merged;
}

/** Open, for the same reason `NO_SUMMARY` is: a failure is not a closure. */
const NO_SUMMARY: ConditionSummary = {
  latest: {},
  locked: {},
  options: [],
  reporting: { enabled: true, message: '' },
};

const EMPTY: TrailConditionsValue = {
  latest: {},
  loading: false,
  lockedReason: () => null,
  options: [],
  recordLocal: () => {},
  refresh: () => {},
};

const TrailConditionsContext = createContext<TrailConditionsValue>(EMPTY);

/**
 * Why there is no error state: a component outside the provider, or one mounted
 * while the fetch is failing, gets `EMPTY` — which looks exactly like a map
 * nobody has reported on. Conditions must never stop something rendering.
 */
export function useTrailConditions(): TrailConditionsValue {
  return useContext(TrailConditionsContext);
}

export function TrailConditionsProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [summary, setSummary] = useState<ConditionSummary>(NO_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  /**
   * Reports filed from this page, layered back over every server response.
   *
   * A refresh right after a submission can race the GET's 30-second cache and
   * come back without the report the rider just filed, which reads as failure.
   * Never cleared, so one an admin hides stays visible to its author until they
   * reload — the better way to be wrong.
   */
  const localRef = useRef<Record<string, ConditionReport>>({});

  const recordLocal = useCallback((slug: string, report: ConditionReport) => {
    localRef.current = { ...localRef.current, [slug]: report };
    setSummary((prev) => ({
      ...prev,
      latest: { ...prev.latest, [slug]: report },
    }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    // `async` so a synchronous throw out of `fetch` is caught alongside a
    // network failure. This provider wraps the whole map, and an exception
    // escaping the effect would take it down.
    async function load() {
      try {
        const response = await fetch(
          `/api/map/conditions?city=${activeCityId}`,
          { signal: controller.signal },
        );
        const data: ConditionSummary | null = response?.ok
          ? await response.json()
          : null;

        if (data) {
          setSummary({
            ...data,
            latest: mergeLocal(data.latest, localRef.current),
            // An older deployment answering without these must not read as
            // "everything is closed".
            locked: data.locked ?? {},
            reporting: data.reporting ?? { enabled: true, message: '' },
          });
        }
        setLoading(false);
      } catch (error) {
        // An abort is cleanup, not a failure; the component is on its way out.
        if ((error as Error)?.name !== 'AbortError') {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [reloads]);

  const value = useMemo(
    () => ({
      latest: summary.latest,
      loading,
      lockedReason: (slug: string) => lockFor(summary, slug),
      options: summary.options,
      recordLocal,
      refresh,
    }),
    [summary, loading, recordLocal, refresh],
  );

  return (
    <TrailConditionsContext.Provider value={value}>
      {children}
    </TrailConditionsContext.Provider>
  );
}
