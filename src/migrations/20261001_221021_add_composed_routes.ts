import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_routes_geometry_source" ADD VALUE 'composed' BEFORE 'imported';
  ALTER TYPE "public"."enum__routes_v_version_geometry_source" ADD VALUE 'composed' BEFORE 'imported';
  ALTER TABLE "routes" ALTER COLUMN "geometry_source" DROP DEFAULT;
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" DROP DEFAULT;
  ALTER TABLE "routes" ADD COLUMN "plan" jsonb;
  ALTER TABLE "_routes_v" ADD COLUMN "version_plan" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DATA TYPE text;
  ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DEFAULT 'imported'::text;
  DROP TYPE "public"."enum_routes_geometry_source";
  CREATE TYPE "public"."enum_routes_geometry_source" AS ENUM('imported', 'trail', 'studio');
  ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DEFAULT 'imported'::"public"."enum_routes_geometry_source";
  ALTER TABLE "routes" ALTER COLUMN "geometry_source" SET DATA TYPE "public"."enum_routes_geometry_source" USING "geometry_source"::"public"."enum_routes_geometry_source";
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DATA TYPE text;
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DEFAULT 'imported'::text;
  DROP TYPE "public"."enum__routes_v_version_geometry_source";
  CREATE TYPE "public"."enum__routes_v_version_geometry_source" AS ENUM('imported', 'trail', 'studio');
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DEFAULT 'imported'::"public"."enum__routes_v_version_geometry_source";
  ALTER TABLE "_routes_v" ALTER COLUMN "version_geometry_source" SET DATA TYPE "public"."enum__routes_v_version_geometry_source" USING "version_geometry_source"::"public"."enum__routes_v_version_geometry_source";
  ALTER TABLE "routes" DROP COLUMN "plan";
  ALTER TABLE "_routes_v" DROP COLUMN "version_plan";`)
}
