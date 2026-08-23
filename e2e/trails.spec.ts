import { expect, openMap, test } from './fixtures/playwright';

const TRAIL_NAME = 'Small Intestine Loop';

test.describe('Mountain bike trails', () => {
  test('searches, selects, and explores a trail elevation profile', async ({
    page,
  }) => {
    await openMap(page);

    await expect(page.getByRole('button', { name: 'MTB' })).toBeVisible();

    const search = page.getByPlaceholder('Search trails...');
    await search.fill('small intestine');

    const trail = page.getByRole('button', {
      name: new RegExp(TRAIL_NAME),
    });
    await expect(trail).toContainText('2.8 mi');
    await expect(trail).toContainText('↑562 ft');
    await trail.click();

    await expect(page).toHaveURL(/\?trail=small-intestine-loop$/);
    await expect(trail).toHaveAttribute('data-selected', 'true');

    const chart = page.getByRole('img', {
      name: `Elevation profile for ${TRAIL_NAME}`,
    });
    await expect(chart).toBeVisible();
    await expect(page.getByText('2.8 mi', { exact: true })).toBeVisible();
    await expect(
      page.getByText('+562 ft climbing', { exact: true }),
    ).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (
            window as unknown as {
              __map?: {
                getPaintProperty: (layer: string, property: string) => unknown;
              };
            }
          ).__map;
          return JSON.stringify(
            map?.getPaintProperty('mtb-trails', 'line-width'),
          );
        }),
      )
      .toContain(TRAIL_NAME);

    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();
    await chart.hover({
      position: {
        x: Math.round((chartBox?.width ?? 2) / 2),
        y: Math.round((chartBox?.height ?? 2) / 2),
      },
    });
    await expect(page.getByText(/\d+\.\d{2} mi · [\d,]+ ft/)).toBeVisible();

    await page.getByTitle('Collapse').click();
    await expect(chart).toHaveCount(0);

    await page.getByTitle('Show elevation profile').click();
    await expect(chart).toBeVisible();
  });
});
