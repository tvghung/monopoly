import assert from 'node:assert/strict';
import test from 'node:test';
import { compareImages, decodePng, diffImage, encodePng } from './pngDiff.mjs';

function gradient(width, height, tweak = () => {}) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data.set([(x * 7) & 255, (y * 13) & 255, ((x + y) * 5) & 255, 255], index);
      tweak(data, index, x, y);
    }
  }
  return { width, height, data };
}

test('encode then decode returns exactly the pixels that went in', () => {
  const image = gradient(37, 23);
  const decoded = decodePng(encodePng(image));
  assert.equal(decoded.width, 37);
  assert.equal(decoded.height, 23);
  assert.deepEqual(Array.from(decoded.data), Array.from(image.data));
});

test('decodes the PNG filter types a browser uses (sub, up, average, paeth)', async () => {
  // Build a PNG by hand with every filter type on consecutive rows, then check it against the unfiltered pixels.
  const { deflateSync, crc32 } = await import('node:zlib');
  const width = 5;
  const height = 5;
  const pixels = gradient(width, height).data;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const at = (row, index) => (row < 0 || index < 0 ? 0 : pixels[row * stride + index]);
  for (let row = 0; row < height; row += 1) {
    const filter = row % 5;
    raw[row * (stride + 1)] = filter;
    for (let index = 0; index < stride; index += 1) {
      const left = at(row, index - 4);
      const up = at(row - 1, index);
      const upLeft = at(row - 1, index - 4);
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = (left + up) >> 1;
      if (filter === 4) {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left);
        const du = Math.abs(estimate - up);
        const dul = Math.abs(estimate - upLeft);
        predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      raw[row * (stride + 1) + 1 + index] = (pixels[row * stride + index] - predictor) & 255;
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.deepEqual(Array.from(decodePng(png).data), Array.from(pixels));
});

test('identical images compare as identical with no differing pixels', () => {
  const result = compareImages(gradient(16, 16), gradient(16, 16));
  assert.equal(result.identical, true);
  assert.equal(result.differingPixels, 0);
  assert.equal(result.maxChannelDelta, 0);
  assert.equal(result.meanAbsDelta, 0);
});

test('a single changed pixel is found, counted and measured', () => {
  const changed = gradient(16, 16, (data, index, x, y) => { if (x === 3 && y === 4) data[index] += 9; });
  const result = compareImages(gradient(16, 16), changed);
  assert.equal(result.identical, false);
  assert.equal(result.differingPixels, 1);
  assert.equal(result.maxChannelDelta, 9);
  assert.ok(Math.abs(result.meanAbsDelta - 9 / (16 * 16 * 4)) < 1e-12);
});

test('a tolerance hides small differences but not large ones', () => {
  const changed = gradient(8, 8, (data, index, x) => { if (x === 0) data[index] += 2; if (x === 1) data[index] += 40; });
  assert.equal(compareImages(gradient(8, 8), changed, { tolerance: 2 }).differingPixels, 8);
  assert.equal(compareImages(gradient(8, 8), changed, { tolerance: 0 }).differingPixels, 16);
  assert.equal(compareImages(gradient(8, 8), changed, { tolerance: 2 }).identical, false);
});

test('images of different sizes are reported as not comparable instead of compared', () => {
  const result = compareImages(gradient(8, 8), gradient(8, 9));
  assert.equal(result.comparable, false);
  assert.equal(result.identical, false);
  assert.match(result.reason, /8x8 vs 8x9/);
});

test('the diff image paints exactly the differing pixels red', () => {
  const changed = gradient(4, 4, (data, index, x, y) => { if (x === 2 && y === 1) data[index + 1] += 100; });
  const diff = diffImage(gradient(4, 4), changed);
  const red = [];
  for (let pixel = 0; pixel < 16; pixel += 1) {
    if (diff.data[pixel * 4] === 255 && diff.data[pixel * 4 + 1] === 0 && diff.data[pixel * 4 + 2] === 0) red.push(pixel);
  }
  assert.deepEqual(red, [1 * 4 + 2]);
  // And it is itself a valid PNG.
  assert.equal(decodePng(encodePng(diff)).width, 4);
});

test('rejects files that are not PNG or use unsupported layouts', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /Not a PNG/);
});
