import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trail_conditions" ALTER COLUMN "city" DROP DEFAULT;
  CREATE INDEX "trail_conditions_city_idx" ON "trail_conditions" USING btree ("city");`)

  // Earlier admin writes could inherit the deployment city instead of the
  // selected trail's city. Repair those reports before using the shared admin.
  await db.execute(sql`
    UPDATE "trail_conditions" AS report
    SET "city" = trail."city"::text::"enum_trail_conditions_city"
    FROM "trails" AS trail
    WHERE report."trail_id" = trail."id"
      AND report."city"::text IS DISTINCT FROM trail."city"::text;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "trail_conditions_city_idx";
  ALTER TABLE "trail_conditions" ALTER COLUMN "city" SET DEFAULT 'bend';`)
}
