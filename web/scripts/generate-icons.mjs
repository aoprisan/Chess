// Generates the PWA icon set from existing character art (no hand-drawn
// assets). Outputs are committed to public/ and referenced by the manifest
// in vite.config.ts and by index.html.
//
//   npm run icons
//
// - icon-{192,512}.png: art contained on a transparent square (purpose: any)
// - maskable-{192,512}.png: art at ~66% on an opaque cream square, keeping it
//   inside the maskable safe zone so launchers can crop to any shape
// - apple-touch-icon.png (180px, opaque) and favicon.png (64px)

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, '..', 'public');
const source = path.join(publicDir, 'assets', 'images', 'characters', 'gnom.png');
const CREAM = { r: 0xf5, g: 0xe6, b: 0xd3, alpha: 1 }; // manifest background_color

async function contained(size, { opaque = false, artRatio = 1 } = {}) {
  const art = Math.round(size * artRatio);
  const layer = await sharp(source)
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? CREAM : { r: 0, g: 0, b: 0, alpha: 0 },
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
