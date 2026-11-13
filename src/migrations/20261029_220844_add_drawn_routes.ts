import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_routes_geometry_source" ADD VALUE 'drawn' BEFORE 'composed';
  ALTER TYPE "public"."enum__routes_v_version_geometry_source" ADD VALUE 'drawn' BEFORE 'composed';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DATA TYPE text;
  UPDATE "routes" SET "geometry_source" = 'imported' WHERE "geometry_source" = 'drawn';
  DROP TYPE "public"."enum_routes_geometry_source";
  CREATE TYPE "public"."enum_routes_geometry_source" AS ENUM('composed', 'imported', 'trail', 'studio');
  ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DATA TYPE "public"."enum_routes_geometry_source" USING "geometry_source"::"public"."enum_routes_geometry_source";
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DATA TYPE text;
  UPDATE "_routes_v" SET "version_geometry_source" = 'imported' WHERE "version_geometry_source" = 'drawn';
  DROP TYPE "public"."enum__routes_v_version_geometry_source";
  CREATE TYPE "public"."enum__routes_v_version_geometry_source" AS ENUM('composed', 'imported', 'trail', 'studio');
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DATA TYPE "public"."enum__routes_v_version_geometry_source" USING "version_geometry_source"::"public"."enum__routes_v_version_geometry_source";`)
}
