const ROUTE_FETCH_TIMEOUT_MS = 5_000;

/** Fetch route GeoJSON without letting a slow database block indefinitely. */
export async function fetchRouteCollection(
  url: string,
  signal?: AbortSignal,
  timeoutMs = ROUTE_FETCH_TIMEOUT_MS,
): Promise<GeoJSON.FeatureCollection | null> {
  const controller = new AbortController();
  let didTimeOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.warn(`Route GeoJSON at ${url} returned ${response.status}.`);
      return null;
    }
    const collection = (await response.json()) as GeoJSON.FeatureCollection;
    if (!Array.isArray(collection?.features)) {
      console.warn(`Route GeoJSON at ${url} was not a FeatureCollection.`);
      return null;
    }
    return collection.features.length > 0 ? collection : null;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (didTimeOut) {
      console.warn(`Route GeoJSON at ${url} timed out after ${timeoutMs}ms.`);
      return null;
    }
    console.warn(`Failed to load route GeoJSON from ${url}.`, error);
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
