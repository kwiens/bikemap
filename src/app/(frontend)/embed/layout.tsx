import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Embed pages are framed on third-party sites — keep them out of search
// results. The root layout still provides <html>/<body>.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return children;
}
