import { describe, expect, it, vi } from 'vitest';
import { TrailConditions } from './TrailConditions';

describe('condition report city', () => {
  const hook = TrailConditions.hooks!.beforeValidate![0];

  it.each([undefined, 'chattanooga'])(
    'uses the saved trail city instead of %s',
    async (city) => {
      const findByID = vi.fn().mockResolvedValue({ id: 42, city: 'bend' });
      const req = { payload: { findByID } };
      const result = await hook({
        data: { trail: 42, city },
        req,
      } as unknown as Parameters<typeof hook>[0]);

      expect(result).toEqual({ trail: 42, city: 'bend' });
      expect(findByID).toHaveBeenCalledWith({
        collection: 'trails',
        id: 42,
        depth: 0,
        select: { city: true },
        req,
      });
    },
  );

  it('keeps a moderation update in the original trail city', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 42, city: 'chattanooga' });
    const result = await hook({
      data: { hidden: true },
      originalDoc: { trail: { id: 42 } },
      req: { payload: { findByID } },
    } as unknown as Parameters<typeof hook>[0]);
    expect(result).toEqual({ hidden: true, city: 'chattanooga' });
  });
});
