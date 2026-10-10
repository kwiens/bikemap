/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWebShare } from './share';

describe('createWebShare', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads a file through a blob link', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:gpx');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const outcome = await createWebShare().exportFile({
      filename: 'ride.gpx',
      mimeType: 'application/gpx+xml',
      content: '<gpx/>',
    });

    expect(outcome).toBe('downloaded');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('ride.gpx');
    expect(anchor.href).toBe('blob:gpx');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:gpx');
  });

  it('shares a link by copying it, and reports a clipboard failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await expect(
      createWebShare().shareLink('https://x/?trail=a'),
    ).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/?trail=a');

    writeText.mockRejectedValue(new Error('denied'));
    await expect(createWebShare().shareLink('https://x/')).resolves.toBe(
      'failed',
    );
  });
});
