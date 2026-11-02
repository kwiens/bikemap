import { beforeEach, describe, expect, it, vi } from 'vitest';

const executedSql = vi.hoisted(() => [] as string[]);

vi.mock('@payloadcms/db-postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (query, part, index) => query + part + (values[index] ?? ''),
      '',
    ),
}));

const composedRoutes = await import(
  '../../migrations/20261001_221021_add_composed_routes'
);
const drawnRoutes = await import(
  '../../migrations/20261029_220844_add_drawn_routes'
);

const migrationArgs = {
  db: {
    execute: vi.fn((query: string) => {
      executedSql.push(query);
    }),
  },
} as never;

beforeEach(() => {
  executedSql.length = 0;
});

// Casting a row whose value the recreated enum no longer has fails the whole
// rollback, so each down migration must remap those rows first — in the
// routes table and in its versions table.
describe.each([
  { migration: composedRoutes, value: 'composed' },
  { migration: drawnRoutes, value: 'drawn' },
])('$value routes down migration', ({ migration, value }) => {
  it.each([
    ['routes', 'geometry_source', 'enum_routes_geometry_source'],
    [
      '_routes_v',
      'version_geometry_source',
      'enum__routes_v_version_geometry_source',
    ],
  ])(
    'remaps %s rows before casting back to the enum',
    async (table, column, type) => {
      await migration.down(migrationArgs);
      const query = executedSql.join('\n');

      const remap = query.indexOf(
        `UPDATE "${table}" SET "${column}" = 'imported' WHERE "${column}" = '${value}';`,
      );
      const cast = query.indexOf(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DATA TYPE "public"."${type}"`,
      );
      expect(remap).toBeGreaterThan(-1);
      expect(cast).toBeGreaterThan(remap);
    },
  );
});
