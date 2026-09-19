import 'server-only';

/**
 * Turns the saved theme global into CSS the admin layout can inject.
 *
 * Everything here resolves to the same custom properties `custom.css` sets, so
 * a saved theme overrides the stylesheet defaults without touching any of
 * Payload's own selectors.
 *
 * **Never throws.** No database, an unreachable one, or an unset global all
 * return an empty string, and the stylesheet defaults stand. Nobody should be
 * locked out of the admin because a theme row could not be read.
 */
import { getPayload } from 'payload';
import config from '@payload-config';

/**
 * The greys everything is built from. Payload derives dark mode by *inverting*
 * this scale, so one definition themes both modes — see custom.css.
 */
const NEUTRAL_RAMPS = {
  cool: [
    '255,255,255',
    '246,248,249',
    '238,241,243',
    '227,232,234',
    '214,220,223',
    '184,194,198',
    '148,161,166',
    '111,125,131',
    '86,98,104',
    '63,74,79',
    '42,51,56',
    '31,39,43',
    '20,26,29',
    '10,14,16',
    '0,0,0',
  ],
  neutral: [
    '255,255,255',
    '245,245,245',
    '235,235,235',
    '221,221,221',
    '208,208,208',
    '181,181,181',
    '154,154,154',
    '128,128,128',
    '101,101,101',
    '74,74,74',
    '47,47,47',
    '34,34,34',
    '20,20,20',
    '7,7,7',
    '0,0,0',
  ],
  warm: [
    '255,255,255',
    '249,247,245',
    '243,240,236',
    '236,231,225',
    '224,217,209',
    '196,187,176',
    '166,155,143',
    '133,123,112',
    '106,97,88',
    '79,72,65',
    '52,47,42',
    '38,34,30',
    '23,20,18',
    '12,10,9',
    '0,0,0',
  ],
} as const;

/** Positions in Payload's `--color-base-*` scale, in ramp order. */
const RAMP_STOPS = [
  0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950, 1000,
];

const CORNERS = {
  round: ['10px', '16px', '24px'],
  sharp: ['3px', '4px', '8px'],
  soft: ['6px', '10px', '16px'],
} as const;

const SYSTEM_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const FONTS = {
  geist: `var(--font-geist-sans), ${SYSTEM_STACK}`,
  serif: `ui-serif, Georgia, Cambria, 'Times New Roman', serif`,
  system: SYSTEM_STACK,
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ThemeDoc {
  accentColor?: null | string;
  cornerStyle?: keyof typeof CORNERS | null;
  customCss?: null | string;
  deepColor?: null | string;
  fontFamily?: keyof typeof FONTS | null;
  neutralTint?: keyof typeof NEUTRAL_RAMPS | null;
}

/**
 * Strips anything that could close the `<style>` element the result is injected
 * into. `customCss` is admin-only, but "trusted input" is exactly how injection
 * bugs get written — a stray `</style>` would turn styling into markup.
 */
function sanitizeCss(css: string): string {
  return css.replace(/[<>]/g, '');
}

/** Exported for tests; `getThemeCss` is the real entry point. */
export function buildThemeCss(theme: ThemeDoc): string {
  return buildCss(theme);
}

function buildCss(theme: ThemeDoc): string {
  const declarations: string[] = [];

  if (theme.accentColor && HEX.test(theme.accentColor)) {
    declarations.push(`--brand-accent:${theme.accentColor}`);
    declarations.push(`--accessibility-outline:2px solid ${theme.accentColor}`);
  }
  if (theme.deepColor && HEX.test(theme.deepColor)) {
    declarations.push(`--brand-deep:${theme.deepColor}`);
  }

  const ramp = theme.neutralTint && NEUTRAL_RAMPS[theme.neutralTint];
  if (ramp) {
    ramp.forEach((value, index) => {
      declarations.push(`--color-base-${RAMP_STOPS[index]}:rgb(${value})`);
    });
  }

  const corners = theme.cornerStyle && CORNERS[theme.cornerStyle];
  if (corners) {
    declarations.push(`--style-radius-s:${corners[0]}`);
    declarations.push(`--style-radius-m:${corners[1]}`);
    declarations.push(`--style-radius-l:${corners[2]}`);
  }

  const font = theme.fontFamily && FONTS[theme.fontFamily];
  if (font) {
    declarations.push(`--font-body:${font}`);
  }

  const root =
    declarations.length > 0 ? `:root{${declarations.join(';')}}` : '';
  const custom = theme.customCss ? sanitizeCss(theme.customCss) : '';

  return `${root}${custom}`;
}

/**
 * The saved theme as a CSS string, ready to drop into a `<style>` tag.
 * Empty when there is nothing to override.
 */
export async function getThemeCss(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return '';
  }

  try {
    const payload = await getPayload({ config });
    const theme = (await payload.findGlobal({
      slug: 'theme',
      depth: 0,
    })) as ThemeDoc;

    return theme ? buildCss(theme) : '';
  } catch (error) {
    // Losing the theme must not lose the admin.
    console.error('Could not read the admin theme; using defaults.', error);
    return '';
  }
}
