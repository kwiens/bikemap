import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT '';
    ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "media" DROP COLUMN "prefix";
    ALTER TABLE "media" DROP COLUMN "_objectkey";
  `);
}
