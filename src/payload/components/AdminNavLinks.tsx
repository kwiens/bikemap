'use client';

/**
 * The two places at the top of the admin nav that aren't collections.
 *
 * **Dashboard**, because Payload has none — the only way back is the logo,
 * which doesn't read as navigation and is easy to miss. Once the dashboard
 * carries something worth returning to (`DashboardSummary`: what has no line,
 * what has no chart, what warned on its last build), it needs a way back that
 * looks like one.
 *
 * **View map**, because the whole point of the admin is what comes out the
 * other end, and checking your edit meant typing a URL.
 *
 * Rendered through `admin.components.beforeNavLinks`, which puts them above the
 * collection groups rather than inside one — neither is a collection, and
 * filing them under some group would be a small lie.
 *
 * ## Why this uses Payload's own class names
 *
 * `nav__link`, `nav__link-indicator` and `nav__link-label` are Payload
 * internals, and the rule elsewhere in this project is to theme through CSS
 * variables and leave their selectors alone. That rule is about *overriding*
 * their styles, which is a fight you lose on upgrade. This is the opposite: a
 * nav link sitting inches from a dozen native ones has to be pixel-identical to
 * them — hover, spacing, the active indicator — and hand-styling it would drift
 * the moment the nav changed.
 *
 * The failure modes aren't comparable either. If Payload renames these classes
 * the links render unstyled but still work; a hand-styled version that drifts is
 * conspicuously wrong on every page. This markup mirrors `DefaultNavClient` —
 * check there first if it ever looks out of place.
 */
import { ExternalLinkIcon, Link, useConfig } from '@payloadcms/ui';
import { usePathname } from 'next/navigation';
import { formatAdminURL } from 'payload/shared';

const baseClass = 'nav';

export function AdminNavLinks() {
  const { config } = useConfig();
  const pathname = usePathname();

  const dashboard = formatAdminURL({
    adminRoute: config.routes.admin,
    path: '',
  });

  // Exact match only. `startsWith` would light the dashboard up on every page
  // in the admin, since they all live under the admin route.
  const onDashboard = pathname === dashboard || pathname === `${dashboard}/`;

  return (
    <>
      <NavItem active={onDashboard} href={dashboard} id="nav-dashboard">
        Dashboard
      </NavItem>

      {/*
       * A new tab, deliberately. The admin is a form-heavy app and a trail
       * being edited holds unsaved geometry — sending someone to the public
       * map in the same tab would quietly discard it.
       */}
      <a
        className={`${baseClass}__link`}
        href="/"
        id="nav-view-map"
        rel="noreferrer"
        target="_blank"
      >
        <span className={`${baseClass}__link-label`}>View map</span>
        <ExternalLinkIcon />
      </a>
    </>
  );
}

function NavItem({
  active,
  children,
  href,
  id,
}: {
  active: boolean;
  children: string;
  href: string;
  id: string;
}) {
  const label = (
    <>
      {active && <div className={`${baseClass}__link-indicator`} />}
      <span className={`${baseClass}__link-label`}>{children}</span>
    </>
  );

  // Payload renders the current page as a div rather than a link, so the nav
  // never offers to navigate to where you already are. Matched here.
  if (active) {
    return (
      <div className={`${baseClass}__link`} id={id}>
        {label}
      </div>
    );
  }

  return (
    <Link className={`${baseClass}__link`} href={href} id={id} prefetch={false}>
      {label}
    </Link>
  );
}
