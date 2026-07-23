const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health/live`, { credentials: "include" });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function listPointClouds() {
  const res = await fetch(`${API_BASE}/api/point-clouds`, { credentials: "include" });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function getSession() {
  const res = await fetch(`${API_BASE}/api/session`, { credentials: "include" });
  if (!res.ok) throw new Error(`Session failed: ${res.status}`);
  return res.json();
}

export function uploadPointCloud(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/point-clouds`);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.response);
        return;
      }
      reject(new Error(xhr.response?.detail || `Upload failed: ${xhr.status}`));
    };
    xhr.send(form);
  });
}

export async function getDownloadUrl(id, { download = false } = {}) {
  const suffix = download ? "?download=true" : "";
  const res = await fetch(`${API_BASE}/api/point-clouds/${id}/download-url${suffix}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Download URL failed: ${res.status}`);
  return (await res.json()).url;
}
