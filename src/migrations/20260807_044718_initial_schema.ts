import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The whole schema, in one migration.
 *
 * This replaces eight incremental migrations. None of them had ever run outside
 * a developer's machine — the Payload backend has not shipped — so the
 * intermediate states had no value to preserve, and several of their `down`
 * paths were lossy in ways that would have been unpleasant to rely on (the role
 * enum could not carry a custom role back down; the rating/kind enums could not
 * carry a curator's additions). One migration that builds the current schema is
 * both smaller and more honest about what it can do.
 *
 * If you are adding to this: don't. Add a new migration on top. This one is
 * only allowed to be rewritten while the backend is still unreleased.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trails_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_trails_geometry_source" AS ENUM('osm', 'edited', 'imported');
  CREATE TYPE "public"."enum_trails_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__trails_v_version_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum__trails_v_version_geometry_source" AS ENUM('osm', 'edited', 'imported');
  CREATE TYPE "public"."enum__trails_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_trail_areas_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_trail_kinds_icon" AS ENUM('mountain', 'route');
  CREATE TYPE "public"."enum_organizations_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin');
  CREATE TYPE "public"."enum_users_city" AS ENUM('chattanooga', 'bend');
  CREATE TYPE "public"."enum_theme_neutral_tint" AS ENUM('cool', 'neutral', 'warm');
  CREATE TYPE "public"."enum_theme_corner_style" AS ENUM('sharp', 'soft', 'round');
  CREATE TYPE "public"."enum_theme_font_family" AS ENUM('geist', 'system', 'serif');
  CREATE TABLE "trails" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trail_name" varchar,
  	"city" "enum_trails_city" DEFAULT 'bend',
  	"area_id" integer,
  	"organization_id" integer,
  	"rating_id" integer,
  	"kind_id" integer,
  	"display_name" varchar,
  	"slug" varchar,
  	"geom" jsonb,
  	"osm_ids" jsonb,
  	"rebuild_geometry" boolean DEFAULT false,
  	"osm_report" jsonb,
  	"distance" numeric,
  	"elevation_gain" numeric,
  	"elevation_loss" numeric,
  	"elevation_min" numeric,
  	"elevation_max" numeric,
  	"bounds" jsonb,
  	"elevation_profile" jsonb,
  	"geometry_source" "enum_trails_geometry_source" DEFAULT 'osm',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_trails_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_trails_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_trail_name" varchar,
  	"version_city" "enum__trails_v_version_city" DEFAULT 'bend',
  	"version_area_id" integer,
  	"version_organization_id" integer,
  	"version_rating_id" integer,
  	"version_kind_id" integer,
  	"version_display_name" varchar,
  	"version_slug" varchar,
  	"version_geom" jsonb,
  	"version_osm_ids" jsonb,
  	"version_rebuild_geometry" boolean DEFAULT false,
  	"version_osm_report" jsonb,
  	"version_distance" numeric,
  	"version_elevation_gain" numeric,
  	"version_elevation_loss" numeric,
  	"version_elevation_min" numeric,
  	"version_elevation_max" numeric,
  	"version_bounds" jsonb,
  	"version_elevation_profile" jsonb,
  	"version_geometry_source" "enum__trails_v_version_geometry_source" DEFAULT 'osm',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__trails_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "trail_areas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"city" "enum_trail_areas_city" DEFAULT 'bend' NOT NULL,
  	"region" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trail_ratings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"color" varchar DEFAULT '#6b7280' NOT NULL,
  	"sort_order" numeric DEFAULT 50 NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trail_kinds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"icon" "enum_trail_kinds_icon" DEFAULT 'mountain' NOT NULL,
  	"color" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "organizations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"abbreviation" varchar,
  	"city" "enum_organizations_city",
  	"url" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'admin' NOT NULL,
  	"city" "enum_users_city",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trails_id" integer,
  	"trail_areas_id" integer,
  	"trail_ratings_id" integer,
  	"trail_kinds_id" integer,
  	"organizations_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "theme" (
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
  
  ALTER TABLE "trails" ADD CONSTRAINT "trails_area_id_trail_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."trail_areas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trails" ADD CONSTRAINT "trails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trails" ADD CONSTRAINT "trails_rating_id_trail_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."trail_ratings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trails" ADD CONSTRAINT "trails_kind_id_trail_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."trail_kinds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_trails_v" ADD CONSTRAINT "_trails_v_parent_id_trails_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_trails_v" ADD CONSTRAINT "_trails_v_version_area_id_trail_areas_id_fk" FOREIGN KEY ("version_area_id") REFERENCES "public"."trail_areas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_trails_v" ADD CONSTRAINT "_trails_v_version_organization_id_organizations_id_fk" FOREIGN KEY ("version_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_trails_v" ADD CONSTRAINT "_trails_v_version_rating_id_trail_ratings_id_fk" FOREIGN KEY ("version_rating_id") REFERENCES "public"."trail_ratings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_trails_v" ADD CONSTRAINT "_trails_v_version_kind_id_trail_kinds_id_fk" FOREIGN KEY ("version_kind_id") REFERENCES "public"."trail_kinds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trails_fk" FOREIGN KEY ("trails_id") REFERENCES "public"."trails"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_areas_fk" FOREIGN KEY ("trail_areas_id") REFERENCES "public"."trail_areas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_ratings_fk" FOREIGN KEY ("trail_ratings_id") REFERENCES "public"."trail_ratings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_kinds_fk" FOREIGN KEY ("trail_kinds_id") REFERENCES "public"."trail_kinds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trails_trail_name_idx" ON "trails" USING btree ("trail_name");
  CREATE INDEX "trails_area_idx" ON "trails" USING btree ("area_id");
  CREATE INDEX "trails_organization_idx" ON "trails" USING btree ("organization_id");
  CREATE INDEX "trails_rating_idx" ON "trails" USING btree ("rating_id");
  CREATE INDEX "trails_kind_idx" ON "trails" USING btree ("kind_id");
  CREATE INDEX "trails_slug_idx" ON "trails" USING btree ("slug");
  CREATE INDEX "trails_updated_at_idx" ON "trails" USING btree ("updated_at");
  CREATE INDEX "trails_created_at_idx" ON "trails" USING btree ("created_at");
  CREATE INDEX "trails__status_idx" ON "trails" USING btree ("_status");
  CREATE INDEX "_trails_v_parent_idx" ON "_trails_v" USING btree ("parent_id");
  CREATE INDEX "_trails_v_version_version_trail_name_idx" ON "_trails_v" USING btree ("version_trail_name");
  CREATE INDEX "_trails_v_version_version_area_idx" ON "_trails_v" USING btree ("version_area_id");
  CREATE INDEX "_trails_v_version_version_organization_idx" ON "_trails_v" USING btree ("version_organization_id");
  CREATE INDEX "_trails_v_version_version_rating_idx" ON "_trails_v" USING btree ("version_rating_id");
  CREATE INDEX "_trails_v_version_version_kind_idx" ON "_trails_v" USING btree ("version_kind_id");
  CREATE INDEX "_trails_v_version_version_slug_idx" ON "_trails_v" USING btree ("version_slug");
  CREATE INDEX "_trails_v_version_version_updated_at_idx" ON "_trails_v" USING btree ("version_updated_at");
  CREATE INDEX "_trails_v_version_version_created_at_idx" ON "_trails_v" USING btree ("version_created_at");
  CREATE INDEX "_trails_v_version_version__status_idx" ON "_trails_v" USING btree ("version__status");
  CREATE INDEX "_trails_v_created_at_idx" ON "_trails_v" USING btree ("created_at");
  CREATE INDEX "_trails_v_updated_at_idx" ON "_trails_v" USING btree ("updated_at");
  CREATE INDEX "_trails_v_latest_idx" ON "_trails_v" USING btree ("latest");
  CREATE INDEX "trail_areas_name_idx" ON "trail_areas" USING btree ("name");
  CREATE INDEX "trail_areas_region_idx" ON "trail_areas" USING btree ("region");
  CREATE INDEX "trail_areas_updated_at_idx" ON "trail_areas" USING btree ("updated_at");
  CREATE INDEX "trail_areas_created_at_idx" ON "trail_areas" USING btree ("created_at");
  CREATE UNIQUE INDEX "trail_ratings_name_idx" ON "trail_ratings" USING btree ("name");
  CREATE UNIQUE INDEX "trail_ratings_value_idx" ON "trail_ratings" USING btree ("value");
  CREATE INDEX "trail_ratings_updated_at_idx" ON "trail_ratings" USING btree ("updated_at");
  CREATE INDEX "trail_ratings_created_at_idx" ON "trail_ratings" USING btree ("created_at");
  CREATE UNIQUE INDEX "trail_kinds_name_idx" ON "trail_kinds" USING btree ("name");
  CREATE UNIQUE INDEX "trail_kinds_value_idx" ON "trail_kinds" USING btree ("value");
  CREATE INDEX "trail_kinds_updated_at_idx" ON "trail_kinds" USING btree ("updated_at");
  CREATE INDEX "trail_kinds_created_at_idx" ON "trail_kinds" USING btree ("created_at");
  CREATE UNIQUE INDEX "organizations_name_idx" ON "organizations" USING btree ("name");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_trails_id_idx" ON "payload_locked_documents_rels" USING btree ("trails_id");
  CREATE INDEX "payload_locked_documents_rels_trail_areas_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_areas_id");
  CREATE INDEX "payload_locked_documents_rels_trail_ratings_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_ratings_id");
  CREATE INDEX "payload_locked_documents_rels_trail_kinds_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_kinds_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)

  // Seed the vocabularies. `rating` and `kind` are **required** relationships,
  // so without these rows the admin cannot create a trail at all — an empty
  // vocabulary is not an empty list, it is a broken form.
  //
  // Values, colours and order mirror `src/data/trail-vocabulary.ts`; keep them
  // in step. ON CONFLICT so re-running against a database that already has them
  // is harmless.
  await db.execute(sql`
  INSERT INTO "trail_ratings" ("name", "value", "color", "sort_order") VALUES
    ('Easy',         'easy',         '#16A34A', 1),
    ('Intermediate', 'intermediate', '#2563EB', 2),
    ('Advanced',     'advanced',     '#374151', 3),
    ('Expert',       'expert',       '#000000', 4),
    ('Unrated',      'unrated',      '#6B7280', 99)
  ON CONFLICT ("value") DO NOTHING;

  INSERT INTO "trail_kinds" ("name", "value", "icon", "color") VALUES
    ('Singletrack trail', 'trail',    'mountain', NULL),
    ('Greenway',          'greenway', 'route',    '#059669')
  ON CONFLICT ("value") DO NOTHING;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "trails" CASCADE;
  DROP TABLE "_trails_v" CASCADE;
  DROP TABLE "trail_areas" CASCADE;
  DROP TABLE "trail_ratings" CASCADE;
  DROP TABLE "trail_kinds" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "theme" CASCADE;
  DROP TYPE "public"."enum_trails_city";
  DROP TYPE "public"."enum_trails_geometry_source";
  DROP TYPE "public"."enum_trails_status";
  DROP TYPE "public"."enum__trails_v_version_city";
  DROP TYPE "public"."enum__trails_v_version_geometry_source";
  DROP TYPE "public"."enum__trails_v_version_status";
  DROP TYPE "public"."enum_trail_areas_city";
  DROP TYPE "public"."enum_trail_kinds_icon";
  DROP TYPE "public"."enum_organizations_city";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_city";
  DROP TYPE "public"."enum_theme_neutral_tint";
  DROP TYPE "public"."enum_theme_corner_style";
  DROP TYPE "public"."enum_theme_font_family";`)
}
