import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Trail conditions: `trail_condition_types` (the dropdown) and
 * `trail_conditions` (the reports).
 *
 * The SQL is exactly as Payload generated it, so a later `migrate:create` sees
 * no drift. Two things to know:
 *
 * - `trail_id` is NOT NULL with an ON DELETE SET NULL foreign key, so Postgres
 *   refuses to delete a trail that has reports. `Trails` has a `beforeDelete`
 *   hook that clears them first; a not-null violation here means it broke.
 * - The seed is a separate `db.execute`, like the rating/kind seed in the
 *   initial migration: `condition_id` is required, so no rows means no form.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trail_conditions_source" AS ENUM('public', 'admin');
  CREATE TYPE "public"."enum_trail_conditions_city" AS ENUM('chattanooga', 'bend');
  CREATE TABLE "trail_conditions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"trail_id" integer NOT NULL,
  	"condition_id" integer NOT NULL,
  	"observed_at" timestamp(3) with time zone NOT NULL,
  	"source" "enum_trail_conditions_source" DEFAULT 'public' NOT NULL,
  	"hidden" boolean DEFAULT false,
  	"city" "enum_trail_conditions_city" DEFAULT 'bend' NOT NULL,
  	"reporter_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trail_condition_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"color" varchar DEFAULT '#6b7280' NOT NULL,
  	"sort_order" numeric DEFAULT 50 NOT NULL,
  	"active" boolean DEFAULT true,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trail_conditions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trail_condition_types_id" integer;
  ALTER TABLE "trail_conditions" ADD CONSTRAINT "trail_conditions_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trail_conditions" ADD CONSTRAINT "trail_conditions_condition_id_trail_condition_types_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."trail_condition_types"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trail_conditions_trail_idx" ON "trail_conditions" USING btree ("trail_id");
  CREATE INDEX "trail_conditions_condition_idx" ON "trail_conditions" USING btree ("condition_id");
  CREATE INDEX "trail_conditions_observed_at_idx" ON "trail_conditions" USING btree ("observed_at");
  CREATE INDEX "trail_conditions_hidden_idx" ON "trail_conditions" USING btree ("hidden");
  CREATE INDEX "trail_conditions_reporter_hash_idx" ON "trail_conditions" USING btree ("reporter_hash");
  CREATE INDEX "trail_conditions_updated_at_idx" ON "trail_conditions" USING btree ("updated_at");
  CREATE INDEX "trail_conditions_created_at_idx" ON "trail_conditions" USING btree ("created_at");
  CREATE UNIQUE INDEX "trail_condition_types_name_idx" ON "trail_condition_types" USING btree ("name");
  CREATE UNIQUE INDEX "trail_condition_types_value_idx" ON "trail_condition_types" USING btree ("value");
  CREATE INDEX "trail_condition_types_updated_at_idx" ON "trail_condition_types" USING btree ("updated_at");
  CREATE INDEX "trail_condition_types_created_at_idx" ON "trail_condition_types" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_conditions_fk" FOREIGN KEY ("trail_conditions_id") REFERENCES "public"."trail_conditions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_condition_types_fk" FOREIGN KEY ("trail_condition_types_id") REFERENCES "public"."trail_condition_types"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trail_conditions_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_conditions_id");
  CREATE INDEX "payload_locked_documents_rels_trail_condition_types_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_condition_types_id");`)

  // Mirrors `src/data/condition-vocabulary.ts`; keep them in step. ON CONFLICT
  // so a rerun is harmless and a curator's recolouring survives.
  await db.execute(sql`
  INSERT INTO "trail_condition_types" ("name", "value", "color", "sort_order", "active", "description") VALUES
    ('Prime / tacky',    'tacky',  '#059669', 10, true, 'Damp, grippy dirt. As good as it gets.'),
    ('Dry',              'dry',    '#16a34a', 20, true, 'Dry and fast, no surprises.'),
    ('Dusty / loose',    'dusty',  '#ca8a04', 30, true, 'Dry to the point of loose corners and blown-out braking bumps.'),
    ('Wet',              'wet',    '#2563eb', 40, true, 'Wet but holding up — rideable without damaging the tread.'),
    ('Muddy — stay off', 'muddy',  '#b45309', 50, true, 'Soft enough to rut. Please stay off until it dries.'),
    ('Snow / ice',       'snow',   '#0ea5e9', 60, true, 'Snow-covered or frozen. Fine when frozen hard, ruinous when soft.'),
    ('Closed',           'closed', '#dc2626', 70, true, 'Closed by the land manager, or blocked. Do not ride.')
  ON CONFLICT ("value") DO NOTHING;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trail_conditions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trail_condition_types" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trail_conditions" CASCADE;
  DROP TABLE "trail_condition_types" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trail_conditions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trail_condition_types_fk";
  
  DROP INDEX "payload_locked_documents_rels_trail_conditions_id_idx";
  DROP INDEX "payload_locked_documents_rels_trail_condition_types_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trail_conditions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trail_condition_types_id";
  DROP TYPE "public"."enum_trail_conditions_source";
  DROP TYPE "public"."enum_trail_conditions_city";`)
}
