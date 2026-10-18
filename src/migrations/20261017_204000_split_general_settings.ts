import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

/** Give feature switches their own global while leaving Theme appearance-only. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "general_settings" (
      "id" serial PRIMARY KEY NOT NULL,
      "condition_reporting" boolean DEFAULT true,
      "condition_reporting_disabled_message" varchar,
      "ride_recording" boolean DEFAULT true,
      "nationwide_trails" boolean DEFAULT true,
      "bike_network" boolean DEFAULT true,
      "attractions" boolean DEFAULT true,
      "bike_resources" boolean DEFAULT true,
      "bike_rentals" boolean DEFAULT true,
      "embeds" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );

    ALTER TABLE "general_settings"
      ADD COLUMN IF NOT EXISTS "condition_reporting" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "condition_reporting_disabled_message" varchar,
      ADD COLUMN IF NOT EXISTS "ride_recording" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "nationwide_trails" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "bike_network" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "attractions" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "bike_resources" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "bike_rentals" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "embeds" boolean DEFAULT true;

    INSERT INTO "general_settings" (
      "condition_reporting",
      "condition_reporting_disabled_message",
      "updated_at",
      "created_at"
    )
    SELECT
      COALESCE("condition_reporting_enabled", true),
      "condition_reporting_disabled_message",
      NOW(),
      NOW()
    FROM "theme"
    WHERE NOT EXISTS (SELECT 1 FROM "general_settings")
    ORDER BY "id"
    LIMIT 1;

    UPDATE "general_settings"
    SET
      "condition_reporting" = COALESCE(
        (SELECT "condition_reporting_enabled" FROM "theme" ORDER BY "id" LIMIT 1),
        "condition_reporting",
        true
      ),
      "condition_reporting_disabled_message" = COALESCE(
        (SELECT "condition_reporting_disabled_message" FROM "theme" ORDER BY "id" LIMIT 1),
        "condition_reporting_disabled_message"
      );

    ALTER TABLE "theme"
      DROP COLUMN IF EXISTS "condition_reporting_enabled",
      DROP COLUMN IF EXISTS "condition_reporting_disabled_message";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "theme"
      ADD COLUMN IF NOT EXISTS "condition_reporting_enabled" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "condition_reporting_disabled_message" varchar;

    UPDATE "theme"
    SET
      "condition_reporting_enabled" = COALESCE(
        (SELECT "condition_reporting" FROM "general_settings" ORDER BY "id" LIMIT 1),
        true
      ),
      "condition_reporting_disabled_message" = (
        SELECT "condition_reporting_disabled_message" FROM "general_settings" ORDER BY "id" LIMIT 1
      );

    DROP TABLE IF EXISTS "general_settings" CASCADE;
  `);
}
