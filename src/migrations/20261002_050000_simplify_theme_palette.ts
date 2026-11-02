import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "theme" RENAME COLUMN "accent_color" TO "primary_color";
    ALTER TABLE "theme" RENAME COLUMN "deep_color" TO "sidebar_color";
    ALTER TABLE "theme" RENAME COLUMN "ink_color" TO "text_color";
    ALTER TABLE "theme" RENAME COLUMN "supporting_accent_color" TO "accent_color";
    ALTER TABLE "theme" DROP COLUMN "neutral_tint";
    ALTER TABLE "theme" DROP COLUMN "corner_style";
    ALTER TABLE "theme" DROP COLUMN "font_family";
    ALTER TABLE "theme" DROP COLUMN "custom_css";
    DROP TYPE "public"."enum_theme_neutral_tint";
    DROP TYPE "public"."enum_theme_corner_style";
    DROP TYPE "public"."enum_theme_font_family";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_theme_neutral_tint" AS ENUM('cool', 'neutral', 'warm');
    CREATE TYPE "public"."enum_theme_corner_style" AS ENUM('sharp', 'soft', 'round');
    CREATE TYPE "public"."enum_theme_font_family" AS ENUM('geist', 'system', 'serif');
    ALTER TABLE "theme" ADD COLUMN "neutral_tint" "enum_theme_neutral_tint";
    ALTER TABLE "theme" ADD COLUMN "corner_style" "enum_theme_corner_style";
    ALTER TABLE "theme" ADD COLUMN "font_family" "enum_theme_font_family";
    ALTER TABLE "theme" ADD COLUMN "custom_css" varchar;
    ALTER TABLE "theme" RENAME COLUMN "accent_color" TO "supporting_accent_color";
    ALTER TABLE "theme" RENAME COLUMN "text_color" TO "ink_color";
    ALTER TABLE "theme" RENAME COLUMN "sidebar_color" TO "deep_color";
    ALTER TABLE "theme" RENAME COLUMN "primary_color" TO "accent_color";
  `);
}
