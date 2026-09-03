import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { siteConfigForHostname } from '@/config/site.config';
import { getRequestHostname } from '@/utils/request-hostname';
import { EmbedSnippetBuilder } from '@/components/embed/EmbedSnippetBuilder';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// A mock third-party site showing the embed working in context, plus a
// snippet builder partners can use to grab their own copy-paste embed code.
export default async function EmbedDemoPage(): Promise<ReactElement> {
  const config = siteConfigForHostname(await getRequestHostname());

  return (
    <div className="min-h-screen bg-white text-gray-800">
      <header className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Riverside Bike Rentals
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            Plan your ride around town
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="prose-none">
          <p className="text-gray-600">
            Riverside Bike Rentals has been getting locals and visitors on two
            wheels since forever ago. Whether you&apos;re after a lazy ride
            along the water or want to hit some singletrack, our fleet of
            hybrid, road, and mountain bikes has you covered.
          </p>
          <p className="mt-4 text-gray-600">
            Not sure where to go? Use the interactive map below to explore
            routes and local attractions before you swing by to pick up your
            bike.
          </p>
        </article>

        <div className="mt-8">
          <EmbedSnippetBuilder baseUrl={config.url} />
        </div>
      </main>
    </div>
  );
}
