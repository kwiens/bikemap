import { revalidateTag } from 'next/cache';
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload';

export const PUBLIC_TRAIL_SUMMARIES_CACHE_TAG = 'public-trail-summaries';
export const PUBLIC_TRAIL_GEOJSON_CACHE_TAG = 'public-trail-geojson';
export const PUBLIC_TRAIL_CACHE_REVALIDATE_SECONDS = 24 * 60 * 60;

function expireTags(tags: string[], req: PayloadRequest): void {
  try {
    // Callers pass only the summary tag or the two public trail cache tags.
    for (const tag of tags) {
      // A content write should make the next public read fresh. The normal
      // cache remains aggressive; only the first read after an edit refills it.
      revalidateTag(tag, { expire: 0 });
    }
  } catch (error) {
    // Payload's CLI can run collection hooks outside Next's request context.
    // A failed invalidation must not roll back the content write; the cached
    // reads also have a daily TTL as a backstop.
    req.payload.logger.warn({
      err: error,
      msg: `Could not invalidate public trail cache tags: ${tags.join(', ')}`,
    });
  }
}

export const invalidatePublicTrailDataAfterChange: CollectionAfterChangeHook =
  ({ doc, req }) => {
    expireTags(
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, PUBLIC_TRAIL_GEOJSON_CACHE_TAG],
      req,
    );
    return doc;
  };

export const invalidatePublicTrailDataAfterDelete: CollectionAfterDeleteHook =
  ({ doc, req }) => {
    expireTags(
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, PUBLIC_TRAIL_GEOJSON_CACHE_TAG],
      req,
    );
    return doc;
  };

export const invalidatePublicTrailSummariesAfterChange: CollectionAfterChangeHook =
  ({ doc, req }) => {
    expireTags([PUBLIC_TRAIL_SUMMARIES_CACHE_TAG], req);
    return doc;
  };

export const invalidatePublicTrailSummariesAfterDelete: CollectionAfterDeleteHook =
  ({ doc, req }) => {
    expireTags([PUBLIC_TRAIL_SUMMARIES_CACHE_TAG], req);
    return doc;
  };
