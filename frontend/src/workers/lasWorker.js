import { parseLas } from "../lib/lasLoader.js";

function report(phase, percent = null, receivedBytes = 0, totalBytes = 0) {
  self.postMessage({
    type: "progress",
    progress: { phase, percent, receivedBytes, totalBytes },
  });
}

async function readResponse(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  const totalBytes = Number.isSafeInteger(declaredLength) && declaredLength > 0
    ? declaredLength
    : 0;

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (totalBytes && buffer.byteLength !== totalBytes) {
      throw new Error(
        `Download was incomplete (${buffer.byteLength.toLocaleString()} `
        + `of ${totalBytes.toLocaleString()} bytes received).`,
      );
    }
    report("downloading", 100, buffer.byteLength, totalBytes || buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  let receivedBytes = 0;
  let lastReportedPercent = -1;
  let target;
  const chunks = [];

  try {
    if (totalBytes) {
      try {
        target = new Uint8Array(totalBytes);
      } catch {
        throw new Error(
          `The ${Math.round(totalBytes / (1024 * 1024)).toLocaleString()} MB file `
          + "is too large for the available browser memory.",
        );
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      if (target) {
        if (receivedBytes + value.byteLength > target.byteLength) {
          throw new Error("The download exceeded its declared content length.");
        }
        target.set(value, receivedBytes);
      } else {
        chunks.push(value);
      }
      receivedBytes += value.byteLength;

      const percent = totalBytes
        ? Math.min(99, Math.floor((receivedBytes / totalBytes) * 100))
        : null;
      if (percent === null || percent >= lastReportedPercent + 2) {
        lastReportedPercent = percent ?? lastReportedPercent;
        report("downloading", percent, receivedBytes, totalBytes);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes && receivedBytes !== totalBytes) {
    throw new Error(
      `Download was incomplete (${receivedBytes.toLocaleString()} `
      + `of ${totalBytes.toLocaleString()} bytes received).`,
    );
  }

  if (!target) {
    try {
      target = new Uint8Array(receivedBytes);
    } catch {
      throw new Error(
        `The ${Math.round(receivedBytes / (1024 * 1024)).toLocaleString()} MB file `
        + "is too large for the available browser memory.",
      );
    }
    let offset = 0;
    for (const chunk of chunks) {
      target.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  report("downloading", 100, receivedBytes, totalBytes || receivedBytes);
  return target.buffer;
}

self.onmessage = async ({ data }) => {
  try {
    report("connecting");
    const response = await fetch(data.url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = await readResponse(response);
    report("processing", null, buffer.byteLength, buffer.byteLength);
    const cloud = parseLas(buffer, { maxPoints: data.maxPoints });
    report("preparing", 100, buffer.byteLength, buffer.byteLength);

    const transfer = [cloud.positions.buffer];
    if (cloud.colors) transfer.push(cloud.colors.buffer);
    self.postMessage({ type: "result", cloud }, transfer);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error
        ? error.message
        : "The point cloud could not be processed.",
    });
  }
};
