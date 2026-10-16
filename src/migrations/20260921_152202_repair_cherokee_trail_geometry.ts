import {
  type MigrateDownArgs,
  type MigrateUpArgs,
  sql,
} from '@payloadcms/db-postgres';
import repairData from './data/20260921_152202_cherokee_trail_geometry.json';

const repairJson = JSON.stringify(repairData);

/**
 * Restore the connector omitted by the archived regional GIS record for
 * Cherokee Trail. Keep the live row and latest Payload version synchronized,
 * but preserve any curator-owned or otherwise-diverged geometry.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    WITH repair AS (
      SELECT *
      FROM jsonb_to_recordset(${repairJson}::jsonb) AS data(
        "trailName" text,
        "geom" jsonb,
        "distance" numeric,
        "elevationGain" numeric,
        "elevationLoss" numeric,
        "elevationMin" numeric,
        "elevationMax" numeric,
        "bounds" jsonb,
        "elevationProfile" jsonb,
        "previousGeom" jsonb,
        "previousDistance" numeric,
        "previousElevationGain" numeric,
        "previousElevationLoss" numeric,
        "previousElevationMin" numeric,
        "previousElevationMax" numeric,
        "previousBounds" jsonb,
        "previousElevationProfile" jsonb
      )
    ), eligible AS (
      SELECT trail."id", repair.*
      FROM "trails" AS trail
      INNER JOIN repair
        ON trail."city" = 'chattanooga'
        AND trail."trail_name" = repair."trailName"
      WHERE trail."geometry_source" IS DISTINCT FROM 'edited'
        AND trail."geom" = repair."previousGeom"
        AND NOT EXISTS (
          SELECT 1
          FROM "_trails_v" AS version_row
          WHERE version_row."parent_id" = trail."id"
            AND version_row."latest" = true
            AND (
              version_row."version_geometry_source" = 'edited'
              OR version_row."version_geom" IS DISTINCT FROM repair."previousGeom"
            )
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

/** Restore the known pre-repair values only while the repair is unchanged. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    WITH repair AS (
      SELECT *
      FROM jsonb_to_recordset(${repairJson}::jsonb) AS data(
        "trailName" text,
        "geom" jsonb,
        "distance" numeric,
        "elevationGain" numeric,
        "elevationLoss" numeric,
        "elevationMin" numeric,
        "elevationMax" numeric,
        "bounds" jsonb,
        "elevationProfile" jsonb,
        "previousGeom" jsonb,
        "previousDistance" numeric,
        "previousElevationGain" numeric,
        "previousElevationLoss" numeric,
        "previousElevationMin" numeric,
        "previousElevationMax" numeric,
        "previousBounds" jsonb,
        "previousElevationProfile" jsonb
      )
    ), eligible AS (
      SELECT trail."id", repair.*
      FROM "trails" AS trail
      INNER JOIN repair
        ON trail."city" = 'chattanooga'
        AND trail."trail_name" = repair."trailName"
      WHERE trail."geometry_source" = 'imported'
        AND trail."geom" = repair."geom"
        AND trail."elevation_profile" = repair."elevationProfile"
        AND NOT EXISTS (
          SELECT 1
          FROM "_trails_v" AS version_row
          WHERE version_row."parent_id" = trail."id"
            AND version_row."latest" = true
            AND (
              version_row."version_geometry_source" IS DISTINCT FROM 'imported'
              OR version_row."version_geom" IS DISTINCT FROM repair."geom"
              OR version_row."version_elevation_profile" IS DISTINCT FROM repair."elevationProfile"
            )
        )
    ), updated_trails AS (
      UPDATE "trails" AS trail
      SET
        "geom" = eligible."previousGeom",
        "distance" = eligible."previousDistance",
        "elevation_gain" = eligible."previousElevationGain",
        "elevation_loss" = eligible."previousElevationLoss",
        "elevation_min" = eligible."previousElevationMin",
        "elevation_max" = eligible."previousElevationMax",
        "bounds" = eligible."previousBounds",
        "elevation_profile" = eligible."previousElevationProfile",
        "updated_at" = now()
      FROM eligible
      WHERE trail."id" = eligible."id"
      RETURNING trail."id"
    )
    UPDATE "_trails_v" AS version_row
    SET
      "version_geom" = eligible."previousGeom",
      "version_distance" = eligible."previousDistance",
      "version_elevation_gain" = eligible."previousElevationGain",
      "version_elevation_loss" = eligible."previousElevationLoss",
      "version_elevation_min" = eligible."previousElevationMin",
      "version_elevation_max" = eligible."previousElevationMax",
      "version_bounds" = eligible."previousBounds",
      "version_elevation_profile" = eligible."previousElevationProfile",
      "version_updated_at" = now(),
      "updated_at" = now()
    FROM eligible
    INNER JOIN updated_trails ON updated_trails."id" = eligible."id"
    WHERE version_row."parent_id" = eligible."id"
      AND version_row."latest" = true;
  `);
}
