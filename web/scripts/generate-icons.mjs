// Generates the PWA icon set from a programmatic neon logo (no hand-drawn
// assets). Outputs are committed to public/ and referenced by the manifest
// in vite.config.ts and by index.html.
//
//   npm run icons
//
// - icon-{192,512}.png: logo contained on a transparent square (purpose: any)
// - maskable-{192,512}.png: logo at ~66% on an opaque dark square, keeping it
//   inside the maskable safe zone so launchers can crop to any shape
// - apple-touch-icon.png (180px, opaque) and favicon.png (64px)

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, '..', 'public');
const DARK = { r: 0x0a, g: 0x0e, b: 0x1a, alpha: 1 }; // manifest background_color

// Neon City mark: a glowing slanted diamond node with an "N" core, echoing
// the campaign map's system nodes. Magenta-to-purple badge with a cyan core,
// matching the menu-logo concept art.
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

async function contained(size, { opaque = false, artRatio = 1 } = {}) {
  const art = Math.round(size * artRatio);
  const layer = await sharp(LOGO_SVG)
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? DARK : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: layer, gravity: 'centre' }])
    .png();
}

const outputs = [
  ['icon-512.png', await contained(512)],
  ['icon-192.png', await contained(192)],
  ['maskable-512.png', await contained(512, { opaque: true, artRatio: 0.66 })],
  ['maskable-192.png', await contained(192, { opaque: true, artRatio: 0.66 })],
  ['apple-touch-icon.png', await contained(180, { opaque: true, artRatio: 0.8 })],
  ['favicon.png', await contained(64)],
];

for (const [name, image] of outputs) {
  const file = path.join(publicDir, name);
  await image.toFile(file);
  console.log('wrote', path.relative(process.cwd(), file));
}
