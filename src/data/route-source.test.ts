import { faRoute } from '@fortawesome/free-solid-svg-icons';
import { describe, expect, it } from 'vitest';
import type { BikeRoute } from './bike-routes';
import {
  getBikeRoutes,
  onBikeRoutesChange,
  setBikeRoutes,
} from './route-source';

function route(name: string): BikeRoute {
  return {
    color: '#2563EB',
    defaultWidth: 8,
    description: '',
    distance: 1,
    icon: faRoute,
    id: name.toLowerCase(),
    name,
    opacity: 1,
  };
}

describe('route-source', () => {
  it('accepts an empty database result instead of exposing stale cards', () => {
    setBikeRoutes([route('Stored')]);
    setBikeRoutes([]);
    expect(getBikeRoutes()).toEqual([]);
  });

  it('notifies subscribers when routes change', () => {
    let notified = 0;
    const unsubscribe = onBikeRoutesChange(() => {
      notified += 1;
    });
    setBikeRoutes([route('Deschutes')]);
    expect(notified).toBe(1);
    unsubscribe();
  });
});
