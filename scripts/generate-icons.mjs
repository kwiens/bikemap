import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const publicDir = join(projectRoot, 'public');
const assetsDir = join(publicDir, 'assets');

// Ensure assets directory exists
mkdirSync(assetsDir, { recursive: true });

async function generateIcon(
  svgPath,
  outputPath,
  size,
  options = {}
) {
  try {
    const svgBuffer = readFileSync(svgPath);
    const pngBuffer = await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: options.background || { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    writeFileSync(outputPath, pngBuffer);
    console.log(`✓ Generated ${outputPath} (${size}x${size})`);
  } catch (error) {
    console.error(`✗ Failed to generate ${outputPath}:`, error.message);
    throw error;
  }
}

async function main() {
  const whiteLogo = join(publicDir, 'Bike-Chatt_Logo-white.svg');
  const primaryLogo = join(publicDir, 'Bike-Chatt_Logo-primary-blue-green.svg');

  console.log('Generating icons from SVG logos...\n');

  // Generate favicon (32x32) from white logo
  await generateIcon(
    whiteLogo,
    join(assetsDir, 'favicon.png'),
    32,
    { background: { r: 255, g: 255, b: 255, alpha: 1 } }
  );

  // Generate icon-192 (192x192) from primary logo
  await generateIcon(
    primaryLogo,
    join(assetsDir, 'icon-192.png'),
    192
  );

  // Generate icon-512 (512x512) from primary logo
  await generateIcon(
    primaryLogo,
    join(assetsDir, 'icon-512.png'),
    512
  );

  // Generate apple-touch-icon (180x180) from primary logo
  await generateIcon(
    primaryLogo,
    join(assetsDir, 'apple-touch-icon.png'),
    180
  );

  // Also copy to public root for app references
  const filesToCopy = [
    { from: 'favicon.png', to: 'favicon.png' },
    { from: 'icon-192.png', to: 'icon-192.png' },
    { from: 'icon-512.png', to: 'icon-512.png' },
    { from: 'apple-touch-icon.png', to: 'apple-touch-icon.png' },
  ];

  console.log('\nCopying icons to public root...');
  for (const { from, to } of filesToCopy) {
    const source = readFileSync(join(assetsDir, from));
    writeFileSync(join(publicDir, to), source);
    console.log(`✓ Copied ${to} to public root`);
  }

  console.log('\n✓ All icons generated successfully!');
}

main().catch((error) => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
