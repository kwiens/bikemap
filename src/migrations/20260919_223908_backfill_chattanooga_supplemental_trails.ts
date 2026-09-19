import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres';
import supplementalTrails from './data/20260919_223908_chattanooga_supplemental_trails.json';

const supplementalTrailsJson = JSON.stringify(supplementalTrails);

/**
 * Backfill the six Chattanooga rows whose permitted geometry was absent from
 * the regional shapefile. One JSON recordset keeps this to one database round
 * trip. The live row and Payload's latest version must move together or an
 * admin read can surface the old geometry-less draft and save it over the
 * backfill. If either copy contains curator-owned geometry, both are untouched.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    WITH backfill AS (
      SELECT *
      FROM jsonb_to_recordset(${supplementalTrailsJson}::jsonb) AS data(
        "trailName" text,
        "geom" jsonb,
        "distance" numeric,
        "elevationGain" numeric,
        "elevationLoss" numeric,
        "elevationMin" numeric,
        "elevationMax" numeric,
        "bounds" jsonb,
        "elevationProfile" jsonb,
        "previousDistance" numeric,
        "previousBounds" jsonb
      )
    ), eligible AS (
      SELECT trail."id", backfill.*
      FROM "trails" AS trail
      INNER JOIN backfill
        ON trail."city" = 'chattanooga'
        AND trail."trail_name" = backfill."trailName"
      WHERE trail."geometry_source" IS DISTINCT FROM 'edited'
        AND NOT EXISTS (
          SELECT 1
          FROM "_trails_v" AS version_row
          WHERE version_row."parent_id" = trail."id"
            AND version_row."latest" = true
            AND version_row."version_geometry_source" = 'edited'
        )
    ), updated_trails AS (
      UPDATE "trails" AS trail
      SET
        "geom" = eligible."geom",
        "distance" = eligible."distance",
        "elevation_gain" = eligible."elevationGain",
        "elevation_loss" = eligible."elevationLoss",
        "elevation_min" = eligible."elevationMin",
        "elevation_max" = eligible."elevationMax",
        "bounds" = eligible."bounds",
        "elevation_profile" = eligible."elevationProfile",
        "geometry_source" = 'imported',
        "updated_at" = now()
      FROM eligible
      WHERE trail."id" = eligible."id"
      RETURNING trail."id"
    )
    UPDATE "_trails_v" AS version_row
    SET
      "version_geom" = eligible."geom",
      "version_distance" = eligible."distance",
      "version_elevation_gain" = eligible."elevationGain",
      "version_elevation_loss" = eligible."elevationLoss",
      "version_elevation_min" = eligible."elevationMin",
      "version_elevation_max" = eligible."elevationMax",
      "version_bounds" = eligible."bounds",
      "version_elevation_profile" = eligible."elevationProfile",
      "version_geometry_source" = 'imported',
      "version_updated_at" = now(),
      "updated_at" = now()
    FROM eligible
    INNER JOIN updated_trails ON updated_trails."id" = eligible."id"
    WHERE version_row."parent_id" = eligible."id"
      AND version_row."latest" = true;
  `);
}

/**
 * Restore the prior geometry-less records only while they still contain this
 * migration's exact data. Later curator edits must survive a rollback, and the
 * live row must not roll back independently of a diverged latest version.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    WITH backfill AS (
      SELECT *
      FROM jsonb_to_recordset(${supplementalTrailsJson}::jsonb) AS data(
        "trailName" text,
        "geom" jsonb,
        "distance" numeric,
        "elevationGain" numeric,
        "elevationLoss" numeric,
        "elevationMin" numeric,
        "elevationMax" numeric,
        "bounds" jsonb,
        "elevationProfile" jsonb,
        "previousDistance" numeric,
        "previousBounds" jsonb
      )
    ), eligible AS (
      SELECT trail."id", backfill.*
      FROM "trails" AS trail
      INNER JOIN backfill
        ON trail."city" = 'chattanooga'
        AND trail."trail_name" = backfill."trailName"
      WHERE trail."geometry_source" = 'imported'
        AND trail."geom" = backfill."geom"
        AND trail."elevation_profile" = backfill."elevationProfile"
        AND NOT EXISTS (
          SELECT 1
          FROM "_trails_v" AS version_row
          WHERE version_row."parent_id" = trail."id"
            AND version_row."latest" = true
            AND (
              version_row."version_geometry_source" IS DISTINCT FROM 'imported'
              OR version_row."version_geom" IS DISTINCT FROM backfill."geom"
              OR version_row."version_elevation_profile" IS DISTINCT FROM backfill."elevationProfile"
            )
        )
    ), updated_trails AS (
      UPDATE "trails" AS trail
      SET
        "geom" = NULL,
        "distance" = eligible."previousDistance",
        "elevation_gain" = eligible."elevationGain",
        "elevation_loss" = eligible."elevationLoss",
        "elevation_min" = eligible."elevationMin",
        "elevation_max" = eligible."elevationMax",
        "bounds" = eligible."previousBounds",
        "elevation_profile" = NULL,
        "updated_at" = now()
      FROM eligible
      WHERE trail."id" = eligible."id"
      RETURNING trail."id"
    )
    UPDATE "_trails_v" AS version_row
    SET
      "version_geom" = NULL,
      "version_distance" = eligible."previousDistance",
      "version_elevation_gain" = eligible."elevationGain",
      "version_elevation_loss" = eligible."elevationLoss",
      "version_elevation_min" = eligible."elevationMin",
      "version_elevation_max" = eligible."elevationMax",
      "version_bounds" = eligible."previousBounds",
      "version_elevation_profile" = NULL,
      "version_updated_at" = now(),
      "updated_at" = now()
    FROM eligible
    INNER JOIN updated_trails ON updated_trails."id" = eligible."id"
    WHERE version_row."parent_id" = eligible."id"
      AND version_row."latest" = true;
  `);
}
