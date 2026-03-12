// SVG generation from GeoJSON features using Mercator projection

function mercatorX(lng: number): number {
  return ((lng + 180) / 360) * 256;
}

function mercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    256
  );
}

export function buildSvg(
  features: GeoJSON.Feature[],
  color: string,
): string | null {
  const allCoords: [number, number][] = [];

  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === 'LineString') {
      for (const coord of geom.coordinates) {
        allCoords.push([coord[0], coord[1]]);
      }
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        for (const coord of line) {
          allCoords.push([coord[0], coord[1]]);
        }
      }
    }
  }

  if (allCoords.length === 0) return null;

  // Project all coordinates
  const projected = allCoords.map(
    ([lng, lat]) => [mercatorX(lng), mercatorY(lat)] as [number, number],
  );

  const minX = Math.min(...projected.map((p) => p[0]));
  const maxX = Math.max(...projected.map((p) => p[0]));
  const minY = Math.min(...projected.map((p) => p[1]));
  const maxY = Math.max(...projected.map((p) => p[1]));

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = Math.max(width, height) * 0.05;

  // Build path data from each feature
  const paths: string[] = [];
  for (const feature of features) {
    const geom = feature.geometry;
    const lines: GeoJSON.Position[][] =
      geom.type === 'LineString'
        ? [geom.coordinates]
        : geom.type === 'MultiLineString'
          ? geom.coordinates
          : [];

    for (const line of lines) {
      if (line.length < 2) continue;
      const segments = line.map((coord, i) => {
        const x = mercatorX(coord[0]) - minX + padding;
        const y = mercatorY(coord[1]) - minY + padding;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`;
      });
      paths.push(segments.join(' '));
    }
  }

  if (paths.length === 0) return null;

  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth.toFixed(4)} ${svgHeight.toFixed(4)}" width="800" height="${((800 * svgHeight) / svgWidth).toFixed(0)}">`,
    `  <path d="${paths.join(' ')}" fill="none" stroke="${color}" stroke-width="${(Math.max(svgWidth, svgHeight) * 0.01).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('\n');
}
