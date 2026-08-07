'use client';

/**
 * Conditions in the selected-trail pane: what it is like now, what it has been
 * like, and the way to say what you found.
 *
 * One line under the pane header, like the OSM tag strip beside it. The report
 * button stays even with no reports — an unreported trail is the one worth
 * asking about.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronDown,
  faChevronRight,
  faLock,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import { activeCityId } from '@/config/map.config';
import { useTrailConditions } from '@/components/TrailConditionsProvider';
import {
  type ConditionReport,
  conditionAgeLabel,
  isConditionFresh,
} from '@/data/trail-conditions';
import { MAP_EVENTS } from '@/events';
import { cn } from '@/lib/utils';
import { ConditionBadge } from './ConditionBadge';

const LINK_CLASS =
  'bg-transparent border-none p-0 cursor-pointer text-[10px] text-blue-600 hover:underline shrink-0';

export function TrailConditionsStrip({
  slug,
  trailName,
}: {
  slug: string;
  trailName: string;
}) {
  const { latest, lockedReason: reasonFor, options } = useTrailConditions();
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<ConditionReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Which trail the loaded history belongs to, so switching trails can't leave
  // one trail's reports under another's name.
  const loadedFor = useRef<string | null>(null);

  const current = latest[slug];

  // Collapse when the pane moves on, or the previous trail's history shows
  // until the refetch lands.
  useEffect(() => {
    setExpanded(false);
    setHistory(null);
    loadedFor.current = null;
  }, [slug]);

  useEffect(() => {
    if (!expanded || loadedFor.current === slug) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    // `async` so a synchronous throw is caught too, as in the provider.
    async function load() {
      try {
        const response = await fetch(
          `/api/map/conditions/${encodeURIComponent(slug)}?city=${activeCityId}`,
          { signal: controller.signal },
        );
        const data: { reports: ConditionReport[] } | null = response?.ok
          ? await response.json()
          : null;
        setHistory(data?.reports ?? []);
        loadedFor.current = slug;
        setLoading(false);
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          // "Nobody has reported this yet" beats an error on a small panel.
          setHistory([]);
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [expanded, slug]);

  const openReport = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.CONDITION_REPORT_OPEN, {
        detail: { slug, trailName },
      }),
    );
  }, [slug, trailName]);

  // No vocabulary means no database, so nothing to show and nowhere to send.
  if (options.length === 0) {
    return null;
  }

  const stale = current && !isConditionFresh(current.observedAt);
  const lockedReason = reasonFor(slug);

  return (
    <div className="text-[10px] text-gray-500 mb-1 -mt-0.5">
      <div className="flex items-center gap-2">
        {current ? (
          <>
            <ConditionBadge report={current} showAge />
            {/* The badge hides a stale report, which would leave this row
                looking like nobody had ever reported the trail. */}
            {stale && (
              <span className="truncate">
                Last reported {conditionAgeLabel(current.observedAt)} —{' '}
                {current.name.toLowerCase()}
              </span>
            )}
          </>
        ) : (
          <span className="truncate">No recent condition reports</span>
        )}

        <button
          type="button"
          className={cn(LINK_CLASS, 'ml-auto')}
          onClick={() => setExpanded((open) => !open)}
        >
          <FontAwesomeIcon
            icon={expanded ? faChevronDown : faChevronRight}
            className="mr-1"
          />
          History
        </button>
        {lockedReason === null ? (
          <button type="button" className={LINK_CLASS} onClick={openReport}>
            <FontAwesomeIcon icon={faPenToSquare} className="mr-1" />
            Report
          </button>
        ) : (
          /* The steward's sentence, where the button was. The badge and history
             stay: closing the form does not unsay what was already reported. */
          <span
            className="flex items-center gap-1 shrink-0 max-w-[55%] text-gray-400"
            title={lockedReason}
          >
            <FontAwesomeIcon icon={faLock} />
            <span className="truncate">{lockedReason}</span>
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-1 max-h-24 overflow-y-auto pr-1">
          {loading && <div className="py-0.5">Loading…</div>}
          {!loading && history?.length === 0 && (
            <div className="py-0.5">
              {/* Don't invite a report the trail won't take. */}
              {lockedReason === null
                ? 'Nothing reported yet. Ridden it lately?'
                : 'Nothing reported.'}
            </div>
          )}
          {!loading &&
            history?.map((report) => (
              <div
                // Two reports can share a date, so the date alone isn't a key.
                key={`${report.observedAt}-${report.value}-${report.source}`}
                className="flex items-center gap-2 py-0.5"
              >
                <span
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: report.color }}
                />
                <span className="truncate">{report.name}</span>
                <span className="ml-auto shrink-0 opacity-70">
                  {conditionAgeLabel(report.observedAt)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
