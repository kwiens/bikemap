import { beforeEach, describe, expect, it, vi } from 'vitest';

const executedSql = vi.hoisted(() => [] as string[]);

vi.mock('@payloadcms/db-postgres', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (query, part, index) => query + part + (values[index] ?? ''),
      '',
    ),
}));

const ensureTheme = await import('./20261002_041000_ensure_theme_global');
const expandPalette = await import('./20261002_043000_expand_theme_palette');
const simplifyPalette = await import(
  './20261002_050000_simplify_theme_palette'
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

describe('theme palette migrations', () => {
  it('creates the legacy-compatible Theme table only when it is absent', async () => {
    await ensureTheme.up(migrationArgs);

    expect(executedSql.join('\n')).toContain('CREATE TABLE IF NOT EXISTS "theme"');
    expect(executedSql.join('\n')).toContain('WHEN duplicate_object THEN null');
  });

  it('adds the expanded palette columns without replacing existing data', async () => {
    await expandPalette.up(migrationArgs);

    const query = executedSql.join('\n');
    expect(query).toContain(
      'ADD COLUMN IF NOT EXISTS "surface_color" varchar',
    );
    expect(query).toContain('ADD COLUMN IF NOT EXISTS "ink_color" varchar');
    expect(query).toContain(
      'ADD COLUMN IF NOT EXISTS "supporting_accent_color" varchar',
    );
    expect(query).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE)\b/);
  });

  it('preserves saved colors by renaming their columns in place', async () => {
    await simplifyPalette.up(migrationArgs);

    const query = executedSql.join('\n');
    expect(query).toContain(
      'RENAME COLUMN "accent_color" TO "primary_color"',
    );
    expect(query).toContain(
      'RENAME COLUMN "deep_color" TO "sidebar_color"',
    );
    expect(query).toContain('RENAME COLUMN "ink_color" TO "text_color"');
    expect(query).toContain(
      'RENAME COLUMN "supporting_accent_color" TO "accent_color"',
    );
    expect(query).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE)\b/);
  });
});
