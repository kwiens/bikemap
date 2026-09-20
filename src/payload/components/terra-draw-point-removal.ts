import type { Position } from 'geojson';
import type { TerraDraw } from 'terra-draw';

export type PointRemovalResult = 'minimum-points' | 'miss' | 'removed';

/**
 * Removes the selected line's vertex nearest a map click.
 *
 * Terra Draw exposes right-click deletion, but that has no touch equivalent and
 * its Delete key removes the entire selected feature. This uses its public
 * geometry API so the edit still enters Terra Draw's undo history.
 */
export function removeSelectedLinePointAt(
  draw: TerraDraw,
  lngLat: { lat: number; lng: number },
  pointerDistance: number,
): PointRemovalResult {
  const candidate = draw
    .getFeaturesAtLngLat(lngLat, {
      addClosestCoordinateInfoToProperties: true,
      ignoreCoordinatePoints: true,
      pointerDistance,
    })
    .filter(
      (feature) =>
        feature.geometry.type === 'LineString' &&
        feature.properties.selected === true &&
        Number(feature.properties.closestCoordinatePixelDistanceToEvent) <=
          pointerDistance,
    )
    .sort(
      (left, right) =>
        Number(left.properties.closestCoordinatePixelDistanceToEvent) -
        Number(right.properties.closestCoordinatePixelDistanceToEvent),
    )[0];

  if (
    !candidate ||
    candidate.id === undefined ||
    candidate.geometry.type !== 'LineString'
  ) {
    return 'miss';
  }

  const featureId = candidate.id;
  const index = Number(candidate.properties.closestCoordinateIndexToEvent);
  const coordinates = candidate.geometry.coordinates;
  if (!Number.isInteger(index) || index < 0 || index >= coordinates.length) {
    return 'miss';
  }
  if (coordinates.length <= 2) {
    return 'minimum-points';
  }

  // Updating selected geometry also rewrites Terra Draw's coordinate handles.
  // Its session history then records a no-op snapshot that Undo can never get
  // past. Updating while deselected and restoring the selection produces one
  // real, reversible geometry edit instead.
  draw.deselectFeature(featureId);
  draw.updateFeatureGeometry(featureId, {
    coordinates: coordinates.filter(
      (_coordinate: Position, coordinateIndex: number) =>
        coordinateIndex !== index,
    ),
    type: 'LineString',
  });
  draw.selectFeature(featureId);
  return 'removed';
}
