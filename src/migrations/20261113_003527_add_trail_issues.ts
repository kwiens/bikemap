import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trail_issues_status" AS ENUM('open', 'resolved', 'dismissed');
  CREATE TYPE "public"."enum_trail_issues_category" AS ENUM('down-tree', 'washed-out', 'broken-feature', 'missing-sign', 'other');
  CREATE TYPE "public"."enum_trail_issues_city" AS ENUM('chattanooga', 'bend');
  CREATE TABLE "trail_issues" (
    "id" serial PRIMARY KEY NOT NULL,
    "status" "enum_trail_issues_status" DEFAULT 'open' NOT NULL,
    "category" "enum_trail_issues_category" NOT NULL,
    "trail_id" integer,
    "trail_name" varchar NOT NULL,
    "city" "enum_trail_issues_city" NOT NULL,
    "comment" varchar,
    "has_photo" boolean DEFAULT false,
    "reporter_hash" varchar NOT NULL,
    "submission_id" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  -- Keep photo bytes out of ordinary Payload reads and write them in the same
  -- transaction as the report. Deleting the report also removes the photo.
  CREATE TABLE "trail_issue_photos" (
    "issue_id" integer PRIMARY KEY REFERENCES "trail_issues" ("id") ON DELETE CASCADE,
    "image" bytea NOT NULL CHECK (octet_length("image") <= 3000000)
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trail_issues_id" integer;
  ALTER TABLE "trail_issues" ADD CONSTRAINT "trail_issues_trail_id_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."trails"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trail_issues_status_idx" ON "trail_issues" USING btree ("status");
  CREATE INDEX "trail_issues_category_idx" ON "trail_issues" USING btree ("category");
  CREATE INDEX "trail_issues_trail_idx" ON "trail_issues" USING btree ("trail_id");
  CREATE INDEX "trail_issues_city_idx" ON "trail_issues" USING btree ("city");
  CREATE INDEX "trail_issues_reporter_hash_idx" ON "trail_issues" USING btree ("reporter_hash");
  CREATE UNIQUE INDEX "trail_issues_submission_id_idx" ON "trail_issues" USING btree ("submission_id");
  CREATE INDEX "trail_issues_updated_at_idx" ON "trail_issues" USING btree ("updated_at");
  CREATE INDEX "trail_issues_created_at_idx" ON "trail_issues" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trail_issues_fk" FOREIGN KEY ("trail_issues_id") REFERENCES "public"."trail_issues"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_trail_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("trail_issues_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE "trail_issue_photos";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trail_issues_fk";

  DROP INDEX "payload_locked_documents_rels_trail_issues_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trail_issues_id";
  DROP TABLE "trail_issues";
  DROP TYPE "public"."enum_trail_issues_status";
  DROP TYPE "public"."enum_trail_issues_category";
  DROP TYPE "public"."enum_trail_issues_city";`)
}
