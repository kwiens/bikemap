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
import { useDocumentInfo, useFormFields } from '@payloadcms/ui';
import { observedAtNoonUtc } from '@/data/trail-conditions';
import { Banner, linkButtonStyle } from './admin-ui';

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

const CONTROL: React.CSSProperties = {
  background: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-text)',
  padding: '0.4rem 0.6rem',
};

export function TrailConditionLog() {
  const { id } = useDocumentInfo();
  // The trail's own city, straight from the edit form. Without it the report
  // takes the collection's default (the deployment's active city), so a report
  // logged on another city's trail would never surface on that city's map.
  const city = useFormFields(
    ([fields]) => fields?.city?.value as string | undefined,
  );

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
        `/api/trail-conditions?depth=1&limit=${HISTORY_LIMIT}&sort=-observedAt&where[trail][equals]=${id}`,
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
    if (!id || !condition || busy) {
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/trail-conditions', {
        body: JSON.stringify({
          // Stamp the trail's own city, not the collection default.
          ...(city ? { city } : {}),
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
      await fetch(`/api/trail-conditions/${reportId}`, {
        body: JSON.stringify({ hidden: true }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
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

      <div
        style={{
          alignItems: 'end',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}
      >
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem' }}>Condition</span>
          <select
            onChange={(event) => setCondition(event.target.value)}
            style={{ ...CONTROL, minWidth: '12rem' }}
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

        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem' }}>Observed</span>
          <input
            max={today()}
            onChange={(event) => setObservedAt(event.target.value)}
            style={CONTROL}
            type="date"
            value={observedAt}
          />
        </label>

        <button
          className="btn btn--style-primary btn--size-small"
          disabled={!condition || busy}
          onClick={submit}
          style={{ margin: 0 }}
          type="button"
        >
          {busy ? 'Saving…' : 'Log condition'}
        </button>
      </div>

      {reports.length > 0 && (
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
            width: '100%',
          }}
        >
          <tbody>
            {reports.map((report) => {
              const type = typeOf(report);
              return (
                <tr
                  key={report.id}
                  style={{
                    borderTop: '1px solid var(--theme-elevation-100)',
                    opacity: report.hidden ? 0.45 : 1,
                  }}
                >
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>
                    <span
                      style={{
                        background: type?.color ?? 'var(--theme-elevation-300)',
                        borderRadius: '50%',
                        display: 'inline-block',
                        height: '0.6rem',
                        marginRight: '0.5rem',
                        width: '0.6rem',
                      }}
                    />
                    {type?.name ?? 'Unknown'}
                  </td>
                  <td style={{ color: 'var(--theme-elevation-600)' }}>
                    {/* UTC: observedAt is a day, stored at noon UTC — rendering
                        in local time would slide it a day west of UTC. */}
                    {new Date(report.observedAt).toLocaleDateString(undefined, {
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td style={{ color: 'var(--theme-elevation-600)' }}>
                    {report.source === 'admin' ? 'Official' : 'Rider'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {report.hidden ? (
                      <span style={{ color: 'var(--theme-elevation-500)' }}>
                        Hidden
                      </span>
                    ) : (
                      <button
                        onClick={() => hide(report.id)}
                        style={linkButtonStyle('danger')}
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
        <p style={{ color: 'var(--theme-elevation-500)', margin: 0 }}>
          Nothing reported yet.
        </p>
      )}
    </div>
  );
}
