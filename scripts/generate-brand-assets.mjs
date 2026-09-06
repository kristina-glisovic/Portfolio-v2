// Optional asset-authoring tool: requires sharp, not part of the static site build.
// Geometry is extracted verbatim from the artwork referenced by the approved header.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(import.meta.url)('sharp');
const root = new URL('../', import.meta.url);
const template = await readFile(new URL('src/template.html', root), 'utf8');
const d = template.match(/<path id="guarantee-signature-artwork" d="([^"]+)"/)?.[1];
const transform = template.match(/<use class="nav-signature-path"[^>]*transform="([^"]+)"/)?.[1];
if (!d || transform !== 'translate(128,10)') throw new Error('Review header source geometry before generating assets.');
const artwork = `<path d="${d}" transform="${transform}" fill="#f8fafc"/>`;
const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 199 163"><title>Exact approved header signature</title>${artwork}</svg>\n`;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 224 224">
  <title>Kristina Glišović signature</title>
  <defs><linearGradient id="edge" x2="1" y2="1"><stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
  <rect width="224" height="224" rx="48" fill="#07070f"/>
  <rect x="5" y="5" width="214" height="214" rx="44" fill="none" stroke="url(#edge)" stroke-width="3" opacity=".65"/>
  <g transform="translate(12.5,30.5)">${artwork}</g>
</svg>\n`;
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <title>Kristina Glišović - signature brand preview</title>
  <defs>
    <radialGradient id="violet"><stop stop-color="#8b5cf6" stop-opacity=".12"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
    <radialGradient id="cyan"><stop stop-color="#22d3ee" stop-opacity=".07"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
    <linearGradient id="rule"><stop stop-color="#8b5cf6" stop-opacity="0"/><stop offset=".4" stop-color="#8b5cf6"/><stop offset=".6" stop-color="#22d3ee"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#070911"/>
  <ellipse cx="490" cy="245" rx="390" ry="290" fill="url(#violet)"/>
  <ellipse cx="770" cy="335" rx="340" ry="260" fill="url(#cyan)"/>
  <g transform="translate(430.85,82) scale(1.7)">${artwork}</g>
  <path d="M480 420 H720" stroke="url(#rule)" opacity=".5"/>
  <text x="600" y="473" text-anchor="middle" fill="#f8fafc" font-family="Arial, sans-serif" font-size="32" letter-spacing=".4">Kristina Glišović</text>
  <text x="600" y="511" text-anchor="middle" fill="#a6afc1" font-family="Arial, sans-serif" font-size="18" letter-spacing=".6">Web Developer · Shopify Specialist</text>
</svg>\n`;
await writeFile(new URL('assets/brand/signature-symbol-source.svg', root), source);
await writeFile(new URL('assets/favicon.svg', root), favicon);
await writeFile(new URL('assets/social-share-signature-source.svg', root), social);
for (const [size, file] of [[16, 'favicon-16.png'], [32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(Buffer.from(favicon)).resize(size, size).png().toFile(fileURLToPath(new URL(`assets/${file}`, root)));
}
await sharp(Buffer.from(social)).png().toFile(fileURLToPath(new URL('assets/social-share-signature.png', root)));
// Standard ICO directory containing the same 16px/32px PNG images.
const images = await Promise.all([16, 32].map(size => readFile(new URL(`assets/favicon-${size}.png`, root))));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16, size = [16, 32][i];
  header[entry] = size; header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL('favicon.ico', root), Buffer.concat([header, ...images]));
console.log('Generated favicon and social assets from the exact header path.');
