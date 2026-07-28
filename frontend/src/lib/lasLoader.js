/**
 * Minimal browser-side LAS reader.
 *
 * Parses the LAS public header and point records into flat Float32Array
 * positions (recentred to the origin) and, when present, a Uint8-normalised
 * colour array for RGB rendering. Supports point formats 0–3, 5, 6–8, 10
 * (i.e. all the common XYZ / XYZ+RGB layouts). Uncompressed .las only —
 * .laz is out of scope.
 *
 * For large clouds we subsample uniformly to `maxPoints` so the browser stays
 * responsive; the caller is told how many points were actually loaded.
 */

// RGB byte offset within a point record, keyed by point data record format.
// (null = format carries no colour.)
const RGB_OFFSET = {
  0: null, 1: null, 2: 20, 3: 28, 5: 28,
  6: null, 7: 30, 8: 30, 10: 30,
};

const MIN_HEADER_BYTES = 227;
const LAS_14_HEADER_BYTES = 255;
const MIN_POINT_LENGTH = {
  0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63,
  6: 30, 7: 36, 8: 38, 9: 59, 10: 67,
};

function invalidLas(message) {
  return new Error(`Invalid or incomplete LAS file: ${message}`);
}

export function parseLas(arrayBuffer, { maxPoints = 2_000_000 } = {}) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < MIN_HEADER_BYTES) {
    throw invalidLas(
      `only ${arrayBuffer?.byteLength ?? 0} bytes were downloaded; `
      + `at least ${MIN_HEADER_BYTES} bytes are required for the header.`,
    );
  }
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) {
    throw new Error("maxPoints must be a positive safe integer.");
  }

  const dv = new DataView(arrayBuffer);

  if (dv.getUint32(0, false) !== 0x4c415346 /* "LASF" */) {
    throw invalidLas('missing the "LASF" signature.');
  }

  const versionMajor = dv.getUint8(24);
  const versionMinor = dv.getUint8(25);
  if (versionMajor !== 1 || versionMinor > 4) {
    throw invalidLas(`unsupported LAS version ${versionMajor}.${versionMinor}.`);
  }
  if (versionMinor >= 4 && arrayBuffer.byteLength < LAS_14_HEADER_BYTES) {
    throw invalidLas("the LAS 1.4 header is truncated.");
  }

  const headerSize = dv.getUint16(94, true);
  const pointDataOffset = dv.getUint32(96, true);
  const pointFormatRaw = dv.getUint8(104);
  const pointFormat = pointFormatRaw & 0x3f;
  const pointLength = dv.getUint16(105, true);
  const minimumPointLength = MIN_POINT_LENGTH[pointFormat];

  if (pointFormatRaw !== pointFormat) {
    throw invalidLas("compressed LAZ point data is not supported.");
  }
  if (minimumPointLength === undefined) {
    throw invalidLas(`point format ${pointFormat} is not supported.`);
  }
  if (pointLength < minimumPointLength) {
    throw invalidLas(
      `point record length ${pointLength} is too small for format ${pointFormat}.`,
    );
  }
  if (
    headerSize < MIN_HEADER_BYTES
    || pointDataOffset < headerSize
    || pointDataOffset > arrayBuffer.byteLength
  ) {
    throw invalidLas("the point data offset is outside the downloaded file.");
  }

  let pointCount = dv.getUint32(107, true); // legacy count
  if (versionMinor >= 4) {
    const count14 = dv.getBigUint64(247, true);
    if (count14 > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw invalidLas("the declared point count is too large for this browser.");
    }
    if (count14 > 0n) pointCount = Number(count14);
  }
  if (!Number.isSafeInteger(pointCount) || pointCount <= 0) {
    throw invalidLas("the file reports no readable points.");
  }

  const scaleX = dv.getFloat64(131, true);
  const scaleY = dv.getFloat64(139, true);
  const scaleZ = dv.getFloat64(147, true);
  const offX = dv.getFloat64(155, true);
  const offY = dv.getFloat64(163, true);
  const offZ = dv.getFloat64(171, true);

  const minX = dv.getFloat64(187, true);
  const minY = dv.getFloat64(203, true);
  const minZ = dv.getFloat64(219, true);
  const maxX = dv.getFloat64(179, true);
  const maxY = dv.getFloat64(195, true);
  const maxZ = dv.getFloat64(211, true);
  const numericHeaderValues = [
    scaleX, scaleY, scaleZ, offX, offY, offZ,
    minX, minY, minZ, maxX, maxY, maxZ,
  ];
  if (!numericHeaderValues.every(Number.isFinite)) {
    throw invalidLas("the coordinate metadata contains a non-finite value.");
  }
  if (minX > maxX || minY > maxY || minZ > maxZ) {
    throw invalidLas("the coordinate bounds are inverted.");
  }

  // A few real-world files (and interrupted object downloads) report more
  // points than the downloaded bytes actually contain. Never let the raw
  // DataView exception escape: render the complete records that are present
  // and surface the discrepancy to the viewer.
  const availablePointCount = Math.floor(
    (arrayBuffer.byteLength - pointDataOffset) / pointLength,
  );
  const readablePointCount = Math.min(pointCount, availablePointCount);
  if (readablePointCount <= 0) {
    throw invalidLas("no complete point records were downloaded.");
  }
  const truncated = availablePointCount < pointCount;

  // Recentre on the bbox midpoint so coordinates near a large CRS origin
  // don't blow out float32 precision in the GPU.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const rgbOffset = RGB_OFFSET[pointFormat] ?? null;
  const stride = Math.max(1, Math.ceil(readablePointCount / maxPoints));
  const loaded = Math.ceil(readablePointCount / stride);

  const positions = new Float32Array(loaded * 3);
  const colors = rgbOffset !== null ? new Float32Array(loaded * 3) : null;

  // Detect 8- vs 16-bit colour by peeking at the first coloured point.
  let colorDivisor = 65535;
  if (rgbOffset !== null) {
    const r = dv.getUint16(pointDataOffset + rgbOffset, true);
    const g = dv.getUint16(pointDataOffset + rgbOffset + 2, true);
    const b = dv.getUint16(pointDataOffset + rgbOffset + 4, true);
    if (r <= 255 && g <= 255 && b <= 255) colorDivisor = 255;
  }

  let w = 0;
  for (let i = 0; i < readablePointCount; i += stride) {
    const base = pointDataOffset + i * pointLength;
    const px = dv.getInt32(base, true) * scaleX + offX;
    const py = dv.getInt32(base + 4, true) * scaleY + offY;
    const pz = dv.getInt32(base + 8, true) * scaleZ + offZ;
    positions[w * 3] = px - cx;
    positions[w * 3 + 1] = py - cy;
    positions[w * 3 + 2] = pz - cz;

    if (colors) {
      const c = base + rgbOffset;
      colors[w * 3] = dv.getUint16(c, true) / colorDivisor;
      colors[w * 3 + 1] = dv.getUint16(c + 2, true) / colorDivisor;
      colors[w * 3 + 2] = dv.getUint16(c + 4, true) / colorDivisor;
    }
    w++;
  }

  return {
    positions: w === loaded ? positions : positions.subarray(0, w * 3),
    colors: colors ? (w === loaded ? colors : colors.subarray(0, w * 3)) : null,
    pointFormat,
    totalPoints: pointCount,
    availablePoints: readablePointCount,
    loadedPoints: w,
    subsampled: stride > 1,
    truncated,
    bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}
