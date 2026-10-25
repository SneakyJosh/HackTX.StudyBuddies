import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const ORANGE = [255, 138, 31, 255];
const CREAM = [255, 235, 191, 255];
const PAGE = [242, 249, 255, 255];
const BROWN = [61, 42, 26, 255];
const EYE = [246, 241, 232, 255];
const INK = [26, 18, 12, 255];
const BEAK = [231, 160, 122, 255];

function image(size) {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = PAGE[0];
    data[i * 4 + 1] = PAGE[1];
    data[i * 4 + 2] = PAGE[2];
    data[i * 4 + 3] = 255;
  }
  return { size, data };
}

function blend(img, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= img.size || py >= img.size) return;
  const i = (py * img.size + px) * 4;
  const alpha = color[3] / 255;
  img.data[i] = Math.round(color[0] * alpha + img.data[i] * (1 - alpha));
  img.data[i + 1] = Math.round(color[1] * alpha + img.data[i + 1] * (1 - alpha));
  img.data[i + 2] = Math.round(color[2] * alpha + img.data[i + 2] * (1 - alpha));
  img.data[i + 3] = 255;
}

function fillEllipse(img, cx, cy, rx, ry, color) {
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) blend(img, x, y, color);
    }
  }
}

function fillCircle(img, cx, cy, radius, color) {
  fillEllipse(img, cx, cy, radius, radius, color);
}

function fillRadial(img, cx, cy, radius) {
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      if (distance > 1) continue;
      const t = Math.min(1, distance / 0.72);
      blend(img, x, y, [
        Math.round(CREAM[0] + (ORANGE[0] - CREAM[0]) * t),
        Math.round(CREAM[1] + (ORANGE[1] - CREAM[1]) * t),
        Math.round(CREAM[2] + (ORANGE[2] - CREAM[2]) * t),
        255,
      ]);
    }
  }
}

function fillTriangle(img, ax, ay, bx, by, cx, cy, color) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) blend(img, x, y, color);
    }
  }
}

function drawOwl(size) {
  const img = image(size);
  const center = size / 2;
  const orbRadius = size * 0.42;
  fillRadial(img, center, center, orbRadius);
  const inner = orbRadius * 2 * 0.7;
  const origin = (size - inner) / 2;
  const point = (x, y) => [origin + (x / 64) * inner, origin + (y / 64) * inner];
  const unit = inner / 64;
  fillEllipse(img, ...point(32, 36), 20 * unit, 17 * unit, BROWN);
  fillEllipse(img, ...point(20, 20), 3.4 * unit, 7 * unit, BROWN);
  fillEllipse(img, ...point(44, 20), 3.4 * unit, 7 * unit, BROWN);
  fillEllipse(img, ...point(23, 33), 8 * unit, 7.5 * unit, EYE);
  fillEllipse(img, ...point(41, 33), 8 * unit, 7.5 * unit, EYE);
  fillCircle(img, ...point(23, 33), 3.1 * unit, INK);
  fillCircle(img, ...point(41, 33), 3.1 * unit, INK);
  const [lx, ly] = point(29.2, 39.5);
  const [bx, by] = point(32, 43.2);
  const [rx, ry] = point(34.8, 39.5);
  fillTriangle(img, lx, ly, bx, by, rx, ry, BEAK);
  return img;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length - 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function png(img) {
  const raw = Buffer.alloc((img.size * 4 + 1) * img.size);
  for (let y = 0; y < img.size; y += 1) {
    const row = y * (img.size * 4 + 1);
    raw[row] = 0;
    img.data.copy(raw, row + 1, y * img.size * 4, (y + 1) * img.size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.size, 0);
  header.writeUInt32BE(img.size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(drawOwl(192)));
writeFileSync("public/icons/icon-512.png", png(drawOwl(512)));
writeFileSync("public/icons/apple-touch-icon.png", png(drawOwl(180)));
console.log("wrote 192, 512, and 180 icons");
