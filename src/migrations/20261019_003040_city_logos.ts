import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The old shared upload has no city identity. Keep its Media row available
  // for explicit selection rather than assigning it to the wrong city.
  await db.execute(sql`
   ALTER TABLE "theme" DROP CONSTRAINT "theme_logo_id_media_id_fk";
  
  DROP INDEX "theme_logo_idx";
  ALTER TABLE "theme" ADD COLUMN "logos_chattanooga_id" integer;
  ALTER TABLE "theme" ADD COLUMN "logos_bend_id" integer;
  ALTER TABLE "theme" ADD CONSTRAINT "theme_logos_chattanooga_id_media_id_fk" FOREIGN KEY ("logos_chattanooga_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "theme" ADD CONSTRAINT "theme_logos_bend_id_media_id_fk" FOREIGN KEY ("logos_bend_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "theme_logos_logos_chattanooga_idx" ON "theme" USING btree ("logos_chattanooga_id");
  CREATE INDEX "theme_logos_logos_bend_idx" ON "theme" USING btree ("logos_bend_id");
  ALTER TABLE "theme" DROP COLUMN "logo_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "theme" DROP CONSTRAINT "theme_logos_chattanooga_id_media_id_fk";
  
  ALTER TABLE "theme" DROP CONSTRAINT "theme_logos_bend_id_media_id_fk";
  
  DROP INDEX "theme_logos_logos_chattanooga_idx";
  DROP INDEX "theme_logos_logos_bend_idx";
  ALTER TABLE "theme" ADD COLUMN "logo_id" integer;
  ALTER TABLE "theme" ADD CONSTRAINT "theme_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "theme_logo_idx" ON "theme" USING btree ("logo_id");
  ALTER TABLE "theme" DROP COLUMN "logos_chattanooga_id";
  ALTER TABLE "theme" DROP COLUMN "logos_bend_id";`)
}
