import { expect, it } from 'vitest';
import { embedBuilderConfig } from './embed-options';

it('offers the Attractions layer only when the map has attractions', () => {
  const available = embedBuilderConfig('bend', [], true);
  const empty = embedBuilderConfig('bend', [], false);

  expect(available.availableLayers).toContain('attractions');
  expect(empty.availableLayers).toEqual(
    available.availableLayers.filter((layer) => layer !== 'attractions'),
  );
});
