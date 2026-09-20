import { describe, expect, it, vi } from 'vitest';
import type { PayloadRequest } from 'payload';
import { canDeleteUser, preventDeletingLastAdmin } from './Users';

function requestWithUser(user: Record<string, unknown> | null) {
  return {
    user,
    payload: {
      count: vi.fn(),
      findByID: vi.fn(),
    },
  } as unknown as PayloadRequest;
}

describe('canDeleteUser', () => {
  it('requires an administrator', async () => {
    const req = requestWithUser({ id: 1, role: 'editor' });
    expect(await canDeleteUser({ req, id: 2 })).toBe(false);
  });

  it('prevents self-deletion', async () => {
    const req = requestWithUser({ id: 1, role: 'admin' });
    expect(await canDeleteUser({ req, id: 1 })).toBe(false);
  });

  it('limits deletion to accounts other than the active administrator', async () => {
    const req = requestWithUser({ id: 1, role: 'admin' });
    expect(await canDeleteUser({ req, id: 2 })).toEqual({
      id: { not_equals: 1 },
    });
  });
});

describe('preventDeletingLastAdmin', () => {
  it('rejects deletion of the final administrator', async () => {
    const req = requestWithUser({ id: 1, role: 'admin' });
    vi.mocked(req.payload.findByID).mockResolvedValue({
      id: 1,
      role: 'admin',
    } as never);
    vi.mocked(req.payload.count).mockResolvedValue({ totalDocs: 1 });

    await expect(
      preventDeletingLastAdmin({ id: 1, req } as never),
    ).rejects.toMatchObject({ status: 409, isPublic: true });
  });

  it('allows an administrator deletion when another remains', async () => {
    const req = requestWithUser({ id: 1, role: 'admin' });
    vi.mocked(req.payload.findByID).mockResolvedValue({
      id: 2,
      role: 'admin',
    } as never);
    vi.mocked(req.payload.count).mockResolvedValue({ totalDocs: 2 });

    await expect(
      preventDeletingLastAdmin({ id: 2, req } as never),
    ).resolves.toBeUndefined();
  });
});
