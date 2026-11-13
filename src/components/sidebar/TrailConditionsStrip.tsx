'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { activeCityId } from '@/config/map.config';
import { useTrailConditions } from '@/components/TrailConditionsProvider';
import {
  type ConditionReport,
  conditionAgeLabel,
  isConditionCurrent,
} from '@/data/trail-conditions';
import { ConditionBadge } from './ConditionBadge';

export function TrailConditionsStrip({
  report,
  lockedReason,
}: {
  report?: ConditionReport;
  lockedReason: string | null;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
      {report ? (
        isConditionCurrent(report) ? (
          <ConditionBadge report={report} showAge />
        ) : (
          <span>
            Last reported {conditionAgeLabel(report.observedAt)} —{' '}
            {report.name.toLowerCase()}
          </span>
        )
      ) : (
        <span>No recent condition reports</span>
      )}
      {lockedReason !== null && (
        <span className="flex items-baseline gap-1">
          <FontAwesomeIcon aria-hidden="true" icon={faLock} />
          <span>{lockedReason}</span>
        </span>
      )}
    </div>
  );
}

export function TrailConditionHistory({
  slug,
  canReport,
}: {
  slug: string;
  canReport: boolean;
}) {
  const { historyRevision } = useTrailConditions();
  const [history, setHistory] = useState<ConditionReport[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A submission can change history even when it leaves the latest badge alone.
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);

    async function load() {
      try {
        const response = await fetch(
          `/api/map/conditions/${encodeURIComponent(slug)}?city=${activeCityId}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const data: { reports: ConditionReport[] } | null = response?.ok
          ? await response.json()
          : null;
        if (controller.signal.aborted) return;
        setHistory(data?.reports ?? []);
      } catch {
        if (controller.signal.aborted) return;
        setHistory([]);
      }
      setIsLoading(false);
    }

    void load();
    return () => controller.abort();
  }, [slug, historyRevision]);

  if (isLoading) {
    return (
      <p role="status" className="py-3 text-sm text-gray-600">
        Loading condition history…
      </p>
    );
  }

  if (!history?.length) {
    return (
      <p className="py-3 text-sm text-gray-600">
        {canReport
          ? 'Nothing reported yet. Ridden it lately?'
          : 'Nothing reported.'}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {history.map((report) => (
        <li key={report.id} className="flex items-center gap-3 py-3 text-sm">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: report.color }}
          />
          <span className="min-w-0 flex-1 text-gray-800">{report.name}</span>
          <span className="shrink-0 text-gray-600">
            {conditionAgeLabel(report.observedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
