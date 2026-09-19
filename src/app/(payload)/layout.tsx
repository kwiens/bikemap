/* THIS FILE IS PART OF PAYLOAD'S ADMIN SCAFFOLDING — see docs/adr/0001.
 *
 * The (payload) route group is deliberately separate from the public map so
 * Payload's global CSS can't leak into it. Nothing here imports app code.
 */
import type { ServerFunctionClient } from 'payload';
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts';
import localFont from 'next/font/local';
import config from '@payload-config';
import { getThemeCss } from '@/payload/read/theme';
import { importMap } from './admin/importMap';

import '@payloadcms/next/css';
// Must come after Payload's stylesheet — see the note in custom.css about why
// this needs no !important.
import './custom.css';

// The same self-hosted Geist the public app uses, so the admin doesn't look
// like a different product. Loaded here rather than shared with (frontend)
// because the two route groups are separate trees with no common layout.
const geistSans = localFont({
  display: 'swap',
  src: '../(frontend)/fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
});

const geistMono = localFont({
  display: 'swap',
  src: '../(frontend)/fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
});

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async (args) => {
  'use server';
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

export default async function Layout({ children }: Args) {
  // The saved theme, as CSS custom properties. Rendered after custom.css so a
  // theme edited in the admin wins over the stylesheet defaults; empty when
  // nothing is saved or the database is unreachable.
  const themeCss = await getThemeCss();

  return (
    <RootLayout
      // htmlProps is the supported way to reach Payload's <html>; it renders
      // that element itself, so the font variables have to go through here.
      htmlProps={{ className: `${geistSans.variable} ${geistMono.variable}` }}
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {themeCss && (
        // Arrives in the streamed RSC payload rather than the initial <head>:
        // this sits inside Payload's client provider, so React won't hoist it
        // even given `href`/`precedence` (tried — the props don't survive).
        // That's fine here, because the admin renders nothing until hydration,
        // so there is no paint for a wrong theme to flash on. Don't "fix" it
        // with a CSS `@import`, which has to come first in a file and would
        // therefore lose to custom.css rather than override it.
        //
        // Content is custom properties only; see sanitizeCss in read/theme.ts
        // for why it cannot close its own <style> element.
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      )}
      {children}
    </RootLayout>
  );
}
