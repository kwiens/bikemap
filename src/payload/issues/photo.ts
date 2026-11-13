import { sql, type PostgresAdapter } from '@payloadcms/db-postgres';
import type { PayloadHandler } from 'payload';
import sharp from 'sharp';
import {
  ISSUE_PHOTO_MAX_BYTES,
  ISSUE_PHOTO_MAX_EDGE,
} from '@/data/trail-issues';

const MAX_INPUT_PIXELS = 40_000_000;

export async function normalizeIssuePhoto(photo: File): Promise<Buffer> {
  if (photo.size > ISSUE_PHOTO_MAX_BYTES)
    throw new Error('Photo is too large.');

  const image = sharp(await photo.arrayBuffer(), {
    failOn: 'warning',
    limitInputPixels: MAX_INPUT_PIXELS,
  });
  const { format } = await image.metadata();
  if (format !== 'jpeg' && format !== 'png' && format !== 'webp') {
    throw new Error('Unsupported photo format.');
  }

  // Re-encoding without metadata removes EXIF, including any GPS coordinates.
  return image
    .autoOrient()
    .resize({
      width: ISSUE_PHOTO_MAX_EDGE,
      height: ISSUE_PHOTO_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export const readIssuePhoto: PayloadHandler = async (req) => {
  if (!req.user) return new Response(null, { status: 401 });

  const id = Number(req.routeParams?.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return new Response(null, { status: 404 });
  }
  const issue = await req.payload.findByID({
    collection: 'trail-issues',
    id,
    depth: 0,
    select: { hasPhoto: true },
    overrideAccess: false,
    disableErrors: true,
    req,
  });
  if (!issue?.hasPhoto) return new Response(null, { status: 404 });

  const db = req.payload.db as unknown as PostgresAdapter;
  const result = await db.drizzle.execute<{ image: Buffer }>(
    sql`select image from trail_issue_photos where issue_id = ${issue.id}`,
  );
  const photo = result.rows[0]?.image;
  if (!photo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(photo), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
