import { haversineDistance } from '@/utils/ride-stats';

export type Position = [number, number];
export const METERS_PER_DEG_LAT = 111_320;

export function distance(a: Position, b: Position): number {
  return haversineDistance(a[1], a[0], b[1], b[0]);
}

export function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

/** Project locally in meters; both editors snap onto the same segment geometry. */
export function segmentProjection(origin: Position): (
  a: Position,
  b: Position,
) => {
  distanceMeters: number;
  metersToFrom: number;
  metersToTo: number;
  point: Position;
} {
  const longitudeScale =
    METERS_PER_DEG_LAT * Math.cos((origin[1] * Math.PI) / 180);
  return (a, b) => {
    const ax = (a[0] - origin[0]) * longitudeScale;
    const ay = (a[1] - origin[1]) * METERS_PER_DEG_LAT;
    const bx = (b[0] - origin[0]) * longitudeScale;
    const by = (b[1] - origin[1]) * METERS_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const meters = Math.sqrt(lengthSquared);
    return {
      distanceMeters: Math.hypot(ax + t * dx, ay + t * dy),
      metersToFrom: t * meters,
      metersToTo: (1 - t) * meters,
      point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
    };
  };
}
