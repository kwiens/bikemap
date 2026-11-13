import { cellBounds } from '@/payload/routing/cells';
import { fetchRouteNetwork } from '@/payload/routing/fetch-network';
import type { NetworkWay } from '@/payload/routing/graph';
import { createNetworkEndpoint } from './network-endpoint';

export interface RouteNetworkResponse {
  ways: NetworkWay[];
}

/** GET /api/routes/network?cell=x,y. */
const endpoint = createNetworkEndpoint({
  fetchWays: fetchRouteNetwork,
  invalidMessage: 'cell must be two grid indexes, "x,y".',
  label: 'Route network',
  maxCachedCells: 128,
  parseBounds: (params) => cellBounds(params.get('cell') ?? ''),
});

export const routeNetwork = endpoint.handler;
