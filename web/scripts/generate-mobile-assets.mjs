// Generates the native app icons and splash screens for the Android and iOS
// projects, from the same programmatic neon logo as the PWA icons.
//
//   npm run mobile:assets
//
// Two steps:
//   1. render the source images @capacitor/assets expects into resources/
//      (icon 1024x1024, icon-foreground/background for adaptive icons,
//      splash 2732x2732 light + dark) — these are committed
//   2. run @capacitor/assets, which fans them out into every density bucket of
//      android/app/src/main/res/ and ios/App/App/Assets.xcassets/
//
// Step 2 is skipped (with a note) when neither native project has been
// scaffolded yet — run `npm run android:build` or `npm run ios:build` first.

import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.join(root, '..');
const resourcesDir = path.join(webDir, 'resources');
const DARK = { r: 0x0a, g: 0x0e, b: 0x1a, alpha: 1 }; // manifest background_color
const DARK_HEX = '#0a0e1a';

// Same mark as scripts/generate-icons.mjs — a glowing slanted diamond node
// with an "N" core. Kept in sync by hand; both files render at their own size.
const LOGO_SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff2fd6"/>
      <stop offset="1" stop-color="#7b2fff"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g filter="url(#glow)">
    <rect x="116" y="116" width="280" height="280" rx="26"
          transform="rotate(45 256 256)" fill="#131a2e"
          stroke="url(#g)" stroke-width="18"/>
    <text x="256" y="318" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
          font-size="200" font-weight="900" fill="#00e5ff">N</text>
  </g>
</svg>`);

/**
 * Compose the logo, scaled to `artRatio` of the canvas, over a square canvas.
 * `opaque: false` leaves the canvas transparent (adaptive-icon foreground).
 */
async function square(size, { opaque = true, artRatio = 1 } = {}) {
  const canvas = () =>
    sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: opaque ? DARK : { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png();
  const art = Math.round(size * artRatio);
  if (art === 0) return canvas(); // flat field, no mark (adaptive-icon background)
  const layer = await sharp(LOGO_SVG)
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return canvas().composite([{ input: layer, gravity: 'centre' }]);
}

// @capacitor/assets crops the splash to the device aspect ratio from the
// centre, so the logo sits small in the middle of a large flat field.
const outputs = [
  // Store/launcher icon: full-bleed dark square, logo inset a little.
  ['icon.png', await square(1024, { artRatio: 0.78 })],
  // Android adaptive icon: the foreground gets cropped to ~66% by the
  // launcher mask, so keep the art well inside the safe zone.
  ['icon-foreground.png', await square(1024, { opaque: false, artRatio: 0.5 })],
  ['icon-background.png', await square(1024, { artRatio: 0 })],
  ['splash.png', await square(2732, { artRatio: 0.22 })],
  ['splash-dark.png', await square(2732, { artRatio: 0.22 })],
];

mkdirSync(resourcesDir, { recursive: true });
for (const [name, image] of outputs) {
  const file = path.join(resourcesDir, name);
  await image.toFile(file);
  console.log('wrote', path.relative(process.cwd(), file));
}

const platforms = ['android', 'ios'].filter((p) => existsSync(path.join(webDir, p)));
if (platforms.length === 0) {
  console.log(
    '\nNo native project found yet — skipping icon/splash generation.\n' +
      'Run `npm run android:build` or `npm run ios:build` first, then re-run `npm run mobile:assets`.',
  );
  process.exit(0);
}

console.log(`\nGenerating ${platforms.join(' + ')} icons and splash screens...`);
const result = spawnSync(
  process.execPath,
  [
    path.join(webDir, 'node_modules', '@capacitor', 'assets', 'bin', 'capacitor-assets'),
    'generate',
    ...platforms.map((p) => `--${p}`),
    '--assetPath',
    'resources',
    '--iconBackgroundColor',
    DARK_HEX,
    '--iconBackgroundColorDark',
    DARK_HEX,
    '--splashBackgroundColor',
    DARK_HEX,
    '--splashBackgroundColorDark',
    DARK_HEX,
  ],
  { cwd: webDir, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
