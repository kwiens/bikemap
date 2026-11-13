import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The three switches that close condition reporting: the `condition_reporting`
 * global, and a `condition_reports_closed` flag plus note on `trails` and
 * `trail_areas`.
 *
 * No backfill needed by design: the flag is named for the exception, so
 * `DEFAULT false` leaves every existing trail open — which is what it was. A
 * positive `accept_condition_reports` would have needed a data migration.
 *
 * `_trails_v` gets the same pair because Trails has drafts on.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "condition_reporting" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"disabled_message" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "trails" ADD COLUMN "condition_reports_closed" boolean DEFAULT false;
  ALTER TABLE "trails" ADD COLUMN "condition_reports_note" varchar;
  ALTER TABLE "_trails_v" ADD COLUMN "version_condition_reports_closed" boolean DEFAULT false;
  ALTER TABLE "_trails_v" ADD COLUMN "version_condition_reports_note" varchar;
  ALTER TABLE "trail_areas" ADD COLUMN "condition_reports_closed" boolean DEFAULT false;
  ALTER TABLE "trail_areas" ADD COLUMN "condition_reports_note" varchar;
  CREATE INDEX "trails_condition_reports_closed_idx" ON "trails" USING btree ("condition_reports_closed");
  CREATE INDEX "_trails_v_version_version_condition_reports_closed_idx" ON "_trails_v" USING btree ("version_condition_reports_closed");
  CREATE INDEX "trail_areas_condition_reports_closed_idx" ON "trail_areas" USING btree ("condition_reports_closed");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "condition_reporting" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "condition_reporting" CASCADE;
  DROP INDEX "trails_condition_reports_closed_idx";
  DROP INDEX "_trails_v_version_version_condition_reports_closed_idx";
  DROP INDEX "trail_areas_condition_reports_closed_idx";
  ALTER TABLE "trails" DROP COLUMN "condition_reports_closed";
  ALTER TABLE "trails" DROP COLUMN "condition_reports_note";
  ALTER TABLE "_trails_v" DROP COLUMN "version_condition_reports_closed";
  ALTER TABLE "_trails_v" DROP COLUMN "version_condition_reports_note";
  ALTER TABLE "trail_areas" DROP COLUMN "condition_reports_closed";
  ALTER TABLE "trail_areas" DROP COLUMN "condition_reports_note";`)
}
