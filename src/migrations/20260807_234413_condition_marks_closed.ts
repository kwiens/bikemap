import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Lets a condition mark the trail closed on the map, rather than the app
 * hardcoding the value 'closed' — a curator can flag "Snow / ice" the same way.
 *
 * The backfill is the point: the column defaults to false, so without it the
 * existing Closed row would stop meaning anything the moment this shipped.
 * Matched on `value`, which is the stable key; `name` is a label a curator may
 * have reworded.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trail_condition_types" ADD COLUMN "marks_closed" boolean DEFAULT false;
  CREATE INDEX "trail_condition_types_marks_closed_idx" ON "trail_condition_types" USING btree ("marks_closed");`)

  await db.execute(sql`
  UPDATE "trail_condition_types" SET "marks_closed" = true WHERE "value" = 'closed';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "trail_condition_types_marks_closed_idx";
  ALTER TABLE "trail_condition_types" DROP COLUMN "marks_closed";`)
}
