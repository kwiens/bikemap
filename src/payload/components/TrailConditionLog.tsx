'use client';

/**
 * Log a condition for the trail you already have open, and see the recent ones.
 *
 * Without this, a steward posting "closed, trees down" has to leave the trail,
 * go to Condition reports, hit Create, and find the trail again in a dropdown of
 * several hundred — for the one thing they came to say.
 *
 * A `ui` field, so it adds no column and needs no migration. It writes through
 * Payload's own REST API rather than a custom endpoint: the collection's
 * `create` rule already asks for an admin, and the editor's session satisfies
 * it. That keeps the public route the only unauthenticated door.
 *
 * Reports filed here are `source: 'admin'` — the trail steward saying so, which
 * the map marks differently from a rider's guess.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDocumentInfo } from '@payloadcms/ui';
import { cn } from '@/lib/utils';
import { observedAtNoonUtc } from '@/data/trail-conditions';
import { Banner } from './admin-ui';

interface ConditionType {
  color?: null | string;
  id: number;
  name: string;
  value: string;
}

interface Report {
  condition: ConditionType | number;
  hidden?: boolean | null;
  id: number;
  observedAt: string;
  source: 'admin' | 'public';
}

const HISTORY_LIMIT = 8;

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function typeOf(report: Report): ConditionType | null {
  return typeof report.condition === 'object' ? report.condition : null;
}

const CONTROL_CLASS =
  'rounded-[var(--style-radius-s)] border border-solid border-[var(--theme-elevation-150)] bg-[var(--theme-input-bg)] px-2.5 py-1.5 text-[var(--theme-text)]';

export function TrailConditionLog() {
  const { id } = useDocumentInfo();
  const [types, setTypes] = useState<ConditionType[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [condition, setCondition] = useState('');
  const [observedAt, setObservedAt] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [loaded, setLoaded] = useState(false);

  const loadReports = useCallback(async () => {
    if (!id) {
      return;
    }
    try {
      const response = await fetch(
        `/api/trail-conditions?depth=1&limit=${HISTORY_LIMIT}&sort=-observedAt,-createdAt,-id&select[condition]=true&select[hidden]=true&select[observedAt]=true&select[source]=true&where[trail][equals]=${id}`,
        { credentials: 'include' },
      );
      const data = await response.json();
      setReports(Array.isArray(data?.docs) ? data.docs : []);
    } catch {
      // A history that won't load is not worth an error on a form the editor
      // came here to use for something else.
      setReports([]);
    }
  }, [id]);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(
          '/api/trail-condition-types?limit=100&sort=sortOrder&where[active][not_equals]=false',
          { credentials: 'include' },
        );
        const data = await response.json();
        setTypes(Array.isArray(data?.docs) ? data.docs : []);
      } catch {
        setTypes([]);
      }
      await loadReports();
      setLoaded(true);
    }
    void load();
  }, [loadReports]);

  async function submit() {
    if (!id || !condition || !observedAt || busy) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/trail-conditions', {
        body: JSON.stringify({
          condition: Number(condition),
          hidden: false,
          // Noon UTC, so the day reads correctly for admins west of UTC.
          observedAt: observedAtNoonUtc(observedAt),
          // Filed by a signed-in steward, not a rider.
          source: 'admin',
          trail: id,
        }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.errors?.[0]?.message ?? 'Could not save that report.');
        setBusy(false);
        return;
      }

      setCondition('');
      setObservedAt(today());
      await loadReports();
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(false);
  }

  async function hide(reportId: number) {
    try {
      const response = await fetch(`/api/trail-conditions/${reportId}`, {
        body: JSON.stringify({ hidden: true }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Could not hide that report.');
      await loadReports();
    } catch {
      setError('Could not hide that report.');
    }
  }

  // A report needs a trail to point at, and an unsaved document has no id.
  if (!id) {
    return (
      <div className="field-type">
        <Banner>
          Save the trail first, then you can log a condition for it.
        </Banner>
      </div>
    );
  }

  if (loaded && types.length === 0) {
    return (
      <div className="field-type">
        <Banner tone="warning">
          No conditions to pick from. Add some under Lists → Trail conditions.
        </Banner>
      </div>
    );
  }

  return (
    <div className="field-type">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-[0.8rem]">Condition</span>
          <select
            onChange={(event) => setCondition(event.target.value)}
            className={cn(CONTROL_CLASS, 'min-w-48')}
            value={condition}
          >
            <option value="">Pick one…</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-[0.8rem]">Observed</span>
          <input
            max={today()}
            onChange={(event) => setObservedAt(event.target.value)}
            className={CONTROL_CLASS}
            type="date"
            value={observedAt}
          />
        </label>

        <button
          className="m-0 cursor-pointer rounded-[var(--style-radius-s)] border-0 bg-[var(--theme-text)] px-3 py-2 text-[var(--theme-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!condition || !observedAt || busy}
          onClick={submit}
          type="button"
        >
          {busy ? 'Saving…' : 'Log condition'}
        </button>
      </div>

      {reports.length > 0 && (
        <table className="w-full border-collapse text-[0.85rem]">
          <tbody>
            {reports.map((report) => {
              const type = typeOf(report);
              return (
                <tr
                  key={report.id}
                  className={cn(
                    'border-x-0 border-b-0 border-t border-solid border-[var(--theme-elevation-100)]',
                    report.hidden && 'opacity-[0.45]',
                  )}
                >
                  <td className="py-[0.35rem] pr-2">
                    <span
                      className="mr-2 inline-block h-[0.6rem] w-[0.6rem] rounded-full"
                      style={{
                        background: type?.color ?? 'var(--theme-elevation-300)',
                      }}
                    />
                    {type?.name ?? 'Unknown'}
                  </td>
                  <td className="text-[var(--theme-elevation-600)]">
                    {/* UTC: observedAt is a day, stored at noon UTC — rendering
                        in local time would slide it a day west of UTC. */}
                    {new Date(report.observedAt).toLocaleDateString(undefined, {
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="text-[var(--theme-elevation-600)]">
                    {report.source === 'admin' ? 'Official' : 'Rider'}
                  </td>
                  <td className="text-right">
                    {report.hidden ? (
                      <span className="text-[var(--theme-elevation-500)]">
                        Hidden
                      </span>
                    ) : (
                      <button
                        onClick={() => hide(report.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-[var(--theme-error-500)] underline"
                        type="button"
                      >
                        Hide
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {loaded && reports.length === 0 && (
        <p className="m-0 text-[var(--theme-elevation-500)]">
          Nothing reported yet.
        </p>
      )}
    </div>
  );
}
