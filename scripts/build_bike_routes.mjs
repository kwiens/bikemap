import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const EARTH_RADIUS_METERS = 6378137;
const SIMPLIFICATION_TOLERANCE_METERS = 0.5;

const routeProfiles = [
  ['riverwalk-loop-v3-public', 'riverwalk-loop.json'],
  ['zoo-loop-v2-full-public', 'zoo-loop.json'],
  ['Riverwalk_trail-test-public', 'riverwalk-greenway-trail.json'],
  ['South_Chick_GreenWay-public', 'south-chickamauga-creek.json'],
  ['cherokeeloop', 'cherokee-loop.json'],
  ['Moccasin Bend Route', 'moccasin-bend-route.json'],
];

function coordinatesFromProfile(profile, filename) {
  const coordinates = [];

  for (const point of profile) {
    const longitude = point?.[2];
    const latitude = point?.[3];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error(`Invalid coordinate in ${filename}`);
    }

    const previous = coordinates.at(-1);
    if (!previous || previous[0] !== longitude || previous[1] !== latitude) {
      coordinates.push([longitude, latitude]);
    }
  }

  if (coordinates.length < 2) {
    throw new Error(`${filename} does not contain a usable line`);
  }

  return coordinates;
}

function projectToWebMercator([longitude, latitude]) {
  return [
    EARTH_RADIUS_METERS * longitude * (Math.PI / 180),
    EARTH_RADIUS_METERS *
      Math.log(Math.tan(Math.PI / 4 + latitude * (Math.PI / 360))),
  ];
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const progress =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (progress > 1) {
      x = end[0];
      y = end[1];
    } else if (progress > 0) {
      x += dx * progress;
      y += dy * progress;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

// Elevation profiles are sampled about every 25 feet. Ramer-Douglas-Peucker
// keeps map geometry within half a meter while discarding redundant samples.
function simplifyCoordinates(coordinates) {
  if (coordinates.length <= 2) return coordinates;

  const projected = coordinates.map(projectToWebMercator);
  const keep = new Uint8Array(coordinates.length);
  const stack = [[0, coordinates.length - 1]];
  const squaredTolerance = SIMPLIFICATION_TOLERANCE_METERS ** 2;
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = squaredTolerance;

    for (let index = start + 1; index < end; index += 1) {
      const distance = squaredSegmentDistance(
        projected[index],
        projected[start],
        projected[end],
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }

    if (furthestIndex !== -1) {
      keep[furthestIndex] = 1;
      stack.push([start, furthestIndex], [furthestIndex, end]);
    }
  }

  return coordinates.filter((_, index) => keep[index] === 1);
}

const features = await Promise.all(
  routeProfiles.map(async ([routeId, filename]) => {
    const inputPath = path.join(
      projectRoot,
      'public',
      'data',
      'elevation',
      'chattanooga',
      filename,
    );
    const profile = JSON.parse(await readFile(inputPath, 'utf8'));

    return {
      type: 'Feature',
      properties: {
        id: routeId,
        name: profile.trail,
      },
      geometry: {
        type: 'LineString',
        coordinates: simplifyCoordinates(
          coordinatesFromProfile(profile.profile, filename),
        ),
      },
    };
  }),
);

const outputPath = path.join(
  projectRoot,
  'public',
  'data',
  'chattanooga',
  'routes.geojson',
);

await writeFile(
  outputPath,
  `${JSON.stringify({ type: 'FeatureCollection', features })}\n`,
);

const pointCount = features.reduce(
  (total, feature) => total + feature.geometry.coordinates.length,
  0,
);
console.log(
  `Wrote ${features.length} routes (${pointCount} points) to ${outputPath}`,
);
