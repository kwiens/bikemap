import type { FeatureCollection, Position } from 'geojson';
import type mapboxgl from 'mapbox-gl';
import type { BikeRoute } from '@/data/bike-routes';
import { applyArrowDirectionOverrides, removeOverlappingSegments } from './map';

const ARROW_SPACING_PX = 160;
const MIN_ARROW_GAP_PX = 80;
const MIN_RUN_LENGTH_PX = 24;

export function attachRouteArrows(
  map: mapboxgl.Map,
  routes: readonly BikeRoute[],
  inlineRouteIds: ReadonlySet<string>,
  collection: FeatureCollection | null,
): RouteArrowOverlay {
  const routesById = new Map(
    routes
      .filter((route) => !route.hideArrows)
      .map((route) => [route.id, route]),
  );
  const canvas = document.createElement('canvas');
  canvas.className = 'mapboxgl-canvas pointer-events-none';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context || !routesById.size) return { select() {}, remove() {} };
  map.getCanvasContainer().append(canvas);

  let selected: BikeRoute | undefined;
  let opacity = 0;
  let paths: Position[][] = [];
  let needsGeometry = false;
  let hasArrows = false;
  let canvasWidth = 0;
  let canvasHeight = 0;

  function readGeometry() {
    needsGeometry = false;
    if (!selected) return;
    const { id, reverseArrowBounds } = selected;
    if (inlineRouteIds.has(id)) {
      const features =
        collection?.features.filter(
          (feature) => feature.properties?.id === id,
        ) ?? [];
      paths = removeOverlappingSegments(features).map(
        ({ geometry }) => geometry.coordinates,
      );
      return;
    }

    const layer = map.getLayer(id);
    if (layer?.type !== 'line' || typeof layer.source !== 'string') return;
    const sourceLayer = layer['source-layer'];
    const filter = map.getFilter(id);
    const features = map.querySourceFeatures(layer.source, {
      ...(sourceLayer ? { sourceLayer } : {}),
      ...(filter ? { filter } : {}),
    });
    paths = applyArrowDirectionOverrides(
      removeOverlappingSegments(features),
      reverseArrowBounds,
    ).map(({ geometry }) => geometry.coordinates);
  }

  function render() {
    if (!context || (!selected && !hasArrows)) return;
    if (needsGeometry) readGeometry();

    const mapCanvas = map.getCanvas();
    const { clientWidth: width, clientHeight: height } = mapCanvas;
    if (!width || !height) return;
    if (
      canvas.width !== mapCanvas.width ||
      canvas.height !== mapCanvas.height
    ) {
      canvas.width = mapCanvas.width;
      canvas.height = mapCanvas.height;
    }
    if (width !== canvasWidth || height !== canvasHeight) {
      canvasWidth = width;
      canvasHeight = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    context.setTransform(
      canvas.width / width,
      0,
      0,
      canvas.height / height,
      0,
      0,
    );
    context.clearRect(0, 0, width, height);
    hasArrows = false;
    if (!selected || !opacity) return;

    const arrows = spaceRouteArrows(
      paths,
      ([lng, lat]) => map.project([lng, lat]),
      width,
      height,
    );
    context.globalAlpha = opacity;
    context.strokeStyle = selected.color;
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const { x, y, angle } of arrows) {
      const heading = selected.reverseDirection ? angle + Math.PI : angle;
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      context.moveTo(x - 5 * cos + 8 * sin, y - 5 * sin - 8 * cos);
      context.lineTo(x + 5 * cos, y + 5 * sin);
      context.lineTo(x - 5 * cos - 8 * sin, y - 5 * sin + 8 * cos);
    }
    context.stroke();
    hasArrows = arrows.length > 0;
  }

  // Only Studio routes depend on the currently loaded tiles. Coalesce tile
  // updates into the next render and use full geometry for inline routes.
  function updateStudioGeometry({ sourceId }: mapboxgl.MapSourceDataEvent) {
    if (
      selected &&
      !inlineRouteIds.has(selected.id) &&
      map.getLayer(selected.id)?.source === sourceId
    ) {
      needsGeometry = true;
    }
  }

  map.on('render', render);
  map.on('sourcedata', updateStudioGeometry);
  return {
    select(routeId, nextOpacity) {
      const route = routeId ? routesById.get(routeId) : undefined;
      if (selected !== route) {
        selected = route;
        paths = [];
        needsGeometry = Boolean(route);
      }
      opacity = nextOpacity;
      render();
    },
    remove() {
      map.off('render', render);
      map.off('sourcedata', updateStudioGeometry);
      canvas.remove();
    },
  };
}

export function spaceRouteArrows(
  paths: readonly Position[][],
  project: (position: Position) => ScreenPoint,
  width: number,
  height: number,
): RouteArrow[] {
  const arrows: RouteArrow[] = [];
  for (const path of paths) {
    if (path.length < 2) continue;
    let previous = project(path[0]);
    let visibleRun: ScreenSegment[] = [];
    for (let index = 1; index < path.length; index++) {
      const point = project(path[index]);
      const segment = clipToViewport(previous, point, width, height);
      if (visibleRun.length && !isOnScreen(previous, width, height)) {
        addArrows(visibleRun, arrows);
        visibleRun = [];
      }
      if (segment) visibleRun.push(segment);
      previous = point;
    }
    addArrows(visibleRun, arrows);
  }
  return arrows;
}

function isOnScreen({ x, y }: ScreenPoint, width: number, height: number) {
  return x >= 0 && x <= width && y >= 0 && y <= height;
}

function clipToViewport(
  from: ScreenPoint,
  to: ScreenPoint,
  width: number,
  height: number,
): ScreenSegment | undefined {
  if (
    Math.max(from.x, to.x) < 0 ||
    Math.min(from.x, to.x) > width ||
    Math.max(from.y, to.y) < 0 ||
    Math.min(from.y, to.y) > height
  ) {
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const minX = dx ? (0 - from.x) / dx : -Infinity;
  const maxX = dx ? (width - from.x) / dx : Infinity;
  const minY = dy ? (0 - from.y) / dy : -Infinity;
  const maxY = dy ? (height - from.y) / dy : Infinity;
  const start = Math.max(0, Math.min(minX, maxX), Math.min(minY, maxY));
  const end = Math.min(1, Math.max(minX, maxX), Math.max(minY, maxY));
  const length = (end - start) * Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) return;
  return {
    x: from.x + start * dx,
    y: from.y + start * dy,
    dx: (end - start) * dx,
    dy: (end - start) * dy,
    length,
  };
}

function addArrows(segments: readonly ScreenSegment[], arrows: RouteArrow[]) {
  const length = segments.reduce((total, segment) => total + segment.length, 0);
  if (length < MIN_RUN_LENGTH_PX) return;
  // Center short visible runs and leave half a gap at both ends of long runs.
  const spacing = length / Math.max(1, Math.round(length / ARROW_SPACING_PX));
  let offset = spacing / 2;
  for (const { x, y, dx, dy, length: segmentLength } of segments) {
    // Clipping bounds the number of candidates by the visible run length.
    for (; offset <= segmentLength; offset += spacing) {
      const candidateX = x + (offset / segmentLength) * dx;
      const candidateY = y + (offset / segmentLength) * dy;
      // A switchback or a separate part may pass close to a previous arrow.
      if (
        arrows.every(
          (arrow) =>
            (arrow.x - candidateX) ** 2 + (arrow.y - candidateY) ** 2 >=
            MIN_ARROW_GAP_PX ** 2,
        )
      ) {
        arrows.push({
          x: candidateX,
          y: candidateY,
          angle: Math.atan2(dy, dx),
        });
      }
    }
    offset -= segmentLength;
  }
}

export interface RouteArrowOverlay {
  select(routeId: string | null, opacity: number): void;
  remove(): void;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface ScreenSegment extends ScreenPoint {
  dx: number;
  dy: number;
  length: number;
}

interface RouteArrow extends ScreenPoint {
  angle: number;
}
