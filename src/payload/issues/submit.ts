import 'server-only';

import { createHash } from 'node:crypto';
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres';
import { createLocalReq, getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { TrailIssueType } from '@/data/trail-issues';
import { RATE_LIMIT } from '@/payload/conditions/guard';
import { normalizeIssuePhoto } from './photo';

interface IssueInput {
  category: TrailIssueType;
  city: CityId;
  comment: string;
  photo: File | null;
  reporterHash: string;
  slug: string;
  submissionId: string;
}

type IssueResult = { ok: true } | { ok: false; status: number; error: string };

export async function submitTrailIssue(
  input: IssueInput,
): Promise<IssueResult> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      status: 503,
      error: 'Trail issues are unavailable on this map.',
    };
  }

  try {
    const payload = await getPayload({ config });
    const db = payload.db as unknown as PostgresAdapter;
    const submissionId = createHash('sha256')
      .update(input.reporterHash + ':' + input.submissionId)
      .digest('hex');
    const transactionID = await db.beginTransaction({
      isolationLevel: 'read committed',
    });
    if (!transactionID)
      throw new Error('Issue reporting requires a transaction.');

    try {
      const req = await createLocalReq({ req: { transactionID } }, payload);
      const transaction = db.sessions[transactionID]?.db;
      if (!transaction)
        throw new Error('Issue reporting transaction was lost.');

      // Serialize retries and the per-reporter count across app instances.
      await transaction.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${'bikemap-trail-issue:' + input.reporterHash}, 0))
      `);
      const previous = await payload.find({
        collection: 'trail-issues',
        where: { submissionId: { equals: submissionId } },
        depth: 0,
        select: {},
        limit: 1,
        req,
      });
      if (previous.docs.length) return { ok: true };

      const [trails, recent] = await Promise.all([
        payload.find({
          collection: 'trails',
          where: {
            slug: { equals: input.slug },
            city: { equals: input.city },
            _status: { equals: 'published' },
          },
          depth: 0,
          select: { displayName: true, trailName: true, city: true },
          limit: 1,
          req,
        }),
        payload.count({
          collection: 'trail-issues',
          where: {
            reporterHash: { equals: input.reporterHash },
            createdAt: {
              greater_than: new Date(Date.now() - 3_600_000).toISOString(),
            },
          },
          req,
        }),
      ]);
      const trail = trails.docs[0];
      if (!trail)
        return {
          ok: false,
          status: 404,
          error: 'That trail is no longer available for reporting.',
        };
      if (recent.totalDocs >= RATE_LIMIT.perHour) {
        return {
          ok: false,
          status: 429,
          error:
            'You have reached the hourly issue report limit. Try again later.',
        };
      }

      let image: Buffer | null = null;
      if (input.photo) {
        try {
          image = await normalizeIssuePhoto(input.photo);
        } catch {
          return {
            ok: false,
            status: 422,
            error:
              'Could not read that photo. Try another photo or send the report without it.',
          };
        }
      }

      const issue = await payload.create({
        collection: 'trail-issues',
        depth: 0,
        req,
        data: {
          category: input.category,
          city: trail.city,
          comment: input.comment || null,
          hasPhoto: image !== null,
          reporterHash: input.reporterHash,
          status: 'open',
          submissionId,
          trail: trail.id,
          trailName: trail.displayName || trail.trailName,
        },
      });
      if (image) {
        await transaction.execute(sql`
          insert into trail_issue_photos (issue_id, image) values (${issue.id}, ${image})
        `);
      }
      await db.commitTransaction(transactionID);
      return { ok: true };
    } finally {
      await db.rollbackTransaction(transactionID);
    }
  } catch (error) {
    console.error('Could not file a trail issue.', error);
    return {
      ok: false,
      status: 503,
      error: 'Could not save the report. Please try again.',
    };
  }
}
