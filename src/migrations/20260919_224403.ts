import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_routes_kind" AS ENUM('ride', 'greenway', 'path', 'trail');
  CREATE TYPE "public"."enum_routes_geometry_source" AS ENUM('imported', 'trail', 'studio');
  CREATE TYPE "public"."enum__routes_v_version_kind" AS ENUM('ride', 'greenway', 'path', 'trail');
  CREATE TYPE "public"."enum__routes_v_version_geometry_source" AS ENUM('imported', 'trail', 'studio');
  ALTER TABLE "routes" ADD COLUMN "kind" "enum_routes_kind" DEFAULT 'ride';
  ALTER TABLE "routes" ADD COLUMN "geometry_source" "enum_routes_geometry_source" DEFAULT 'imported';
  ALTER TABLE "routes" ADD COLUMN "source_trail_id" integer;
  ALTER TABLE "routes" ADD COLUMN "description" varchar;
  ALTER TABLE "routes" ADD COLUMN "color" varchar DEFAULT '#2563EB';
  ALTER TABLE "routes" ADD COLUMN "default_width" numeric DEFAULT 8;
  ALTER TABLE "routes" ADD COLUMN "opacity" numeric DEFAULT 1;
  ALTER TABLE "routes" ADD COLUMN "distance" numeric;
  ALTER TABLE "routes" ADD COLUMN "hide_arrows" boolean DEFAULT false;
  ALTER TABLE "routes" ADD COLUMN "reverse_direction" boolean DEFAULT false;
  ALTER TABLE "routes" ADD COLUMN "bounds" jsonb;
  ALTER TABLE "routes" ADD COLUMN "reverse_arrow_bounds" jsonb;
  ALTER TABLE "_routes_v" ADD COLUMN "version_kind" "enum__routes_v_version_kind" DEFAULT 'ride';
  ALTER TABLE "_routes_v" ADD COLUMN "version_geometry_source" "enum__routes_v_version_geometry_source" DEFAULT 'imported';
  ALTER TABLE "_routes_v" ADD COLUMN "version_source_trail_id" integer;
  ALTER TABLE "_routes_v" ADD COLUMN "version_description" varchar;
  ALTER TABLE "_routes_v" ADD COLUMN "version_color" varchar DEFAULT '#2563EB';
  ALTER TABLE "_routes_v" ADD COLUMN "version_default_width" numeric DEFAULT 8;
  ALTER TABLE "_routes_v" ADD COLUMN "version_opacity" numeric DEFAULT 1;
  ALTER TABLE "_routes_v" ADD COLUMN "version_distance" numeric;
  ALTER TABLE "_routes_v" ADD COLUMN "version_hide_arrows" boolean DEFAULT false;
  ALTER TABLE "_routes_v" ADD COLUMN "version_reverse_direction" boolean DEFAULT false;
  ALTER TABLE "_routes_v" ADD COLUMN "version_bounds" jsonb;
  ALTER TABLE "_routes_v" ADD COLUMN "version_reverse_arrow_bounds" jsonb;
  UPDATE "routes"
  SET
    "description" = 'Explore the riverwalk and visit the aquarium. Low traffic.',
    "distance" = 7.7,
    "reverse_direction" = true,
    "bounds" = '[-85.326925,35.028003,-85.301479,35.061734]'::jsonb,
    "reverse_arrow_bounds" = '[[-85.3076,35.0509,-85.3063,35.0511],[-85.30655,35.04965,-85.30625,35.0511]]'::jsonb
  WHERE "city" = 'chattanooga'
    AND "route_id" = 'riverwalk-loop-v3-public';
  ALTER TABLE "routes" ADD CONSTRAINT "routes_source_trail_id_trails_id_fk" FOREIGN KEY ("source_trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_routes_v" ADD CONSTRAINT "_routes_v_version_source_trail_id_trails_id_fk" FOREIGN KEY ("version_source_trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "routes_source_trail_idx" ON "routes" USING btree ("source_trail_id");
  CREATE INDEX "_routes_v_version_version_source_trail_idx" ON "_routes_v" USING btree ("version_source_trail_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "routes" DROP CONSTRAINT "routes_source_trail_id_trails_id_fk";

  ALTER TABLE "_routes_v" DROP CONSTRAINT "_routes_v_version_source_trail_id_trails_id_fk";

  DROP INDEX "routes_source_trail_idx";
  DROP INDEX "_routes_v_version_version_source_trail_idx";
  ALTER TABLE "routes" DROP COLUMN "kind";
  ALTER TABLE "routes" DROP COLUMN "geometry_source";
  ALTER TABLE "routes" DROP COLUMN "source_trail_id";
  ALTER TABLE "routes" DROP COLUMN "description";
  ALTER TABLE "routes" DROP COLUMN "color";
  ALTER TABLE "routes" DROP COLUMN "default_width";
  ALTER TABLE "routes" DROP COLUMN "opacity";
  ALTER TABLE "routes" DROP COLUMN "distance";
  ALTER TABLE "routes" DROP COLUMN "hide_arrows";
  ALTER TABLE "routes" DROP COLUMN "reverse_direction";
  ALTER TABLE "routes" DROP COLUMN "bounds";
  ALTER TABLE "routes" DROP COLUMN "reverse_arrow_bounds";
  ALTER TABLE "_routes_v" DROP COLUMN "version_kind";
  ALTER TABLE "_routes_v" DROP COLUMN "version_geometry_source";
  ALTER TABLE "_routes_v" DROP COLUMN "version_source_trail_id";
  ALTER TABLE "_routes_v" DROP COLUMN "version_description";
  ALTER TABLE "_routes_v" DROP COLUMN "version_color";
  ALTER TABLE "_routes_v" DROP COLUMN "version_default_width";
  ALTER TABLE "_routes_v" DROP COLUMN "version_opacity";
  ALTER TABLE "_routes_v" DROP COLUMN "version_distance";
  ALTER TABLE "_routes_v" DROP COLUMN "version_hide_arrows";
  ALTER TABLE "_routes_v" DROP COLUMN "version_reverse_direction";
  ALTER TABLE "_routes_v" DROP COLUMN "version_bounds";
  ALTER TABLE "_routes_v" DROP COLUMN "version_reverse_arrow_bounds";
  DROP TYPE "public"."enum_routes_kind";
  DROP TYPE "public"."enum_routes_geometry_source";
  DROP TYPE "public"."enum__routes_v_version_kind";
  DROP TYPE "public"."enum__routes_v_version_geometry_source";`)
}
