import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_attractions_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_attractions_icon" AS ENUM('pin', 'aquarium', 'art', 'bicycle', 'carousel', 'community', 'film', 'games', 'hiking', 'mountain', 'nature', 'park', 'railroad', 'shopping', 'volcano', 'water', 'zoo');
  CREATE TYPE "public"."enum_attractions_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__attractions_v_version_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum__attractions_v_version_icon" AS ENUM('pin', 'aquarium', 'art', 'bicycle', 'carousel', 'community', 'film', 'games', 'hiking', 'mountain', 'nature', 'park', 'railroad', 'shopping', 'volcano', 'water', 'zoo');
  CREATE TYPE "public"."enum__attractions_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "attractions" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "city" "enum_attractions_city",
    "description" varchar,
    "address" varchar,
    "latitude" numeric,
    "longitude" numeric,
    "icon" "enum_attractions_icon" DEFAULT 'pin',
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_attractions_status" DEFAULT 'draft'
  );

  CREATE TABLE "_attractions_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_name" varchar,
    "version_city" "enum__attractions_v_version_city",
    "version_description" varchar,
    "version_address" varchar,
    "version_latitude" numeric,
    "version_longitude" numeric,
    "version_icon" "enum__attractions_v_version_icon" DEFAULT 'pin',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__attractions_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "attractions_id" integer;
  ALTER TABLE "_attractions_v" ADD CONSTRAINT "_attractions_v_parent_id_attractions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."attractions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "attractions_city_idx" ON "attractions" USING btree ("city");
  CREATE INDEX "attractions_updated_at_idx" ON "attractions" USING btree ("updated_at");
  CREATE INDEX "attractions_created_at_idx" ON "attractions" USING btree ("created_at");
  CREATE INDEX "attractions__status_idx" ON "attractions" USING btree ("_status");
  CREATE INDEX "_attractions_v_parent_idx" ON "_attractions_v" USING btree ("parent_id");
  CREATE INDEX "_attractions_v_version_version_city_idx" ON "_attractions_v" USING btree ("version_city");
  CREATE INDEX "_attractions_v_version_version_updated_at_idx" ON "_attractions_v" USING btree ("version_updated_at");
  CREATE INDEX "_attractions_v_version_version_created_at_idx" ON "_attractions_v" USING btree ("version_created_at");
  CREATE INDEX "_attractions_v_version_version__status_idx" ON "_attractions_v" USING btree ("version__status");
  CREATE INDEX "_attractions_v_created_at_idx" ON "_attractions_v" USING btree ("created_at");
  CREATE INDEX "_attractions_v_updated_at_idx" ON "_attractions_v" USING btree ("updated_at");
  CREATE INDEX "_attractions_v_latest_idx" ON "_attractions_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_attractions_fk" FOREIGN KEY ("attractions_id") REFERENCES "public"."attractions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_attractions_id_idx" ON "payload_locked_documents_rels" USING btree ("attractions_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "payload_kv" WHERE "key" = 'bikemap:attractions-seed';
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "attractions_id";
    DROP TABLE "_attractions_v";
    DROP TABLE "attractions";
    DROP TYPE "public"."enum_attractions_city";
    DROP TYPE "public"."enum_attractions_icon";
    DROP TYPE "public"."enum_attractions_status";
    DROP TYPE "public"."enum__attractions_v_version_city";
    DROP TYPE "public"."enum__attractions_v_version_icon";
    DROP TYPE "public"."enum__attractions_v_version_status";
  `);
}
