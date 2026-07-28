import assert from "node:assert/strict";
import test from "node:test";

import { parseLas } from "./lasLoader.js";

function buildLas({
  declaredPoints = 2,
  actualPoints = declaredPoints,
  pointFormat = 3,
  pointLength = 34,
} = {}) {
  const headerSize = 227;
  const buffer = new ArrayBuffer(headerSize + actualPoints * pointLength);
  const view = new DataView(buffer);

  view.setUint32(0, 0x4c415346, false);
  view.setUint8(24, 1);
  view.setUint8(25, 2);
  view.setUint16(94, headerSize, true);
  view.setUint32(96, headerSize, true);
  view.setUint8(104, pointFormat);
  view.setUint16(105, pointLength, true);
  view.setUint32(107, declaredPoints, true);
  view.setFloat64(131, 0.01, true);
  view.setFloat64(139, 0.01, true);
  view.setFloat64(147, 0.01, true);
  view.setFloat64(179, 10, true);
  view.setFloat64(187, 0, true);
  view.setFloat64(195, 10, true);
  view.setFloat64(203, 0, true);
  view.setFloat64(211, 10, true);
  view.setFloat64(219, 0, true);

  for (let index = 0; index < actualPoints; index += 1) {
    const base = headerSize + index * pointLength;
    view.setInt32(base, index * 100, true);
    view.setInt32(base + 4, index * 200, true);
    view.setInt32(base + 8, index * 300, true);
    view.setUint16(base + 28, 65535, true);
    view.setUint16(base + 30, 32768, true);
    view.setUint16(base + 32, 0, true);
  }
  return buffer;
}

test("parses complete LAS point records", () => {
  const result = parseLas(buildLas());

  assert.equal(result.totalPoints, 2);
  assert.equal(result.availablePoints, 2);
  assert.equal(result.loadedPoints, 2);
  assert.equal(result.truncated, false);
});

test("safely loads available records when a large declared count exceeds the file", () => {
  const result = parseLas(buildLas({
    declaredPoints: 100_000_000,
    actualPoints: 3,
  }));

  assert.equal(result.totalPoints, 100_000_000);
  assert.equal(result.availablePoints, 3);
  assert.equal(result.loadedPoints, 3);
  assert.equal(result.truncated, true);
});

test("returns a useful error for an incomplete download instead of a DataView RangeError", () => {
  assert.throws(
    () => parseLas(new ArrayBuffer(12)),
    /only 12 bytes were downloaded/,
  );
});

test("rejects a point-data offset outside the downloaded file", () => {
  const buffer = buildLas();
  new DataView(buffer).setUint32(96, buffer.byteLength + 1, true);

  assert.throws(
    () => parseLas(buffer),
    /point data offset is outside/,
  );
});
