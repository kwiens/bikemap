import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Existing routes and saved versions were listed before this field existed.
  // Only new records take the unfeatured default.
  await db.execute(sql`
    ALTER TABLE "routes" ADD COLUMN "featured" boolean DEFAULT true;
    ALTER TABLE "_routes_v" ADD COLUMN "version_featured" boolean DEFAULT true;
    ALTER TABLE "routes" ALTER COLUMN "featured" SET DEFAULT false;
    ALTER TABLE "_routes_v" ALTER COLUMN "version_featured" SET DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_routes_v" DROP COLUMN "version_featured";
    ALTER TABLE "routes" DROP COLUMN "featured";
  `);
}
