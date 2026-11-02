import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getPayloadMock, createLocalReqMock } = vi.hoisted(() => ({
  getPayloadMock: vi.fn(),
  createLocalReqMock: vi.fn(async ({ req }) => req),
}));
vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));
vi.mock('payload', () => ({
  getPayload: getPayloadMock,
  createLocalReq: createLocalReqMock,
}));

import { submitConditionReport } from './submit';

const input = {
  city: 'bend' as const,
  condition: 'dry',
  slug: 'pondo',
  observedAt: new Date(),
  reporterHash: 'reporter',
};

function database() {
  const execute = vi.fn().mockResolvedValue(undefined);
  const db = {
    beginTransaction: vi.fn().mockResolvedValue('tx'),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    sessions: { tx: { db: { execute } } },
  };
  const payload = {
    db,
    find: vi.fn(async ({ collection }) => ({
      docs:
        collection === 'trails'
          ? [{ id: 1, slug: 'pondo' }]
          : [{ id: 2, name: 'Dry', value: 'dry' }],
    })),
    findGlobal: vi.fn().mockResolvedValue({ enabled: true }),
    count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
    create: vi
      .fn()
      .mockResolvedValue({ id: 3, createdAt: new Date().toISOString() }),
  };
  getPayloadMock.mockResolvedValue(payload);
  return { payload, execute };
}

beforeEach(() => vi.stubEnv('DATABASE_URL', 'test'));
afterEach(() => vi.unstubAllEnvs());

describe('condition report transaction', () => {
  it('waits for the reporter lock before counting and uses that transaction for the insert', async () => {
    const { payload, execute } = database();
    let release: () => void = () => {};
    execute.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const pending = submitConditionReport(input);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(payload.count).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
    release();
    expect((await pending).ok).toBe(true);
    expect(payload.db.beginTransaction).toHaveBeenCalledWith({
      isolationLevel: 'read committed',
    });
    for (const [args] of payload.count.mock.calls)
      expect(args).toMatchObject({ req: { transactionID: 'tx' } });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ req: { transactionID: 'tx' } }),
    );
    expect(payload.db.commitTransaction).toHaveBeenCalledWith('tx');
  });

  it('rolls back a rate-limited request without inserting', async () => {
    const { payload } = database();
    payload.count.mockResolvedValue({ totalDocs: 1 });
    expect(await submitConditionReport(input)).toMatchObject({
      ok: false,
      reason: 'rate-limited',
    });
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith('tx');
  });

  it('releases the transaction when the write fails', async () => {
    const { payload } = database();
    payload.create.mockRejectedValue(new Error('write failed'));
    expect(await submitConditionReport(input)).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
    expect(payload.db.commitTransaction).not.toHaveBeenCalled();
    expect(payload.db.rollbackTransaction).toHaveBeenCalledWith('tx');
  });
});
