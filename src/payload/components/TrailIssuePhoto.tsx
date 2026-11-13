'use client';

import { useDocumentInfo, useField } from '@payloadcms/ui';

export function TrailIssuePhoto() {
  const { id } = useDocumentInfo();
  const { value: hasPhoto } = useField<boolean>({ path: 'hasPhoto' });
  if (!id || !hasPhoto) return null;

  const url = `/api/trail-issues/${encodeURIComponent(id)}/photo`;
  return (
    <figure className="my-4">
      <figcaption className="mb-2 font-medium">Rider photo</figcaption>
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- The photo endpoint requires the admin session. */}
        <img
          className="max-h-80 max-w-full rounded-md object-contain"
          src={url}
          alt="Photo attached to the trail issue"
        />
      </a>
    </figure>
  );
}
