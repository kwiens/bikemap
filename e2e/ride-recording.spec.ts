import {
  expect,
  openMap,
  setMockGeolocation,
  test,
  type MockGeolocationPoint,
} from './fixtures/playwright';

test.describe('Ride recording', () => {
  test('records, pauses, saves, and manages a ride', async ({ page }) => {
    await openMap(page);

    await page.getByRole('button', { name: 'Open rides panel' }).click();
    await expect(page.getByRole('heading', { name: 'My Rides' })).toBeVisible();
    await page.getByRole('button', { name: 'Record a Ride' }).click();

    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    const distance = recordingStat(page, 'Distance');
    const climbing = recordingStat(page, 'Climbing');
    const timestamp = Date.now();

    await sendPoint(page, timestamp, 1, -85.3064, 35.0599, 214);
    await sendPoint(page, timestamp, 2, -85.306, 35.0602, 218);
    await expect(distance).toHaveText(/\d+\.\d mi/);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    const pausedDistance = await distance.textContent();

    await sendPoint(page, timestamp, 3, -85.3, 35.065, 222);
    await expect(distance).toHaveText(pausedDistance ?? '');

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    await sendPoint(page, timestamp, 4, -85.3056, 35.0605, 222);
    await sendPoint(page, timestamp, 5, -85.3052, 35.0608, 226);
    await sendPoint(page, timestamp, 6, -85.3048, 35.0611, 230);

    await expect(distance).not.toHaveText('0.0 mi');
    await expect(climbing).not.toHaveText('0 ft');

    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page.getByText('Ride saved!')).toBeVisible();
    const rideDetail = page.getByRole('button', { name: 'Back' }).locator('..');
    await expect(
      rideDetail.getByRole('button', { name: 'Export GPX' }),
    ).toBeVisible();
    const recordedProfile = page.getByRole('img', {
      name: /Elevation profile for Ride on/,
    });
    await expect(recordedProfile).toBeVisible();

    await rideDetail.getByRole('button', { name: 'Rename ride' }).click();
    const nameInput = rideDetail.getByRole('textbox', { name: 'Ride name' });
    await nameInput.fill('Morning Test Ride');
    await nameInput.press('Enter');
    await expect(rideDetail.getByText('Morning Test Ride')).toBeVisible();
    await expect(recordedProfile).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await rideDetail.getByRole('button', { name: 'Export GPX' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('morning-test-ride.gpx');

    const deleteButton = rideDetail.getByRole('button', { name: 'Delete' });
    await deleteButton.click();
    await expect(
      rideDetail.getByRole('button', { name: 'Confirm Delete' }),
    ).toBeVisible();
    await rideDetail.getByRole('button', { name: 'Confirm Delete' }).click();

    await expect(page.getByText('Track your rides')).toBeVisible();
    await expect(recordedProfile).toHaveCount(0);
  });
});

function recordingStat(
  page: Parameters<typeof openMap>[0],
  label: 'Distance' | 'Climbing',
) {
  return page
    .getByText(label, { exact: true })
    .locator('..')
    .locator('span')
    .first();
}

async function sendPoint(
  page: Parameters<typeof openMap>[0],
  startedAt: number,
  seconds: number,
  longitude: number,
  latitude: number,
  altitude: number,
): Promise<void> {
  const point: MockGeolocationPoint = {
    longitude,
    latitude,
    altitude,
    accuracy: 5,
    altitudeAccuracy: 5,
    speed: 4,
    timestamp: startedAt + seconds * 1000,
  };
  await setMockGeolocation(page, point);
}
