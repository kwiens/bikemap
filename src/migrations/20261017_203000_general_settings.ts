import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

/** Consolidate the old condition-reporting switch into General settings. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "theme"
      ADD COLUMN IF NOT EXISTS "condition_reporting_enabled" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "condition_reporting_disabled_message" varchar;

    DO $migration$
    BEGIN
      IF to_regclass('public.condition_reporting') IS NOT NULL THEN
        EXECUTE $copy$
          UPDATE "theme"
          SET
            "condition_reporting_enabled" = COALESCE(
              (SELECT "enabled" FROM "condition_reporting" ORDER BY "id" LIMIT 1),
              true
            ),
            "condition_reporting_disabled_message" = (
              SELECT "disabled_message" FROM "condition_reporting" ORDER BY "id" LIMIT 1
            )
        $copy$;
      END IF;
    END
    $migration$;

    DROP TABLE IF EXISTS "condition_reporting" CASCADE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "condition_reporting" (
      "id" serial PRIMARY KEY NOT NULL,
      "enabled" boolean DEFAULT true,
      "disabled_message" varchar,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );

    INSERT INTO "condition_reporting" (
      "enabled",
      "disabled_message",
      "updated_at",
      "created_at"
    )
    SELECT
      COALESCE("condition_reporting_enabled", true),
      "condition_reporting_disabled_message",
      NOW(),
      NOW()
    FROM "theme"
    ORDER BY "id"
    LIMIT 1;

    ALTER TABLE "theme"
      DROP COLUMN IF EXISTS "condition_reporting_enabled",
      DROP COLUMN IF EXISTS "condition_reporting_disabled_message";
  `);
}
