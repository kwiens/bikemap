import { describe, expect, it } from 'vitest';
import type { PayloadRequest } from 'payload';
import {
  accessAssignedCity,
  canChangeCity,
  createInAssignedCity,
} from './city-scoped';

function req(user: Record<string, unknown> | null): PayloadRequest {
  return { user } as unknown as PayloadRequest;
}

describe('accessAssignedCity', () => {
  it('allows admins to access every city', async () => {
    expect(
      await accessAssignedCity({ req: req({ id: 1, role: 'admin' }) }),
    ).toBe(true);
  });

  it('filters scoped users to their assigned city', async () => {
    expect(
      await accessAssignedCity({
        req: req({ id: 2, role: 'editor', city: 'bend' }),
      }),
    ).toEqual({ city: { equals: 'bend' } });
  });
});

describe('createInAssignedCity', () => {
  it('allows admins to create in every city', async () => {
    expect(
      await createInAssignedCity({
        data: { city: 'bend' },
        req: req({ id: 1, role: 'admin' }),
      }),
    ).toBe(true);
  });

  it('allows scoped users only when submitted data matches their city', async () => {
    const request = req({ id: 2, role: 'editor', city: 'bend' });

    expect(
      await createInAssignedCity({ data: { city: 'bend' }, req: request }),
    ).toBe(true);
    expect(
      await createInAssignedCity({
        data: { city: 'chattanooga' },
        req: request,
      }),
    ).toBe(false);
    expect(await createInAssignedCity({ data: {}, req: request })).toBe(false);
  });
});

describe('canChangeCity', () => {
  it('reserves city reassignment for administrators', async () => {
    expect(await canChangeCity({ req: req({ id: 1, role: 'admin' }) })).toBe(
      true,
    );
    expect(
      await canChangeCity({
        req: req({ id: 2, role: 'editor', city: 'bend' }),
      }),
    ).toBe(false);
  });
});
