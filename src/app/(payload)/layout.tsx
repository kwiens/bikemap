/* THIS FILE IS PART OF PAYLOAD'S ADMIN SCAFFOLDING — see docs/adr/0001.
 *
 * The (payload) route group is deliberately separate from the public map so
 * Payload's global CSS can't leak into it. Nothing here imports app code.
 */
import type { ServerFunctionClient } from 'payload';
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts';
import config from '@payload-config';
import { importMap } from './admin/importMap';

import '@payloadcms/next/css';

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

export default function Layout({ children }: Args) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
}
