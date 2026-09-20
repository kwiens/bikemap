/**
 * A per-city health summary above Payload's default collection cards. This is
 * a server component: each city query starts together, and only small counts
 * and links are rendered into the admin page.
 */
import Link from 'next/link';
import { cityConfigs, cityIds } from '@/config/map.config';
import type { CityId } from '@/data/cities/types';
import { getTrailSummary } from '@/payload/read/summary';
import type { TrailSummary } from '@/payload/read/summary-model';

type Tone = 'attention' | 'plain';
type QueryOperator = 'equals' | 'exists' | 'not_equals';

interface TrailFilter {
  field: string;
  operator: QueryOperator;
  value: string;
}

const FILTERS = {
  drafts: [{ field: '_status', operator: 'not_equals', value: 'published' }],
  missingGeometry: [
    { field: '_status', operator: 'equals', value: 'published' },
    { field: 'geom', operator: 'exists', value: 'false' },
  ],
  missingProfile: [
    { field: '_status', operator: 'equals', value: 'published' },
    { field: 'geom', operator: 'exists', value: 'true' },
    { field: 'elevationProfile', operator: 'exists', value: 'false' },
  ],
  published: [{ field: '_status', operator: 'equals', value: 'published' }],
} satisfies Record<string, TrailFilter[]>;

export async function DashboardSummary() {
  const summaries = await Promise.all(cityIds.map(getTrailSummary));

  return (
    <section style={{ marginBottom: 'var(--base, 1.5rem)' }}>
      {summaries.map((summary) => (
        <CitySummary key={summary.city} summary={summary} />
      ))}
    </section>
  );
}

function CitySummary({ summary }: { summary: TrailSummary }) {
  const cityName = cityConfigs[summary.city].region.displayName;

  return (
    <article style={{ marginBottom: '2rem' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{cityName}</h2>
        <p
          style={{
            color: 'var(--theme-elevation-600)',
            margin: '0.25rem 0 0',
          }}
        >
          {summary.unavailable
            ? 'The trail database is unreachable, so these counts are unavailable. The admin still works; the public map is falling back to its checked-in data.'
            : 'Trails in the shared database, scoped to this city.'}
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
        }}
      >
        <Stat
          href={trailListHref(summary.city, FILTERS.published)}
          label="Published"
          note="live on the map"
          value={summary.published}
        />
        <Stat
          href={trailListHref(summary.city, FILTERS.drafts)}
          label="Drafts"
          note="not yet public"
          value={summary.drafts}
        />
        <Stat
          href={trailListHref(summary.city, FILTERS.missingGeometry)}
          label="No line"
          note="draw nothing on the map"
          tone={summary.missingGeometry ? 'attention' : 'plain'}
          value={summary.missingGeometry}
        />
        <Stat
          href={trailListHref(summary.city, FILTERS.missingProfile)}
          label="No elevation"
          note="chart is empty"
          tone={summary.missingProfile ? 'attention' : 'plain'}
          value={summary.missingProfile}
        />
        <Stat
          href={trailListHref(summary.city)}
          label="Build warnings"
          note="gaps or missing ways"
          tone={summary.withWarnings ? 'attention' : 'plain'}
          value={summary.withWarnings}
        />
        {/* Plain, never 'attention': riders reporting conditions is the system
            working. It is here so a sudden spike is visible, not as a chore. */}
        <Stat
          href={`/admin/collections/trail-conditions?where[city][equals]=${summary.city}`}
          label="Reports"
          note="filed in the last 7 days"
          value={summary.reportsThisWeek}
        />
      </div>

      {summary.recent.length > 0 ? (
        <div style={{ marginTop: '1.25rem' }}>
          <h3
            style={{
              color: 'var(--theme-elevation-600)',
              fontSize: '0.8rem',
              fontWeight: 500,
              letterSpacing: '0.04em',
              margin: '0 0 0.5rem',
              textTransform: 'uppercase',
            }}
          >
            Recently edited
          </h3>
          <ul
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {summary.recent.map((trail) => (
              <li key={trail.id}>
                <Link
                  href={`/admin/collections/trails/${trail.id}`}
                  style={{
                    background: 'var(--theme-elevation-50)',
                    border: '1px solid var(--theme-elevation-150)',
                    borderRadius: 'var(--style-radius-s)',
                    color: 'var(--theme-elevation-800)',
                    display: 'inline-block',
                    padding: '0.3rem 0.7rem',
                    textDecoration: 'none',
                  }}
                >
                  {trail.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function Stat({
  href,
  label,
  note,
  tone = 'plain',
  value,
}: {
  href: string;
  label: string;
  note: string;
  tone?: Tone;
  value: null | number;
}) {
  const attention = tone === 'attention';

  return (
    <Link
      href={href}
      style={{
        background: attention
          ? 'var(--theme-warning-50, var(--theme-elevation-50))'
          : 'var(--theme-elevation-50)',
        border: `1px solid ${
          attention
            ? 'var(--theme-warning-250, var(--theme-elevation-150))'
            : 'var(--theme-elevation-150)'
        }`,
        borderRadius: 'var(--style-radius-m)',
        color: 'inherit',
        display: 'block',
        padding: '0.9rem 1rem',
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          fontSize: '1.75rem',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          lineHeight: 1.1,
        }}
      >
        {value === null ? '—' : value.toLocaleString()}
      </div>
      <div style={{ fontWeight: 500, marginTop: '0.35rem' }}>{label}</div>
      <div
        style={{
          color: 'var(--theme-elevation-500)',
          fontSize: '0.8rem',
          marginTop: '0.1rem',
        }}
      >
        {note}
      </div>
    </Link>
  );
}

function trailListHref(city: CityId, filters: TrailFilter[] = []): string {
  const search = new URLSearchParams();
  search.set('where[city][equals]', city);
  for (const filter of filters) {
    search.set(`where[${filter.field}][${filter.operator}]`, filter.value);
  }
  return `/admin/collections/trails?${search.toString()}`;
}
