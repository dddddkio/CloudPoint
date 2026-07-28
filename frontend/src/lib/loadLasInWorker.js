export function loadLasInWorker(
  url,
  {
    maxPoints = 2_000_000,
    onProgress,
  } = {},
) {
  const worker = new Worker(
    new URL("../workers/lasWorker.js", import.meta.url),
    { type: "module" },
  );
  let settled = false;
  let rejectTask;

  const promise = new Promise((resolve, reject) => {
    rejectTask = reject;
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.progress);
        return;
      }
      settled = true;
      worker.terminate();
      if (data.type === "result") {
        resolve(data.cloud);
      } else {
        reject(new Error(data.message || "The point cloud could not be processed."));
      }
    };
    worker.onerror = () => {
      settled = true;
      worker.terminate();
      reject(new Error("The point-cloud processing worker stopped unexpectedly."));
    };
  });

  worker.postMessage({ url, maxPoints });

  return {
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectTask?.(new DOMException("Point-cloud loading was cancelled.", "AbortError"));
    },
  };
}
