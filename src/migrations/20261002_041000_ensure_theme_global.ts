import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

/**
 * Compatibility migration for databases created before Theme was folded into
 * the squashed initial schema. Those databases already record the initial
 * migration by name, so editing that migration cannot add the global for them.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_theme_neutral_tint" AS ENUM('cool', 'neutral', 'warm');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_theme_corner_style" AS ENUM('sharp', 'soft', 'round');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_theme_font_family" AS ENUM('geist', 'system', 'serif');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "theme" (
      "id" serial PRIMARY KEY NOT NULL,
      "accent_color" varchar,
      "deep_color" varchar,
      "neutral_tint" "enum_theme_neutral_tint",
      "corner_style" "enum_theme_corner_style",
      "font_family" "enum_theme_font_family",
      "custom_css" varchar,
      "updated_at" timestamp(3) with time zone,
      "created_at" timestamp(3) with time zone
    );
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Deliberately a no-op. On new databases the squashed initial migration owns
  // this table; dropping it here would break a rollback there. On legacy
  // databases retaining an unused settings table is safer than losing values.
}
