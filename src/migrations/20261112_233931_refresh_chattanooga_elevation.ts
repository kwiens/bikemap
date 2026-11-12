import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres';
import profiles from './data/20261112_233931_chattanooga_elevation.json';

const profileJson = JSON.stringify(profiles);

/** Refresh derived data only where the current geometry matches the measured GIS line. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Payload saves update the live row and its versions together. Keep the
  // eligibility check and both updates in the same migration transaction.
  await db.execute(sql`
    LOCK TABLE "trails", "_trails_v" IN SHARE ROW EXCLUSIVE MODE;
  `);
  await db.execute(sql`
    WITH source AS (
      SELECT *
      FROM jsonb_to_recordset(${profileJson}::jsonb) AS data(
        trail_name text,
        coordinates_sha256 text,
        distance numeric,
        elevation_gain numeric,
        elevation_loss numeric,
        elevation_min numeric,
        elevation_max numeric,
        elevation_profile jsonb
      )
    ), eligible AS (
      SELECT trail."id", source.*
      FROM "trails" AS trail
      INNER JOIN source ON trail."trail_name" = source.trail_name
      WHERE trail."city" = 'chattanooga'
        AND trail."geometry_source" = 'imported'
        AND trail."geom" ->> 'type' = 'MultiLineString'
        -- Strip PostgreSQL's array spacing to match JSON.stringify(coordinates).
        AND encode(sha256(convert_to(
          replace((trail."geom" -> 'coordinates')::text, ' ', ''), 'UTF8'
        )), 'hex') = source.coordinates_sha256
        AND NOT EXISTS (
          SELECT 1 FROM "_trails_v" AS version_row
          WHERE version_row."parent_id" = trail."id"
            AND version_row."latest" = true
            AND (
              version_row."version_geometry_source" IS DISTINCT FROM 'imported'
              OR version_row."version_geom" IS DISTINCT FROM trail."geom"
            )
        )
    ), updated_trails AS (
      UPDATE "trails" AS trail
      SET
        "distance" = eligible.distance,
        "elevation_gain" = eligible.elevation_gain,
        "elevation_loss" = eligible.elevation_loss,
        "elevation_min" = eligible.elevation_min,
        "elevation_max" = eligible.elevation_max,
        "elevation_profile" = eligible.elevation_profile || jsonb_build_object(
          'trail', coalesce(trail."display_name", eligible.elevation_profile ->> 'trail')
        ),
        "updated_at" = now()
      FROM eligible
      WHERE trail."id" = eligible."id"
    )
    UPDATE "_trails_v" AS version_row
    SET
      "version_distance" = eligible.distance,
      "version_elevation_gain" = eligible.elevation_gain,
      "version_elevation_loss" = eligible.elevation_loss,
      "version_elevation_min" = eligible.elevation_min,
      "version_elevation_max" = eligible.elevation_max,
      "version_elevation_profile" = eligible.elevation_profile || jsonb_build_object(
        'trail', coalesce(version_row."version_display_name", eligible.elevation_profile ->> 'trail')
      ),
      "version_updated_at" = now(),
      "updated_at" = now()
    FROM eligible
    WHERE version_row."parent_id" = eligible."id"
      AND version_row."latest" = true;
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The refreshed profiles use the same JSON format and remain valid on rollback.
}
