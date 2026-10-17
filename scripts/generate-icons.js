// Dependency-free renderer for the app's geometric vector-style monogram.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(output, { recursive: true });
function crc32(buffer) {
  let c = 0xffffffff;
  for (const b of buffer) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function render(size, filename) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const ring = ((nx - .43) ** 2 + (ny - .54) ** 2 < .17 ** 2) && ((nx - .43) ** 2 + (ny - .54) ** 2 > .085 ** 2);
    const stem = nx > .515 && nx < .6 && ny > .37 && ny < .71;
    const arrow = nx > .59 && nx < .76 && ny > .24 && ny < .295 || nx > .705 && nx < .76 && ny > .24 && ny < .41 || nx > .59 && nx < .75 && ny > .25 && ny < .43 && Math.abs(nx + ny - 1.01) < .035;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const white = ring || stem || arrow;
    raw[i] = white ? 255 : 20; raw[i + 1] = white ? 255 : 125; raw[i + 2] = white ? 255 : 100; raw[i + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(`${output}/${filename}`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
render(192, 'icon-192.png'); render(512, 'icon-512.png'); render(512, 'maskable-512.png'); render(180, 'apple-touch-icon.png');
console.log('Generated four PWA icons.');
