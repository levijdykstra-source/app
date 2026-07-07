// Generates placeholder app + tray icons (PNG/ICO/ICNS) with zero npm
// dependencies, using Node's built-in zlib for PNG deflate and hand-rolled
// ICO/ICNS containers. Replace assets/icons/icon.png with real branded art
// before shipping; re-run this script to regenerate the derived .ico/.icns.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // no filter
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Draws a filled circle with `color` [r,g,b,a] on a transparent square canvas. */
function circleRgba(size, color, marginRatio = 0.08) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - size * marginRatio;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;
      if (dist <= r) {
        rgba[idx] = color[0];
        rgba[idx + 1] = color[1];
        rgba[idx + 2] = color[2];
        rgba[idx + 3] = color[3];
      }
    }
  }
  return rgba;
}

/** App icon: rounded-square gradient background with a centered mic-style pill+circle. */
function appIconRgba(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const radius = size * 0.22;
  const top = [109, 141, 255]; // accent blue
  const bottom = [70, 90, 210];

  const inRoundedRect = (x, y) => {
    const w = size;
    const h = size;
    const cx = Math.min(Math.max(x, radius), w - radius);
    const cy = Math.min(Math.max(y, radius), h - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius || (x >= radius && x <= w - radius) || (y >= radius && y <= h - radius);
  };

  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (inRoundedRect(x + 0.5, y + 0.5)) {
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  }

  // Mic head (circle) + body (rounded rect) + base, in white.
  const cx = size / 2;
  const micTop = size * 0.28;
  const micRadius = size * 0.16;
  const white = [255, 255, 255, 235];

  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (Math.floor(y) * size + Math.floor(x)) * 4;
    rgba[idx] = color[0];
    rgba[idx + 1] = color[1];
    rgba[idx + 2] = color[2];
    rgba[idx + 3] = color[3];
  };

  // mic capsule: a vertical rounded rect from micTop to micTop + micRadius*2.4
  const capsuleHalfWidth = micRadius * 0.62;
  const capsuleTop = micTop;
  const capsuleBottom = micTop + micRadius * 2.4;
  for (let y = capsuleTop; y < capsuleBottom; y++) {
    for (let x = cx - capsuleHalfWidth; x < cx + capsuleHalfWidth; x++) {
      setPixel(x, y, white);
    }
  }
  // rounded caps
  for (let a = 0; a <= Math.PI; a += 0.02) {
    for (let rr = 0; rr < capsuleHalfWidth; rr += 0.5) {
      setPixel(cx + Math.cos(a) * rr, capsuleTop + Math.sin(a) * -1 * rr, white);
      setPixel(cx + Math.cos(a) * rr, capsuleBottom + Math.sin(a) * rr, white);
    }
  }

  // stand: arc below capsule + vertical line + base
  const standRadius = micRadius * 1.15;
  const standCenterY = capsuleBottom - micRadius * 0.3;
  for (let a = 0.15; a <= Math.PI - 0.15; a += 0.01) {
    const x = cx - Math.cos(a) * standRadius;
    const y = standCenterY + Math.sin(a) * standRadius;
    setPixel(x, y, white);
    setPixel(x + 1, y, white);
  }
  const lineBottom = standCenterY + standRadius + size * 0.08;
  for (let y = standCenterY + standRadius; y < lineBottom; y++) {
    setPixel(cx, y, white);
    setPixel(cx + 1, y, white);
  }
  const baseWidth = micRadius * 1.1;
  for (let x = cx - baseWidth; x < cx + baseWidth; x++) {
    setPixel(x, lineBottom, white);
    setPixel(x, lineBottom + 1, white);
  }

  return rgba;
}

function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12); // offset

  return Buffer.concat([header, entry, pngBuffer]);
}

function icnsChunk(type, pngBuffer) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(pngBuffer.length + 8, 4);
  return Buffer.concat([header, pngBuffer]);
}

function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => icnsChunk(type, png));
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Tray icons (small, transparent background, template-friendly on macOS).
const trayIdle = encodePng(32, 32, circleRgba(32, [230, 230, 230, 255]));
const trayRecording = encodePng(32, 32, circleRgba(32, [235, 70, 70, 255]));
const trayError = encodePng(32, 32, circleRgba(32, [235, 170, 40, 255]));
fs.writeFileSync(path.join(outDir, 'tray-idle.png'), trayIdle);
fs.writeFileSync(path.join(outDir, 'tray-recording.png'), trayRecording);
fs.writeFileSync(path.join(outDir, 'tray-error.png'), trayError);

// App icon at a few sizes for ICO/ICNS containers, plus a top-level PNG.
const png512 = encodePng(512, 512, appIconRgba(512));
const png256 = encodePng(256, 256, appIconRgba(256));
const png128 = encodePng(128, 128, appIconRgba(128));
fs.writeFileSync(path.join(outDir, 'icon.png'), png512);

fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(png256, 256));
fs.writeFileSync(
  path.join(outDir, 'icon.icns'),
  buildIcns([
    { type: 'ic07', png: png128 },
    { type: 'ic08', png: png256 },
    { type: 'ic09', png: png512 }
  ])
);

console.log('Generated tray + app icons in assets/icons');
