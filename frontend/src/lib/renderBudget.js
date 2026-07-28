export function renderPointBudget(pointCloud) {
  const sizeBytes = pointCloud.size_bytes || 0;
  const pointCount = pointCloud.point_count || 0;

  // The public MinIO route can terminate longer responses before the complete
  // object reaches the browser. Keep direct downloads for genuinely small
  // files; otherwise ask the API for a distributed sample whose LAS payload
  // stays close to 6 MB regardless of the source file size.
  const directDownloadLimit = 8 * 1024 * 1024;
  if (sizeBytes <= directDownloadLimit && pointCount <= 300_000) return null;

  const estimatedRecordBytes = pointCount > 0
    ? Math.max(20, sizeBytes / pointCount)
    : 34;
  const targetPayloadBytes = 6 * 1024 * 1024;
  const budget = Math.floor(targetPayloadBytes / estimatedRecordBytes);
  const boundedBudget = Math.max(100_000, Math.min(500_000, budget));

  return pointCount > boundedBudget ? boundedBudget : null;
}
