/**
 * What the admin opens on.
 *
 * A server component, rendered above Payload's collection cards through
 * `admin.components.beforeDashboard`. Additive rather than a replacement
 * dashboard view: the cards are a perfectly good way to reach a collection, and
 * they keep working if this ever fails to render.
 *
 * Styled entirely from Payload's own CSS variables, so it follows the theme —
 * including whatever the Theme global has been set to, and dark mode — without
 * knowing anything about either.
 */
import Link from 'next/link';
import { cityConfigs } from '@/config/map.config';
import { getTrailSummary } from '@/payload/read/summary';

/** Cards that mean "something needs doing" get a tone; plain counts don't. */
type Tone = 'attention' | 'plain';

export async function DashboardSummary() {
  const summary = await getTrailSummary();
  const cityName = cityConfigs[summary.city]?.region?.name ?? summary.city;

  return (
    <section style={{ marginBottom: 'var(--base, 1.5rem)' }}>
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
            : 'Trails this deployment is serving, and anything that needs a look.'}
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
          href="/admin/collections/trails?where[_status][equals]=published"
          label="Published"
          note="live on the map"
          value={summary.published}
        />
        <Stat
          href="/admin/collections/trails?where[_status][not_equals]=published"
          label="Drafts"
          note="not yet public"
          value={summary.drafts}
        />
        <Stat
          href="/admin/collections/trails"
          label="No line"
          note="draw nothing on the map"
          tone={summary.missingGeometry ? 'attention' : 'plain'}
          value={summary.missingGeometry}
        />
        <Stat
          href="/admin/collections/trails"
          label="No elevation"
          note="chart is empty"
          tone={summary.missingProfile ? 'attention' : 'plain'}
          value={summary.missingProfile}
        />
        <Stat
          href="/admin/collections/trails"
          label="Build warnings"
          note="gaps or missing ways"
          tone={summary.withWarnings ? 'attention' : 'plain'}
          value={summary.withWarnings}
        />
      </div>

      {summary.recent.length > 0 && (
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
      )}
    </section>
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
        {/* An unreachable database is not zero, and showing 0 would be a lie. */}
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
