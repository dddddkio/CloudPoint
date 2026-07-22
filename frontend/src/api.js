const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export async function listPointClouds() {
  const res = await fetch(`${API_BASE}/api/point-clouds`);
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function uploadPointCloud(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/point-clouds`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function getDownloadUrl(id) {
  const res = await fetch(`${API_BASE}/api/point-clouds/${id}/download-url`);
  if (!res.ok) throw new Error(`Download URL failed: ${res.status}`);
  return (await res.json()).url;
}
