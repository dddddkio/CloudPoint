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

export function parseLas(arrayBuffer, { maxPoints = 2_000_000 } = {}) {
  const dv = new DataView(arrayBuffer);

  if (dv.getUint32(0, false) !== 0x4c415346 /* "LASF" */) {
    throw new Error("Not a LAS file (missing LASF signature).");
  }

  const versionMinor = dv.getUint8(25);
  const pointDataOffset = dv.getUint32(96, true);
  const pointFormat = dv.getUint8(104) & 0x3f;
  const pointLength = dv.getUint16(105, true);

  let pointCount = dv.getUint32(107, true); // legacy count
  if (versionMinor >= 4) {
    const count14 = Number(dv.getBigUint64(247, true));
    if (count14 > 0) pointCount = count14;
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

  // Recentre on the bbox midpoint so coordinates near a large CRS origin
  // don't blow out float32 precision in the GPU.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  const rgbOffset = RGB_OFFSET[pointFormat] ?? null;
  const stride = Math.max(1, Math.ceil(pointCount / maxPoints));
  const loaded = Math.ceil(pointCount / stride);

  const positions = new Float32Array(loaded * 3);
  const colors = rgbOffset !== null ? new Float32Array(loaded * 3) : null;

  // Detect 8- vs 16-bit colour by peeking at the first coloured point.
  let colorDivisor = 65535;
  if (rgbOffset !== null && pointCount > 0) {
    const r = dv.getUint16(pointDataOffset + rgbOffset, true);
    const g = dv.getUint16(pointDataOffset + rgbOffset + 2, true);
    const b = dv.getUint16(pointDataOffset + rgbOffset + 4, true);
    if (r <= 255 && g <= 255 && b <= 255) colorDivisor = 255;
  }

  let w = 0;
  for (let i = 0; i < pointCount; i += stride) {
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
    loadedPoints: w,
    subsampled: stride > 1,
    bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}
