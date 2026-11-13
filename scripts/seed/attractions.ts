import { sql } from '@payloadcms/db-postgres';
import attractionSeed from '../../src/data/attraction-seed.json';
import { connect, parseArgs, run } from './shared';

run(async () => {
  const { dryRun } = parseArgs(process.argv.slice(2));
  if (dryRun) {
    console.log(`Attractions seed includes ${attractionSeed.length} records.`);
    return;
  }

  const payload = await connect();
  // Claim the one-time import in the same statement that inserts the rows and
  // their revisions. A failed import rolls back the claim, while concurrent
  // builds and future deploys cannot recreate attractions an editor removed.
  const result = await payload.db.drizzle.execute(sql`
    WITH claimed AS (
      INSERT INTO "payload_kv" ("key", "data")
      VALUES ('bikemap:attractions-seed', 'true'::jsonb)
      ON CONFLICT ("key") DO NOTHING
      RETURNING "key"
    ), candidates AS (
      SELECT
        (entry->>'city')::enum_attractions_city AS city,
        entry->>'name' AS name,
        entry->>'description' AS description,
        entry->>'address' AS address,
        (entry->>'latitude')::numeric AS latitude,
        (entry->>'longitude')::numeric AS longitude,
        (entry->>'icon')::enum_attractions_icon AS icon,
        position
      FROM jsonb_array_elements(${JSON.stringify(attractionSeed)}::jsonb)
        WITH ORDINALITY AS seed(entry, position)
      CROSS JOIN claimed
    ), published AS (
      INSERT INTO "attractions" (
        "city", "name", "description", "address", "latitude", "longitude", "icon", "_status"
      )
      SELECT city, name, description, address, latitude, longitude, icon, 'published'
      FROM candidates
      WHERE NOT EXISTS (
        SELECT 1 FROM "attractions" AS attraction
        WHERE attraction.city = candidates.city AND attraction.name = candidates.name
      ) AND NOT EXISTS (
        SELECT 1 FROM "_attractions_v" AS revision
        WHERE revision.latest
          AND revision.parent_id IS NOT NULL
          AND revision.version_city::text = candidates.city::text
          AND revision.version_name = candidates.name
      )
      ORDER BY position
      RETURNING *
    )
    INSERT INTO "_attractions_v" (
      "parent_id", "version_city", "version_name", "version_description",
      "version_address", "version_latitude", "version_longitude", "version_icon",
      "version__status", "version_created_at", "version_updated_at", "latest"
    )
    SELECT
      "id", "city"::text::enum__attractions_v_version_city, "name", "description",
      "address", "latitude", "longitude", "icon"::text::enum__attractions_v_version_icon,
      'published', "created_at", "updated_at", true
    FROM published;
  `);
  payload.logger.info(
    `Attractions seed created ${result.rowCount ?? 0} records.`,
  );
});
