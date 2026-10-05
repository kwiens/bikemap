import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "surface_color" varchar;
    ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "ink_color" varchar;
    ALTER TABLE "theme" ADD COLUMN IF NOT EXISTS "supporting_accent_color" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "theme" DROP COLUMN IF EXISTS "surface_color";
    ALTER TABLE "theme" DROP COLUMN IF EXISTS "ink_color";
    ALTER TABLE "theme" DROP COLUMN IF EXISTS "supporting_accent_color";
  `);
}
