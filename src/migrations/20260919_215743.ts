import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_routes_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_routes_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__routes_v_version_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum__routes_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "routes" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "city" "enum_routes_city",
    "route_id" varchar,
    "geom" jsonb,
    "source_path" varchar,
    "source_sha256" varchar,
    "source_feature_count" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_routes_status" DEFAULT 'draft'
  );

  CREATE TABLE "_routes_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_name" varchar,
    "version_city" "enum__routes_v_version_city",
    "version_route_id" varchar,
    "version_geom" jsonb,
    "version_source_path" varchar,
    "version_source_sha256" varchar,
    "version_source_feature_count" numeric,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__routes_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "routes_id" integer;
  ALTER TABLE "_routes_v" ADD CONSTRAINT "_routes_v_parent_id_routes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."routes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "routes_route_id_idx" ON "routes" USING btree ("route_id");
  CREATE INDEX "routes_updated_at_idx" ON "routes" USING btree ("updated_at");
  CREATE INDEX "routes_created_at_idx" ON "routes" USING btree ("created_at");
  CREATE INDEX "routes__status_idx" ON "routes" USING btree ("_status");
  CREATE UNIQUE INDEX "city_routeId_idx" ON "routes" USING btree ("city","route_id");
  CREATE INDEX "_routes_v_parent_idx" ON "_routes_v" USING btree ("parent_id");
  CREATE INDEX "_routes_v_version_version_route_id_idx" ON "_routes_v" USING btree ("version_route_id");
  CREATE INDEX "_routes_v_version_version_updated_at_idx" ON "_routes_v" USING btree ("version_updated_at");
  CREATE INDEX "_routes_v_version_version_created_at_idx" ON "_routes_v" USING btree ("version_created_at");
  CREATE INDEX "_routes_v_version_version__status_idx" ON "_routes_v" USING btree ("version__status");
  CREATE INDEX "_routes_v_created_at_idx" ON "_routes_v" USING btree ("created_at");
  CREATE INDEX "_routes_v_updated_at_idx" ON "_routes_v" USING btree ("updated_at");
  CREATE INDEX "_routes_v_latest_idx" ON "_routes_v" USING btree ("latest");
  CREATE INDEX "version_city_version_routeId_idx" ON "_routes_v" USING btree ("version_city","version_route_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_routes_fk" FOREIGN KEY ("routes_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_routes_id_idx" ON "payload_locked_documents_rels" USING btree ("routes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_routes_fk";
  DROP INDEX "payload_locked_documents_rels_routes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "routes_id";
  ALTER TABLE "routes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_routes_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "routes" CASCADE;
  DROP TABLE "_routes_v" CASCADE;
  DROP TYPE "public"."enum_routes_city";
  DROP TYPE "public"."enum_routes_status";
  DROP TYPE "public"."enum__routes_v_version_city";
  DROP TYPE "public"."enum__routes_v_version_status";`)
}
