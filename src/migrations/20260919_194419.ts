import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trails" ALTER COLUMN "city" DROP DEFAULT;
  ALTER TABLE "_trails_v" ALTER COLUMN "version_city" DROP DEFAULT;
  ALTER TABLE "trail_areas" ALTER COLUMN "city" DROP DEFAULT;
  ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  CREATE UNIQUE INDEX "city_trailName_idx" ON "trails" USING btree ("city","trail_name");
  CREATE UNIQUE INDEX "city_slug_idx" ON "trails" USING btree ("city","slug");
  CREATE INDEX "version_city_version_trailName_idx" ON "_trails_v" USING btree ("version_city","version_trail_name");
  CREATE INDEX "version_city_version_slug_idx" ON "_trails_v" USING btree ("version_city","version_slug");
  CREATE UNIQUE INDEX "city_name_idx" ON "trail_areas" USING btree ("city","name");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "city_trailName_idx";
  DROP INDEX "city_slug_idx";
  DROP INDEX "version_city_version_trailName_idx";
  DROP INDEX "version_city_version_slug_idx";
  DROP INDEX "city_name_idx";
  ALTER TABLE "trails" ALTER COLUMN "city" SET DEFAULT 'bend';
  ALTER TABLE "_trails_v" ALTER COLUMN "version_city" SET DEFAULT 'bend';
  ALTER TABLE "trail_areas" ALTER COLUMN "city" SET DEFAULT 'bend';
  ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";`)
}
