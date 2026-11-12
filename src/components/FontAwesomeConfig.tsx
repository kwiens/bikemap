'use client';

import { config } from '@fortawesome/fontawesome-svg-core';

// Font Awesome otherwise injects its stylesheet at runtime as an unlayered
// <style>, which beats Tailwind 4's layered utilities. globals.css imports the
// same stylesheet into the `vendor` layer instead. This runs at module load,
// before any icon renders.
config.autoAddCss = false;

export function FontAwesomeConfig() {
  return null;
}
