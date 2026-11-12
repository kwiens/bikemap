import { SaxesParser, type SaxesTagNS } from 'saxes';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const SVG_MIME_TYPE = 'image/svg+xml';

// Static vector artwork can use gradients, masks, filters, text, and symbols.
const artworkElements = new Set(
  `svg g defs symbol use title desc style path rect circle ellipse line polyline polygon
   text tspan textPath linearGradient radialGradient stop pattern clipPath mask marker
   filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix
   feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA
   feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset
   fePointLight feSpecularLighting feSpotLight feTile feTurbulence`.split(
    /\s+/,
  ),
);
const localReference = /^#[\w.:-]+$/u;

/** Reject external resources and active content before publishing a logo. */
export function readLogoSvg(bytes: Uint8Array): string {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parser = new SaxesParser({ xmlns: true });
  let hasRoot = false;
  let style: string | undefined;

  parser.on('doctype', rejectSvg);
  parser.on('processinginstruction', rejectSvg);
  parser.on('opentag', (tag) => {
    if (!hasRoot) {
      if (tag.local !== 'svg' || !hasArtworkDimensions(tag)) rejectSvg();
      hasRoot = true;
    }
    if (tag.uri !== SVG_NAMESPACE || !artworkElements.has(tag.local)) {
      rejectSvg();
    }
    for (const { local, uri, value } of Object.values(tag.attributes)) {
      if (
        /^on/i.test(local) ||
        (uri === 'http://www.w3.org/XML/1998/namespace' && local === 'base') ||
        (local === 'href' && !localReference.test(value.trim()))
      ) {
        rejectSvg();
      }
      if (local === 'style' || /url\s*\(/i.test(value)) checkStyle(value);
    }
    if (tag.local === 'style') style = '';
  });
  function collectStyle(text: string) {
    if (style !== undefined) style += text;
  }
  parser.on('text', collectStyle);
  parser.on('cdata', collectStyle);
  parser.on('closetag', (tag) => {
    if (tag.local === 'style' && style !== undefined) {
      checkStyle(style);
      style = undefined;
    }
  });
  parser.write(source).close();
  return source;
}

function hasArtworkDimensions(tag: SaxesTagNS): boolean {
  const box = tag.attributes.viewBox?.value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box) {
    return (
      box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
    );
  }
  return ['width', 'height'].every((name) => {
    const length = tag.attributes[name]?.value
      .trim()
      .match(/^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/u);
    return (
      length && Number(length[1]) > 0 && Number.isFinite(Number(length[1]))
    );
  });
}

function checkStyle(value: string) {
  const css = value.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/[@\\]|\b(?:image|image-set|src)\s*\(/iu.test(css)) rejectSvg();
  for (const [, target] of css.matchAll(/url\s*\(([^)]*)\)/gi)) {
    const reference = target.trim().replace(/^(['"])(.*)\1$/u, '$2');
    if (!localReference.test(reference)) rejectSvg();
  }
}

function rejectSvg(): never {
  throw new Error(
    'Use a static, self-contained SVG with a viewBox or pixel dimensions.',
  );
}
